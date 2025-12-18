// script.js - ETH/BTC Liquidity Turnover Dashboard
// Final Assembled Version

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Logs a message to the console with a timestamp and type.
 * @param {string} message - The message to log.
 * @param {string} [type='info'] - The type of message (info, success, warn, error).
 */
function logMessage(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    
    switch (type) {
        case 'error':
            console.error(prefix, message);
            break;
        case 'warn':
            console.warn(prefix, message);
            break;
        case 'success':
            console.log('%c' + prefix + ' ' + message, 'color: #4caf50');
            break;
        default:
            console.log(prefix, message);
    }
}

// =================================================================
// DATA FETCHING MODULE
// =================================================================

// A simple in-memory cache to avoid re-fetching data within the same session
const dataCache = new Map();

/**
 * Fetches data from a URL with an AbortController for timeout and cancellation.
 * @param {string} url - The URL to fetch from.
 * @param {number} [timeout=15000] - The timeout in milliseconds.
 * @returns {Promise<object|null>} The JSON response or null if an error occurs.
 */
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            logMessage(`Fetch failed for ${url}: ${response.status} ${response.statusText}`, 'warn');
            return null;
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            logMessage(`Fetch timed out for ${url}`, 'warn');
        } else {
            logMessage(`Fetch error for ${url}: ${error.message}`, 'error');
        }
        return null;
    }
}

/**
 * Fetches pools from GeckoTerminal for a specific chain.
 * @param {string} chainName - The internal chain name (e.g., 'ethereum', 'base').
 * @returns {Promise<Array<object>>} An array of raw pool data objects.
 */
async function fetchGeckoTerminalPools(chainName) {
    const geckoChainId = CONFIG.CHAIN_TO_GECKO_ID[chainName];
    if (!geckoChainId) {
        logMessage(`No GeckoTerminal chain ID mapping for: ${chainName}`, 'warn');
        return [];
    }

    const cacheKey = `gt-${geckoChainId}`;
    if (dataCache.has(cacheKey)) {
        logMessage(`Returning cached GeckoTerminal data for ${chainName}`, 'info');
        return dataCache.get(cacheKey);
    }

    const url = `${CONFIG.DATA_SOURCES.GeckoTerminal.baseUrl}/networks/${geckoChainId}/pools?page=1`;
    logMessage(`Fetching from GeckoTerminal for chain: ${chainName} (${geckoChainId})`, 'info');

    const data = await fetchWithTimeout(url);

    if (data && data.data && Array.isArray(data.data)) {
        const relevantPools = data.data.filter(pool => {
            const attrs = pool.attributes || {};
            const baseSymbol = (attrs.base_token_symbol || '').toLowerCase();
            const quoteSymbol = (attrs.quote_token_symbol || '').toLowerCase();

            const isBtcOrEth = 
                CONFIG.ASSET_CLASSES.BTC.some(s => baseSymbol.includes(s)) ||
                CONFIG.ASSET_CLASSES.ETH.some(s => baseSymbol.includes(s));

            const isStableOrEth = 
                CONFIG.ASSET_CLASSES.STABLE.some(s => quoteSymbol.includes(s)) ||
                CONFIG.ASSET_CLASSES.ETH.some(s => quoteSymbol.includes(s));

            return isBtcOrEth && isStableOrEth;
        });

        dataCache.set(cacheKey, relevantPools);
        return relevantPools;
    }

    logMessage(`No valid pool data found from GeckoTerminal for ${chainName}`, 'warn');
    return [];
}

/**
 * Fetches pools from DexScreener using search queries.
 * @returns {Promise<Array<object>>} An array of raw pool data objects.
 */
async function fetchDexScreenerPools() {
    const cacheKey = 'ds-general';
    if (dataCache.has(cacheKey)) {
        logMessage('Returning cached DexScreener data.', 'info');
        return dataCache.get(cacheKey);
    }

    const searchQueries = ['WBTC', 'WETH'];
    const allPools = [];

    for (const query of searchQueries) {
        const url = `${CONFIG.DATA_SOURCES.DexScreener.baseUrl}/search?q=${query}`;
        logMessage(`Fetching from DexScreener for query: ${query}`, 'info');

        const data = await fetchWithTimeout(url);
        if (data && data.pairs && Array.isArray(data.pairs)) {
            allPools.push(...data.pairs);
        }
    }

    // Filter to only include pools on our supported chains
    const supportedChains = [...CONFIG.HIGH_CONFIDENCE_CHAINS, ...CONFIG.MEDIUM_CONFIDENCE_CHAINS];
    const filteredPools = allPools.filter(pool => {
        const chainId = (pool.chainId || '').toLowerCase();
        const normalizedChain = CONFIG.CHAIN_ID_MAP[chainId];
        return normalizedChain && supportedChains.includes(normalizedChain);
    });

    dataCache.set(cacheKey, filteredPools);
    return filteredPools;
}

/**
 * Main orchestrator for fetching data from all sources.
 * @returns {Promise<Array<object>>} An array of raw pool data objects from all sources.
 */
async function fetchAllPoolData() {
    const allRawPools = [];
    const sourceRank = CONFIG.DATA_SOURCES.GeckoTerminal.rank;

    // 1. Try GeckoTerminal for all configured chains
    logMessage('Attempting to fetch from GeckoTerminal...', 'info');
    const chainsToFetch = [...CONFIG.HIGH_CONFIDENCE_CHAINS, ...CONFIG.MEDIUM_CONFIDENCE_CHAINS];

    for (const chain of chainsToFetch) {
        try {
            const pools = await fetchGeckoTerminalPools(chain);
            if (pools.length > 0) {
                allRawPools.push(...pools.map(p => ({
                    ...p,
                    _source: 'GeckoTerminal',
                    _sourceRank: sourceRank,
                    _chain: chain
                })));
            }
        } catch (err) {
            logMessage(`Error fetching GeckoTerminal for ${chain}: ${err.message}`, 'error');
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (allRawPools.length > 0) {
        logMessage(`Successfully fetched ${allRawPools.length} pools from GeckoTerminal.`, 'success');
        return allRawPools;
    }

    // 2. Fallback to DexScreener
    logMessage('GeckoTerminal returned no data. Falling back to DexScreener...', 'warn');
    try {
        const dsPools = await fetchDexScreenerPools();
        if (dsPools.length > 0) {
            allRawPools.push(...dsPools.map(p => ({
                ...p,
                _source: 'DexScreener',
                _sourceRank: CONFIG.DATA_SOURCES.DexScreener.rank
            })));
            logMessage(`Successfully fetched ${allRawPools.length} pools from DexScreener.`, 'success');
            return allRawPools;
        }
    } catch (err) {
        logMessage(`Error fetching DexScreener: ${err.message}`, 'error');
    }

    logMessage('All sources failed. Returning empty array.', 'error');
    return [];
}

// =================================================================
// NORMALIZATION & RESOLUTION
// =================================================================

/**
 * Determines the canonical asset class (BTC, ETH, STABLE) for a given token symbol.
 * @param {string} symbol - The token symbol.
 * @returns {string|null} The canonical asset class or null.
 */
function resolveAssetClass(symbol) {
    if (!symbol) return null;
    const lowerSymbol = symbol.toLowerCase();

    for (const assetClass in CONFIG.ASSET_CLASSES) {
        if (CONFIG.ASSET_CLASSES[assetClass].some(altSymbol => lowerSymbol.includes(altSymbol))) {
            return assetClass;
        }
    }
    return null;
}

/**
 * Normalizes a GeckoTerminal pool object into the canonical data contract.
 * @param {object} pool - The raw pool object.
 * @returns {object|null} The normalized pool object or null.
 */
function normalizeGeckoTerminalPool(pool) {
    const attrs = pool.attributes || {};
    const baseSymbol = attrs.base_token_symbol || '';
    const quoteSymbol = attrs.quote_token_symbol || '';

    const baseAssetClass = resolveAssetClass(baseSymbol);
    const quoteAssetClass = resolveAssetClass(quoteSymbol);

    // Validate pair type
    const isValidPair =
        (baseAssetClass === 'BTC' || baseAssetClass === 'ETH') &&
        (quoteAssetClass === 'STABLE' || quoteAssetClass === 'ETH');

    if (!isValidPair) return null;

    // Prevent ETH/ETH pairs
    if (baseAssetClass === 'ETH' && quoteAssetClass === 'ETH') return null;

    const chainName = pool._chain || CONFIG.CHAIN_ID_MAP[attrs.network_id] || attrs.network_id || 'unknown';
    const assetConfidence = CONFIG.HIGH_CONFIDENCE_CHAINS.includes(chainName) ? 'high' : 'medium';

    const liquidityUsd = parseFloat(attrs.reserve_in_usd) || 0;
    const volumeUsd24h = parseFloat(attrs.volume_usd?.h24) || 0;

    return {
        id: pool.id,
        name: attrs.name || `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        assetConfidence: assetConfidence,
        liquidityUsd: liquidityUsd,
        volumeUsd24h: volumeUsd24h,
        chain: chainName,
        protocol: attrs.dex_id || 'unknown',
        ammType: 'unknown',
        feeTier: null,
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        poolUrl: attrs.pool_created_at ? `https://www.geckoterminal.com/${CONFIG.CHAIN_TO_GECKO_ID[chainName] || chainName}/pools/${pool.id}` : null,
        rawData: pool
    };
}

/**
 * Normalizes a DexScreener pool object into the canonical data contract.
 * @param {object} pool - The raw pool object.
 * @returns {object|null} The normalized pool object or null.
 */
function normalizeDexScreenerPool(pool) {
    const baseToken = pool.baseToken || {};
    const quoteToken = pool.quoteToken || {};
    const baseSymbol = baseToken.symbol || '';
    const quoteSymbol = quoteToken.symbol || '';

    const baseAssetClass = resolveAssetClass(baseSymbol);
    const quoteAssetClass = resolveAssetClass(quoteSymbol);

    const isValidPair =
        (baseAssetClass === 'BTC' || baseAssetClass === 'ETH') &&
        (quoteAssetClass === 'STABLE' || quoteAssetClass === 'ETH');

    if (!isValidPair) return null;
    if (baseAssetClass === 'ETH' && quoteAssetClass === 'ETH') return null;

    const chainName = CONFIG.CHAIN_ID_MAP[(pool.chainId || '').toLowerCase()] || pool.chainId || 'unknown';
    const assetConfidence = CONFIG.HIGH_CONFIDENCE_CHAINS.includes(chainName) ? 'high' : 'medium';

    return {
        id: pool.pairAddress,
        name: `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        assetConfidence: assetConfidence,
        liquidityUsd: parseFloat(pool.liquidity?.usd) || 0,
        volumeUsd24h: parseFloat(pool.volume?.h24) || 0,
        chain: chainName,
        protocol: pool.dexId || 'unknown',
        ammType: 'unknown',
        feeTier: null,
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        poolUrl: pool.url || null,
        rawData: pool
    };
}

/**
 * Normalizes all raw pool data from various sources.
 * @param {Array<object>} rawPools - Array of raw pool data.
 * @returns {Array<object>} Array of normalized pool objects.
 */
function normalizeAllPools(rawPools) {
    if (!rawPools || rawPools.length === 0) {
        logMessage('No raw pools provided for normalization.', 'warn');
        return [];
    }

    const normalizedPools = rawPools
        .map(pool => {
            if (pool._source === 'GeckoTerminal') {
                return normalizeGeckoTerminalPool(pool);
            } else if (pool._source === 'DexScreener') {
                return normalizeDexScreenerPool(pool);
            }
            logMessage(`Unknown source for pool: ${pool._source}`, 'warn');
            return null;
        })
        .filter(pool => pool !== null);

    logMessage(`Normalized ${normalizedPools.length} pools from ${rawPools.length} raw entries.`, 'info');
    return normalizedPools;
}

// =================================================================
// VALIDATION & SCORING
// =================================================================

/**
 * Validates a pool object against project constraints.
 * @param {object} pool - The pool object to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validatePool(pool) {
    // Check required fields
    const requiredFields = ['id', 'name', 'baseAsset', 'liquidityUsd', 'volumeUsd24h', 'chain', 'protocol'];
    for (const field of requiredFields) {
        if (pool[field] === undefined || pool[field] === null) {
            return false;
        }
    }

    // Validate data types
    if (typeof pool.id !== 'string' || typeof pool.name !== 'string' || typeof pool.chain !== 'string') {
        return false;
    }
    if (typeof pool.liquidityUsd !== 'number' || typeof pool.volumeUsd24h !== 'number') {
        return false;
    }

    // Validate asset classes (baseAsset should be BTC, ETH, or STABLE)
    const validAssetClasses = ['BTC', 'ETH', 'STABLE'];
    if (!validAssetClasses.includes(pool.baseAsset)) {
        return false;
    }
    if (pool.quoteAsset && !validAssetClasses.includes(pool.quoteAsset)) {
        return false;
    }

    // Apply numerical filters
    if (pool.liquidityUsd < CONFIG.MIN_LIQUIDITY) {
        return false;
    }
    if (pool.volumeUsd24h < CONFIG.MIN_VOLUME_24H) {
        return false;
    }

    // Ensure no zero-division for scoring
    if (pool.liquidityUsd <= 0) {
        return false;
    }

    return true;
}

/**
 * Filters pools to only include valid ones.
 * @param {Array<object>} pools - Array of pool objects.
 * @returns {Array<object>} Array of valid pools.
 */
function filterPools(pools) {
    if (!Array.isArray(pools)) {
        logMessage('filterPools received a non-array input.', 'error');
        return [];
    }

    const validPools = pools.filter(pool => validatePool(pool));
    logMessage(`Filtered down to ${validPools.length} valid pools from ${pools.length} entries.`, 'info');
    return validPools;
}

/**
 * Calculates the Liquidity Turnover Ratio for a pool.
 * @param {object} pool - The pool object.
 * @returns {number} The calculated score.
 */
function calculateTurnoverScore(pool) {
    if (pool.liquidityUsd <= 0) return 0;
    return pool.volumeUsd24h / pool.liquidityUsd;
}

/**
 * Scores and ranks pools by turnover ratio.
 * @param {Array<object>} pools - Array of validated pool objects.
 * @returns {Array<object>} Scored and sorted array of pools.
 */
function scoreAndRankPools(pools) {
    const scoredPools = pools.map(pool => ({
        ...pool,
        score: calculateTurnoverScore(pool)
    }));

    // Sort by score descending, then by liquidity as tie-breaker
    scoredPools.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return b.liquidityUsd - a.liquidityUsd;
    });

    logMessage(`Scored and ranked ${scoredPools.length} pools.`, 'info');
    return scoredPools;
}

// =================================================================
// UI RENDERING
// =================================================================

/**
 * Renders the pool data into the main table.
 * @param {Array<object>} pools - Array of scored and ranked pool objects.
 */
function renderPoolTable(pools) {
    const tableBody = document.getElementById('pool-table-body');
    const noDataMessage = document.getElementById('no-data-message');

    tableBody.innerHTML = '';

    if (!pools || pools.length === 0) {
        noDataMessage.classList.remove('hidden');
        return;
    }

    noDataMessage.classList.add('hidden');

    pools.forEach(pool => {
        const row = document.createElement('tr');

        // Pool Name & Link
        const nameCell = document.createElement('td');
        nameCell.className = 'pool-name-cell';
        if (pool.poolUrl) {
            const link = document.createElement('a');
            link.href = pool.poolUrl;
            link.textContent = pool.name;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'pool-link';
            nameCell.appendChild(link);
        } else {
            nameCell.textContent = pool.name;
        }
        row.appendChild(nameCell);

        // Chain
        const chainCell = document.createElement('td');
        chainCell.textContent = pool.chain;
        row.appendChild(chainCell);

        // Protocol
        const protocolCell = document.createElement('td');
        protocolCell.textContent = pool.protocol;
        row.appendChild(protocolCell);

        // Assets with badges
        const assetsCell = document.createElement('td');
        const baseBadge = document.createElement('span');
        baseBadge.className = `asset-badge ${pool.baseAsset.toLowerCase()}`;
        baseBadge.textContent = pool.baseAsset;
        assetsCell.appendChild(baseBadge);

        if (pool.quoteAsset) {
            const quoteBadge = document.createElement('span');
            quoteBadge.className = `asset-badge ${pool.quoteAsset.toLowerCase()}`;
            quoteBadge.textContent = pool.quoteAsset;
            assetsCell.appendChild(quoteBadge);
        }
        row.appendChild(assetsCell);

        // Liquidity
        const liquidityCell = document.createElement('td');
        liquidityCell.textContent = `$${pool.liquidityUsd.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
        row.appendChild(liquidityCell);

        // Volume 24h
        const volumeCell = document.createElement('td');
        volumeCell.textContent = `$${pool.volumeUsd24h.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
        row.appendChild(volumeCell);

        // Turnover Ratio
        const scoreCell = document.createElement('td');
        scoreCell.textContent = pool.score.toFixed(3);
        row.appendChild(scoreCell);

        // Source
        const sourceCell = document.createElement('td');
        sourceCell.className = 'source-badge';
        sourceCell.textContent = pool.source;
        row.appendChild(sourceCell);

        tableBody.appendChild(row);
    });
}

/**
 * Updates the status bar with a message and type.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The type (info, success, error, warning).
 */
function updateStatusBar(message, type = 'info') {
    const statusBar = document.getElementById('status-bar');
    const statusMessage = document.getElementById('status-message');

    statusMessage.textContent = message;
    statusBar.className = ''; // Reset classes
    statusBar.classList.add(type);
}

/**
 * Updates the last updated timestamp.
 */
function updateLastUpdatedTime() {
    const timestampElement = document.getElementById('last-updated');
    const now = new Date();
    timestampElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

/**
 * Toggles the loading spinner visibility.
 * @param {boolean} isVisible - True to show, false to hide.
 */
function toggleLoader(isVisible) {
    const loader = document.getElementById('loading-spinner');
    if (isVisible) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

/**
 * Sets up click handlers for table headers to enable sorting.
 */
function setupTableSorting() {
    const headers = document.querySelectorAll('#pool-table th[data-sort]');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;
            sortTableByKey(sortKey);
        });
    });
}

// Store current pools for re-sorting
let currentPools = [];

/**
 * Sorts the current pools by a given key and re-renders.
 * @param {string} sortKey - The key to sort by.
 */
function sortTableByKey(sortKey) {
    if (currentPools.length === 0) return;

    // Determine sort direction
    const currentSortKey = document.body.dataset.sortKey;
    const currentOrder = document.body.dataset.sortOrder || 'desc';

    let newOrder = 'desc';
    if (currentSortKey === sortKey && currentOrder === 'desc') {
        newOrder = 'asc';
    }

    document.body.dataset.sortKey = sortKey;
    document.body.dataset.sortOrder = newOrder;

    // Sort pools
    currentPools.sort((a, b) => {
        let aVal, bVal;

        switch (sortKey) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'chain':
                aVal = a.chain.toLowerCase();
                bVal = b.chain.toLowerCase();
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'protocol':
                aVal = a.protocol.toLowerCase();
                bVal = b.protocol.toLowerCase();
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'assets':
                aVal = a.baseAsset;
                bVal = b.baseAsset;
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'liquidityUsd':
                aVal = a.liquidityUsd;
                bVal = b.liquidityUsd;
                break;
            case 'volumeUsd24h':
                aVal = a.volumeUsd24h;
                bVal = b.volumeUsd24h;
                break;
            case 'score':
            default:
                aVal = a.score;
                bVal = b.score;
                break;
        }

        if (newOrder === 'asc') {
            return aVal - bVal;
        }
        return bVal - aVal;
    });

    renderPoolTable(currentPools);
}

// =================================================================
// ORCHESTRATION
// =================================================================

let refreshIntervalId = null;

/**
 * Main application function. Orchestrates fetching, processing, and rendering.
 */
async function mainApp() {
    logMessage('Starting dashboard refresh...', 'info');
    toggleLoader(true);
    updateStatusBar('Fetching data from sources...', 'info');

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
        // 1. Fetch data from all sources
        const allRawPools = await fetchAllPoolData();

        if (allRawPools.length === 0) {
            throw new Error('All data sources failed to return pool data.');
        }

        updateStatusBar('Processing and normalizing data...', 'info');

        // 2. Normalize the data
        const normalizedPools = normalizeAllPools(allRawPools);

        // 3. Filter out invalid pools
        const validPools = filterPools(normalizedPools);

        // 4. Score and rank the pools
        const rankedPools = scoreAndRankPools(validPools);

        // Store for re-sorting
        currentPools = rankedPools;

        // 5. Render the final data
        renderPoolTable(rankedPools);

        updateStatusBar(`Successfully loaded ${rankedPools.length} pools.`, 'success');
        updateLastUpdatedTime();

    } catch (error) {
        console.error('Dashboard application failed:', error);
        logMessage(`An error occurred: ${error.message}`, 'error');
        updateStatusBar(`Error: ${error.message}`, 'error');
        renderPoolTable([]);
    } finally {
        toggleLoader(false);
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

/**
 * Starts the automatic refresh interval.
 */
function startAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }

    refreshIntervalId = setInterval(() => {
        logMessage('Auto-refreshing data...', 'info');
        mainApp();
    }, CONFIG.UPDATE_INTERVAL_MS);

    logMessage(`Auto-refresh started (interval: ${CONFIG.UPDATE_INTERVAL_MS / 1000}s).`, 'info');
}

/**
 * Stops the automatic refresh interval.
 */
function stopAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
        logMessage('Auto-refresh stopped.', 'info');
    }
}

/**
 * Clears the data cache.
 */
function clearCache() {
    dataCache.clear();
    logMessage('Data cache cleared.', 'info');
}

/**
 * Initializes the dashboard when DOM is ready.
 */
function initializeDashboard() {
    logMessage('DOM loaded. Initializing dashboard.', 'info');

    // Attach refresh button listener
    const refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            logMessage('Manual refresh triggered by user.', 'info');
            clearCache();
            stopAutoRefresh();
            mainApp().finally(() => startAutoRefresh());
        });
    }

    // Setup table sorting
    setupTableSorting();

    // Initial run
    mainApp();

    // Start auto-refresh
    startAutoRefresh();
}

// --- EVENT LISTENER FOR DOM READY ---
document.addEventListener('DOMContentLoaded', initializeDashboard);