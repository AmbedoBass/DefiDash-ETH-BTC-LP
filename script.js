// script.js - ETH/BTC Liquidity Turnover Dashboard
// Sectioned Version with Enhanced Data Fetching

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Logs a message to the console with a timestamp and type.
 */
function logMessage(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    switch (type) {
        case 'error': console.error(prefix, message); break;
        case 'warn': console.warn(prefix, message); break;
        case 'success': console.log('%c' + prefix + ' ' + message, 'color: #4caf50'); break;
        default: console.log(prefix, message);
    }
}

/**
 * Delays execution for a given number of milliseconds.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =================================================================
// DATA FETCHING MODULE
// =================================================================

const dataCache = new Map();

/**
 * Fetches data from a URL with timeout and error handling.
 */
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
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
 * Fetches multiple pages of pools from GeckoTerminal for a chain.
 */
async function fetchGeckoTerminalPoolsForChain(chainName) {
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

    const allPools = [];
    const maxPages = CONFIG.GECKO_MAX_PAGES || 3;

    for (let page = 1; page <= maxPages; page++) {
        const url = `${CONFIG.DATA_SOURCES.GeckoTerminal.baseUrl}/networks/${geckoChainId}/pools?page=${page}`;
        logMessage(`Fetching GeckoTerminal ${chainName} page ${page}...`, 'info');

        const data = await fetchWithTimeout(url);
        
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
            allPools.push(...data.data);
            
            // If we got fewer than expected, no more pages
            if (data.data.length < 20) break;
        } else {
            break;
        }

        // Rate limiting delay between pages
        if (page < maxPages) await delay(150);
    }

    if (allPools.length > 0) {
        dataCache.set(cacheKey, allPools);
        logMessage(`GeckoTerminal ${chainName}: fetched ${allPools.length} pools`, 'success');
    }

    return allPools;
}

/**
 * Fetches pools from GeckoTerminal using token search.
 */
async function fetchGeckoTerminalTokenSearch(query) {
    const cacheKey = `gt-search-${query}`;
    if (dataCache.has(cacheKey)) {
        return dataCache.get(cacheKey);
    }

    const url = `${CONFIG.DATA_SOURCES.GeckoTerminal.baseUrl}/search/pools?query=${encodeURIComponent(query)}&page=1`;
    logMessage(`GeckoTerminal search for: ${query}`, 'info');

    const data = await fetchWithTimeout(url);
    
    if (data && data.data && Array.isArray(data.data)) {
        dataCache.set(cacheKey, data.data);
        return data.data;
    }

    return [];
}

/**
 * Fetches pools from DexScreener using multiple search queries.
 */
async function fetchDexScreenerPools() {
    const cacheKey = 'ds-all';
    if (dataCache.has(cacheKey)) {
        logMessage('Returning cached DexScreener data.', 'info');
        return dataCache.get(cacheKey);
    }

    const allPools = [];
    const seenPairs = new Set();
    const queries = CONFIG.DEXSCREENER_QUERIES || ['WBTC', 'WETH'];

    for (const query of queries) {
        const url = `${CONFIG.DATA_SOURCES.DexScreener.baseUrl}/search?q=${encodeURIComponent(query)}`;
        logMessage(`DexScreener search: ${query}`, 'info');

        const data = await fetchWithTimeout(url);
        
        if (data && data.pairs && Array.isArray(data.pairs)) {
            for (const pair of data.pairs) {
                // Deduplicate by pair address
                if (!seenPairs.has(pair.pairAddress)) {
                    seenPairs.add(pair.pairAddress);
                    allPools.push(pair);
                }
            }
        }

        await delay(100); // Rate limiting
    }

    dataCache.set(cacheKey, allPools);
    logMessage(`DexScreener: fetched ${allPools.length} unique pools`, 'success');
    return allPools;
}

/**
 * Main orchestrator for fetching data from all sources.
 */
async function fetchAllPoolData() {
    const allRawPools = [];

    // 1. Fetch from GeckoTerminal for all chains
    logMessage('Fetching from GeckoTerminal...', 'info');
    const chainsToFetch = [...CONFIG.HIGH_CONFIDENCE_CHAINS, ...CONFIG.MEDIUM_CONFIDENCE_CHAINS];

    for (const chain of chainsToFetch) {
        try {
            const pools = await fetchGeckoTerminalPoolsForChain(chain);
            if (pools.length > 0) {
                allRawPools.push(...pools.map(p => ({
                    ...p,
                    _source: 'GeckoTerminal',
                    _sourceRank: CONFIG.DATA_SOURCES.GeckoTerminal.rank,
                    _chain: chain
                })));
            }
        } catch (err) {
            logMessage(`Error fetching GeckoTerminal for ${chain}: ${err.message}`, 'error');
        }
        await delay(200);
    }

    // 2. Also do token searches on GeckoTerminal for better coverage
    const tokenSearches = ['WBTC', 'cbBTC', 'tBTC', 'WETH', 'stETH', 'wstETH'];
    for (const token of tokenSearches) {
        try {
            const pools = await fetchGeckoTerminalTokenSearch(token);
            if (pools.length > 0) {
                allRawPools.push(...pools.map(p => ({
                    ...p,
                    _source: 'GeckoTerminal',
                    _sourceRank: CONFIG.DATA_SOURCES.GeckoTerminal.rank,
                    _chain: p.attributes?.network || 'unknown'
                })));
            }
        } catch (err) {
            logMessage(`Error in GeckoTerminal search for ${token}: ${err.message}`, 'error');
        }
        await delay(150);
    }

    logMessage(`GeckoTerminal total raw: ${allRawPools.length} pools`, 'info');

    // 3. Fetch from DexScreener
    logMessage('Fetching from DexScreener...', 'info');
    try {
        const dsPools = await fetchDexScreenerPools();
        if (dsPools.length > 0) {
            allRawPools.push(...dsPools.map(p => ({
                ...p,
                _source: 'DexScreener',
                _sourceRank: CONFIG.DATA_SOURCES.DexScreener.rank
            })));
        }
    } catch (err) {
        logMessage(`Error fetching DexScreener: ${err.message}`, 'error');
    }

    logMessage(`Total raw pools from all sources: ${allRawPools.length}`, 'info');
    return allRawPools;
}

// =================================================================
// NORMALIZATION & RESOLUTION
// =================================================================

/**
 * Determines the canonical asset class for a token symbol.
 */
function resolveAssetClass(symbol) {
    if (!symbol) return null;
    const lowerSymbol = symbol.toLowerCase();
    
    for (const assetClass in CONFIG.ASSET_CLASSES) {
        if (CONFIG.ASSET_CLASSES[assetClass].some(alt => lowerSymbol.includes(alt))) {
            return assetClass;
        }
    }
    return null;
}

/**
 * Determines the pair type for a pool based on its assets.
 */
function determinePairType(baseAsset, quoteAsset) {
    if (baseAsset === 'BTC' && quoteAsset === 'STABLE') return 'btc-stable';
    if (baseAsset === 'ETH' && quoteAsset === 'STABLE') return 'eth-stable';
    if (baseAsset === 'BTC' && quoteAsset === 'ETH') return 'btc-eth';
    if (baseAsset === 'ETH' && quoteAsset === 'BTC') return 'btc-eth'; // ETH/BTC same as BTC/ETH
    // Handle reversed pairs
    if (baseAsset === 'STABLE' && quoteAsset === 'BTC') return 'btc-stable';
    if (baseAsset === 'STABLE' && quoteAsset === 'ETH') return 'eth-stable';
    return null;
}

/**
 * Normalizes a GeckoTerminal pool object.
 */
function normalizeGeckoTerminalPool(pool) {
    const attrs = pool.attributes || {};
    const baseSymbol = attrs.base_token_symbol || '';
    const quoteSymbol = attrs.quote_token_symbol || '';

    let baseAssetClass = resolveAssetClass(baseSymbol);
    let quoteAssetClass = resolveAssetClass(quoteSymbol);

    // Swap if needed to normalize pair direction
    if (quoteAssetClass === 'BTC' || (quoteAssetClass === 'ETH' && baseAssetClass === 'STABLE')) {
        [baseAssetClass, quoteAssetClass] = [quoteAssetClass, baseAssetClass];
    }

    const pairType = determinePairType(baseAssetClass, quoteAssetClass);
    if (!pairType) return null;

    // Prevent same-asset pairs
    if (baseAssetClass === quoteAssetClass) return null;

    let chainName = pool._chain;
    if (!chainName || chainName === 'unknown') {
        const networkId = attrs.network?.identifier || attrs.network_id || '';
        chainName = CONFIG.CHAIN_ID_MAP[networkId] || networkId || 'unknown';
    }

    const liquidityUsd = parseFloat(attrs.reserve_in_usd) || 0;
    const volumeUsd24h = parseFloat(attrs.volume_usd?.h24) || 0;

    return {
        id: pool.id || `gt-${Math.random().toString(36).substr(2, 9)}`,
        name: attrs.name || `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        pairType: pairType,
        liquidityUsd: liquidityUsd,
        volumeUsd24h: volumeUsd24h,
        chain: chainName,
        protocol: attrs.dex?.identifier || attrs.dex_id || 'unknown',
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        poolUrl: attrs.pool_url || (pool.id ? `https://www.geckoterminal.com/${CONFIG.CHAIN_TO_GECKO_ID[chainName] || chainName}/pools/${pool.id.split('_').pop()}` : null)
    };
}

/**
 * Normalizes a DexScreener pool object.
 */
function normalizeDexScreenerPool(pool) {
    const baseToken = pool.baseToken || {};
    const quoteToken = pool.quoteToken || {};
    const baseSymbol = baseToken.symbol || '';
    const quoteSymbol = quoteToken.symbol || '';

    let baseAssetClass = resolveAssetClass(baseSymbol);
    let quoteAssetClass = resolveAssetClass(quoteSymbol);

    // Swap if needed to normalize pair direction
    if (quoteAssetClass === 'BTC' || (quoteAssetClass === 'ETH' && baseAssetClass === 'STABLE')) {
        [baseAssetClass, quoteAssetClass] = [quoteAssetClass, baseAssetClass];
    }

    const pairType = determinePairType(baseAssetClass, quoteAssetClass);
    if (!pairType) return null;

    if (baseAssetClass === quoteAssetClass) return null;

    const chainName = CONFIG.CHAIN_ID_MAP[(pool.chainId || '').toLowerCase()] || pool.chainId || 'unknown';

    return {
        id: pool.pairAddress,
        name: `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        pairType: pairType,
        liquidityUsd: parseFloat(pool.liquidity?.usd) || 0,
        volumeUsd24h: parseFloat(pool.volume?.h24) || 0,
        chain: chainName,
        protocol: pool.dexId || 'unknown',
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        poolUrl: pool.url || null
    };
}

/**
 * Normalizes all raw pool data from various sources.
 */
function normalizeAllPools(rawPools) {
    if (!rawPools || rawPools.length === 0) {
        logMessage('No raw pools provided for normalization.', 'warn');
        return [];
    }

    const normalizedPools = [];
    const seenIds = new Set();

    for (const pool of rawPools) {
        let normalized = null;

        if (pool._source === 'GeckoTerminal') {
            normalized = normalizeGeckoTerminalPool(pool);
        } else if (pool._source === 'DexScreener') {
            normalized = normalizeDexScreenerPool(pool);
        }

        if (normalized && !seenIds.has(normalized.id)) {
            seenIds.add(normalized.id);
            normalizedPools.push(normalized);
        }
    }

    logMessage(`Normalized ${normalizedPools.length} unique pools from ${rawPools.length} raw entries.`, 'info');
    return normalizedPools;
}

// =================================================================
// VALIDATION & SCORING
// =================================================================

/**
 * Validates a pool object against project constraints.
 */
function validatePool(pool) {
    if (!pool.id || !pool.name || !pool.baseAsset || !pool.pairType) return false;
    if (typeof pool.liquidityUsd !== 'number' || typeof pool.volumeUsd24h !== 'number') return false;
    if (pool.liquidityUsd < CONFIG.MIN_LIQUIDITY) return false;
    if (pool.volumeUsd24h < CONFIG.MIN_VOLUME_24H) return false;
    if (pool.liquidityUsd <= 0) return false;
    return true;
}

/**
 * Filters pools to only include valid ones.
 */
function filterPools(pools) {
    const validPools = pools.filter(pool => validatePool(pool));
    logMessage(`Filtered to ${validPools.length} valid pools from ${pools.length} entries.`, 'info');
    return validPools;
}

/**
 * Calculates the Liquidity Turnover Ratio for a pool.
 */
function calculateTurnoverScore(pool) {
    if (pool.liquidityUsd <= 0) return 0;
    return pool.volumeUsd24h / pool.liquidityUsd;
}

/**
 * Scores and ranks pools by turnover ratio.
 */
function scoreAndRankPools(pools) {
    const scoredPools = pools.map(pool => ({
        ...pool,
        score: calculateTurnoverScore(pool)
    }));

    scoredPools.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.liquidityUsd - a.liquidityUsd;
    });

    return scoredPools;
}

/**
 * Categorizes pools by pair type.
 */
function categorizePools(pools) {
    const categories = {
        'btc-stable': [],
        'eth-stable': [],
        'btc-eth': []
    };

    for (const pool of pools) {
        if (categories[pool.pairType]) {
            categories[pool.pairType].push(pool);
        }
    }

    // Sort each category
    for (const key in categories) {
        categories[key] = scoreAndRankPools(categories[key]);
    }

    return categories;
}

// =================================================================
// UI RENDERING
// =================================================================

/**
 * Renders pools into a specific table body.
 */
function renderPoolsToTable(pools, tableBodyId, noDataId, countId) {
    const tableBody = document.getElementById(tableBodyId);
    const noDataMessage = document.getElementById(noDataId);
    const countElement = document.getElementById(countId);

    if (!tableBody) {
        logMessage(`Table body not found: ${tableBodyId}`, 'error');
        return;
    }

    tableBody.innerHTML = '';

    if (countElement) {
        countElement.textContent = `(${pools.length})`;
    }

    if (!pools || pools.length === 0) {
        if (noDataMessage) noDataMessage.classList.remove('hidden');
        return;
    }

    if (noDataMessage) noDataMessage.classList.add('hidden');

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

        // Assets
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
        liquidityCell.textContent = `$${pool.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        row.appendChild(liquidityCell);

        // Volume 24h
        const volumeCell = document.createElement('td');
        volumeCell.textContent = `$${pool.volumeUsd24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
 * Renders all categorized pools to their respective sections.
 */
function renderAllSections(categorizedPools) {
    renderPoolsToTable(
        categorizedPools['btc-stable'],
        'btc-stable-table-body',
        'btc-stable-no-data',
        'btc-stable-count'
    );

    renderPoolsToTable(
        categorizedPools['eth-stable'],
        'eth-stable-table-body',
        'eth-stable-no-data',
        'eth-stable-count'
    );

    renderPoolsToTable(
        categorizedPools['btc-eth'],
        'btc-eth-table-body',
        'btc-eth-no-data',
        'btc-eth-count'
    );
}

/**
 * Updates the status bar.
 */
function updateStatusBar(message, type = 'info') {
    const statusBar = document.getElementById('status-bar');
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = message;
    statusBar.className = type;
}

/**
 * Updates the last updated timestamp.
 */
function updateLastUpdatedTime() {
    const el = document.getElementById('last-updated');
    el.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

/**
 * Toggles the loading spinner.
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
 * Sets up section collapse functionality.
 */
function setupSectionCollapse() {
    const headers = document.querySelectorAll('.section-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.pair-section');
            section.classList.toggle('collapsed');
        });
    });
}

/**
 * Sets up table sorting for all sections.
 */
function setupTableSorting() {
    const headers = document.querySelectorAll('.pool-table th[data-sort]');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;
            const sectionId = header.dataset.section;
            sortSectionByKey(sectionId, sortKey, header);
        });
    });
}

// Store categorized pools for re-sorting
let currentCategorizedPools = {};

/**
 * Sorts a specific section's pools by key.
 */
function sortSectionByKey(sectionId, sortKey, clickedHeader) {
    const pools = currentCategorizedPools[sectionId];
    if (!pools || pools.length === 0) return;

    // Determine sort direction
    const isCurrentlyDesc = clickedHeader.classList.contains('sort-desc');
    const newOrder = isCurrentlyDesc ? 'asc' : 'desc';

    // Clear sort indicators for this section
    const sectionHeaders = document.querySelectorAll(`th[data-section="${sectionId}"]`);
    sectionHeaders.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

    // Set new indicator
    clickedHeader.classList.add(newOrder === 'asc' ? 'sort-asc' : 'sort-desc');

    // Sort
    pools.sort((a, b) => {
        let aVal, bVal;

        switch (sortKey) {
            case 'name':
            case 'chain':
            case 'protocol':
                aVal = (a[sortKey] || '').toLowerCase();
                bVal = (b[sortKey] || '').toLowerCase();
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'assets':
                aVal = a.baseAsset;
                bVal = b.baseAsset;
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'liquidityUsd':
            case 'volumeUsd24h':
            case 'score':
            default:
                aVal = a[sortKey] || 0;
                bVal = b[sortKey] || 0;
                return newOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });

    // Re-render just this section
    const tableBodyId = `${sectionId}-table-body`;
    const noDataId = `${sectionId}-no-data`;
    const countId = `${sectionId}-count`;
    renderPoolsToTable(pools, tableBodyId, noDataId, countId);
}

// =================================================================
// ORCHESTRATION
// =================================================================

let refreshIntervalId = null;

/**
 * Main application function.
 */
async function mainApp() {
    logMessage('Starting dashboard refresh...', 'info');
    toggleLoader(true);
    updateStatusBar('Fetching data from sources...', 'info');

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
        // 1. Fetch data
        const allRawPools = await fetchAllPoolData();
        if (allRawPools.length === 0) {
            throw new Error('All data sources failed to return pool data.');
        }

        updateStatusBar('Processing and normalizing data...', 'info');

        // 2. Normalize
        const normalizedPools = normalizeAllPools(allRawPools);

        // 3. Filter
        const validPools = filterPools(normalizedPools);

        // 4. Categorize by pair type
        const categorizedPools = categorizePools(validPools);
        currentCategorizedPools = categorizedPools;

        // 5. Render
        renderAllSections(categorizedPools);

        const totalPools = Object.values(categorizedPools).reduce((sum, arr) => sum + arr.length, 0);
        updateStatusBar(`Successfully loaded ${totalPools} pools across ${Object.keys(categorizedPools).length} categories.`, 'success');
        updateLastUpdatedTime();

    } catch (error) {
        console.error('Dashboard application failed:', error);
        logMessage(`An error occurred: ${error.message}`, 'error');
        updateStatusBar(`Error: ${error.message}`, 'error');
        renderAllSections({ 'btc-stable': [], 'eth-stable': [], 'btc-eth': [] });
    } finally {
        toggleLoader(false);
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

/**
 * Starts auto-refresh.
 */
function startAutoRefresh() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    refreshIntervalId = setInterval(() => {
        logMessage('Auto-refreshing data...', 'info');
        mainApp();
    }, CONFIG.UPDATE_INTERVAL_MS);
    logMessage(`Auto-refresh started (interval: ${CONFIG.UPDATE_INTERVAL_MS / 1000}s).`, 'info');
}

/**
 * Stops auto-refresh.
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
 * Initializes the dashboard.
 */
function initializeDashboard() {
    logMessage('DOM loaded. Initializing dashboard.', 'info');

    // Refresh button
    const refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            logMessage('Manual refresh triggered.', 'info');
            clearCache();
            stopAutoRefresh();
            mainApp().finally(() => startAutoRefresh());
        });
    }

    // Section collapse
    setupSectionCollapse();

    // Table sorting
    setupTableSorting();

    // Initial run
    mainApp();

    // Start auto-refresh
    startAutoRefresh();
}

// --- EVENT LISTENER FOR DOM READY ---
document.addEventListener('DOMContentLoaded', initializeDashboard);
