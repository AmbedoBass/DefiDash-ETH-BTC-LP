// script.js - ETH/BTC Liquidity Turnover Dashboard
// Optimized Version with Parallel Fetching, Fees, and APR

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

/**
 * Calculates liquidity color and percentage for visual indicator.
 * Uses logarithmic scale: $50k (min) -> $100M+ (max)
 */
function getLiquidityIndicator(liquidityUsd) {
    const minLiq = 50000;
    const maxLiq = 100000000;
    
    const clampedLiq = Math.max(minLiq, Math.min(liquidityUsd, maxLiq));
    const logMin = Math.log10(minLiq);
    const logMax = Math.log10(maxLiq);
    const logVal = Math.log10(clampedLiq);
    
    const normalized = (logVal - logMin) / (logMax - logMin);
    const hue = Math.round(normalized * 240);
    
    let colorClass;
    if (normalized < 0.2) {
        colorClass = 'liquidity-low';
    } else if (normalized < 0.4) {
        colorClass = 'liquidity-mid-low';
    } else if (normalized < 0.6) {
        colorClass = 'liquidity-mid';
    } else if (normalized < 0.8) {
        colorClass = 'liquidity-mid-high';
    } else {
        colorClass = 'liquidity-high';
    }
    
    const percentage = Math.min(normalized * 100, 100);
    
    return { colorClass, percentage, hue };
}

/**
 * Returns APR color class based on value.
 */
function getAprColorClass(apr) {
    if (apr >= 50) return 'apr-excellent';
    if (apr >= 20) return 'apr-good';
    if (apr >= 5) return 'apr-moderate';
    return 'apr-low';
}

/**
 * Returns fee badge class based on fee percentage.
 */
function getFeeBadgeClass(feePercent) {
    if (feePercent <= 0.05) return 'fee-low';
    if (feePercent <= 0.3) return 'fee-medium';
    return 'fee-high';
}

/**
 * Calculates estimated APR based on volume, liquidity, and fee.
 * APR = (Daily Volume * Fee Rate * 365) / Liquidity * 100
 */
function calculateApr(volumeUsd24h, liquidityUsd, feePercent) {
    if (!liquidityUsd || liquidityUsd <= 0 || !feePercent) return 0;
    const feeRate = feePercent / 100;
    const dailyFees = volumeUsd24h * feeRate;
    const annualFees = dailyFees * 365;
    const apr = (annualFees / liquidityUsd) * 100;
    return apr;
}

/**
 * Parses fee from various formats and returns as percentage.
 * Examples: "0.3%", "0.003", "3000" (basis points), "0.30%", etc.
 */
function parseFeeToPercent(feeValue) {
    if (feeValue === null || feeValue === undefined) return null;
    
    // If it's already a number
    if (typeof feeValue === 'number') {
        // If it looks like basis points (e.g., 3000 = 0.3%)
        if (feeValue > 100) {
            return feeValue / 10000;
        }
        // If it looks like a decimal fee (e.g., 0.003 = 0.3%)
        if (feeValue < 1) {
            return feeValue * 100;
        }
        // Otherwise assume it's already a percentage
        return feeValue;
    }
    
    // If it's a string
    if (typeof feeValue === 'string') {
        // Remove % sign and parse
        const cleaned = feeValue.replace('%', '').trim();
        const parsed = parseFloat(cleaned);
        
        if (isNaN(parsed)) return null;
        
        // If original had % sign, it's already a percentage
        if (feeValue.includes('%')) {
            return parsed;
        }
        
        // If it looks like basis points
        if (parsed > 100) {
            return parsed / 10000;
        }
        
        // If it looks like a decimal
        if (parsed < 1) {
            return parsed * 100;
        }
        
        return parsed;
    }
    
    return null;
}

// =================================================================
// DATA FETCHING MODULE (OPTIMIZED FOR SPEED)
// =================================================================

const dataCache = new Map();

/**
 * Fetches data from a URL with timeout and error handling.
 */
async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            logMessage(`Fetch failed for ${url}: ${response.status}`, 'warn');
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
 * Fetches pools from GeckoTerminal for a specific chain (single page for speed).
 */
async function fetchGeckoTerminalPoolsForChain(chainName) {
    const geckoChainId = CONFIG.CHAIN_TO_GECKO_ID[chainName];
    if (!geckoChainId) return [];

    const cacheKey = `gt-${geckoChainId}`;
    if (dataCache.has(cacheKey)) {
        return dataCache.get(cacheKey);
    }

    const url = `${CONFIG.DATA_SOURCES.GeckoTerminal.baseUrl}/networks/${geckoChainId}/pools?page=1`;
    const data = await fetchWithTimeout(url);
    
    if (data && data.data && Array.isArray(data.data)) {
        dataCache.set(cacheKey, data.data);
        return data.data;
    }

    return [];
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
    const data = await fetchWithTimeout(url);
    
    if (data && data.data && Array.isArray(data.data)) {
        dataCache.set(cacheKey, data.data);
        return data.data;
    }

    return [];
}

/**
 * Fetches pools from DexScreener for a single query.
 */
async function fetchDexScreenerQuery(query) {
    const url = `${CONFIG.DATA_SOURCES.DexScreener.baseUrl}/search?q=${encodeURIComponent(query)}`;
    const data = await fetchWithTimeout(url);
    
    if (data && data.pairs && Array.isArray(data.pairs)) {
        return data.pairs;
    }
    return [];
}

/**
 * Main orchestrator - fetches from all sources in parallel for speed.
 */
async function fetchAllPoolData() {
    const allRawPools = [];
    const startTime = Date.now();

    logMessage('Starting parallel data fetch...', 'info');

    const chainsToFetch = [...CONFIG.HIGH_CONFIDENCE_CHAINS, ...CONFIG.MEDIUM_CONFIDENCE_CHAINS];
    const tokenSearches = ['WBTC', 'cbBTC', 'WETH', 'stETH', 'wstETH', 'rETH'];
    const dexScreenerQueries = ['WBTC', 'WETH'];

    // 1. GeckoTerminal chain fetches (parallel)
    const chainPromises = chainsToFetch.map(chain => 
        fetchGeckoTerminalPoolsForChain(chain)
            .then(data => ({ data, chain }))
            .catch(() => ({ data: [], chain }))
    );

    // 2. GeckoTerminal token searches (parallel)
    const searchPromises = tokenSearches.map(token =>
        fetchGeckoTerminalTokenSearch(token)
            .then(data => ({ data, chain: null }))
            .catch(() => ({ data: [], chain: null }))
    );

    // 3. DexScreener queries (parallel)
    const dexPromises = dexScreenerQueries.map(query =>
        fetchDexScreenerQuery(query)
            .then(data => ({ data, chain: null }))
            .catch(() => ({ data: [], chain: null }))
    );

    // Execute all in parallel
    const [chainResults, searchResults, dexResults] = await Promise.all([
        Promise.allSettled(chainPromises),
        Promise.allSettled(searchPromises),
        Promise.allSettled(dexPromises)
    ]);

    // Process GeckoTerminal chain results
    for (const result of chainResults) {
        if (result.status === 'fulfilled' && result.value.data.length > 0) {
            allRawPools.push(...result.value.data.map(p => ({
                ...p,
                _source: 'GeckoTerminal',
                _sourceRank: CONFIG.DATA_SOURCES.GeckoTerminal.rank,
                _chain: result.value.chain
            })));
        }
    }

    // Process GeckoTerminal search results
    for (const result of searchResults) {
        if (result.status === 'fulfilled' && result.value.data.length > 0) {
            allRawPools.push(...result.value.data.map(p => ({
                ...p,
                _source: 'GeckoTerminal',
                _sourceRank: CONFIG.DATA_SOURCES.GeckoTerminal.rank,
                _chain: p.attributes?.network || 'unknown'
            })));
        }
    }

    // Process DexScreener results
    const seenDexPairs = new Set();
    for (const result of dexResults) {
        if (result.status === 'fulfilled' && result.value.data.length > 0) {
            for (const pair of result.value.data) {
                if (!seenDexPairs.has(pair.pairAddress)) {
                    seenDexPairs.add(pair.pairAddress);
                    allRawPools.push({
                        ...pair,
                        _source: 'DexScreener',
                        _sourceRank: CONFIG.DATA_SOURCES.DexScreener.rank
                    });
                }
            }
        }
    }

    const elapsed = Date.now() - startTime;
    logMessage(`Fetched ${allRawPools.length} raw pools in ${elapsed}ms`, 'success');

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
    if (baseAsset === 'BTC' && quoteAsset === 'BTC') return 'wrapped';
    if (baseAsset === 'ETH' && quoteAsset === 'ETH') return 'wrapped';
    if (baseAsset === 'BTC' && quoteAsset === 'STABLE') return 'btc-stable';
    if (baseAsset === 'ETH' && quoteAsset === 'STABLE') return 'eth-stable';
    if (baseAsset === 'BTC' && quoteAsset === 'ETH') return 'btc-eth';
    if (baseAsset === 'ETH' && quoteAsset === 'BTC') return 'btc-eth';
    if (baseAsset === 'STABLE' && quoteAsset === 'BTC') return 'btc-stable';
    if (baseAsset === 'STABLE' && quoteAsset === 'ETH') return 'eth-stable';
    return null;
}

/**
 * Checks if two token symbols are different variants of the same asset.
 */
function areDifferentVariants(symbol1, symbol2, assetClass) {
    if (!symbol1 || !symbol2 || !assetClass) return false;
    const lower1 = symbol1.toLowerCase();
    const lower2 = symbol2.toLowerCase();
    
    if (lower1 === lower2) return false;
    
    const variants = CONFIG.ASSET_CLASSES[assetClass];
    if (!variants) return false;
    
    const match1 = variants.some(v => lower1.includes(v));
    const match2 = variants.some(v => lower2.includes(v));
    
    return match1 && match2;
}

/**
 * Extracts fee from GeckoTerminal pool data.
 */
function extractGeckoTerminalFee(attrs) {
    // Try various fee field names that GeckoTerminal might use
    if (attrs.swap_fee) return parseFeeToPercent(attrs.swap_fee);
    if (attrs.fee) return parseFeeToPercent(attrs.fee);
    if (attrs.pool_fee) return parseFeeToPercent(attrs.pool_fee);
    
    // Try to extract from pool name (e.g., "WETH/USDC 0.3%")
    const name = attrs.name || '';
    const feeMatch = name.match(/(\d+\.?\d*)\s*%/);
    if (feeMatch) {
        return parseFloat(feeMatch[1]);
    }
    
    // Try to extract fee tier from name (e.g., "0.05", "0.3", "1")
    const tierMatch = name.match(/\b(0\.01|0\.05|0\.3|0\.30|1|1\.0)\b/);
    if (tierMatch) {
        return parseFloat(tierMatch[1]);
    }
    
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

    const isWrappedPair = (baseAssetClass === quoteAssetClass) && 
                          (baseAssetClass === 'BTC' || baseAssetClass === 'ETH') &&
                          areDifferentVariants(baseSymbol, quoteSymbol, baseAssetClass);

    if (!isWrappedPair) {
        if (quoteAssetClass === 'BTC' || (quoteAssetClass === 'ETH' && baseAssetClass === 'STABLE')) {
            [baseAssetClass, quoteAssetClass] = [quoteAssetClass, baseAssetClass];
        }
    }

    const pairType = determinePairType(baseAssetClass, quoteAssetClass);
    if (!pairType) return null;

    if (!isWrappedPair && baseAssetClass === quoteAssetClass) return null;

    let chainName = pool._chain;
    if (!chainName || chainName === 'unknown') {
        const networkId = attrs.network?.identifier || attrs.network_id || '';
        chainName = CONFIG.CHAIN_ID_MAP[networkId] || networkId || 'unknown';
    }

    const liquidityUsd = parseFloat(attrs.reserve_in_usd) || 0;
    const volumeUsd24h = parseFloat(attrs.volume_usd?.h24) || 0;
    const feeTier = extractGeckoTerminalFee(attrs);

    return {
        id: pool.id || `gt-${Math.random().toString(36).substr(2, 9)}`,
        name: attrs.name || `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        pairType: pairType,
        liquidityUsd: liquidityUsd,
        volumeUsd24h: volumeUsd24h,
        feeTier: feeTier,
        chain: chainName,
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        apr: null,
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

    const isWrappedPair = (baseAssetClass === quoteAssetClass) && 
                          (baseAssetClass === 'BTC' || baseAssetClass === 'ETH') &&
                          areDifferentVariants(baseSymbol, quoteSymbol, baseAssetClass);

    if (!isWrappedPair) {
        if (quoteAssetClass === 'BTC' || (quoteAssetClass === 'ETH' && baseAssetClass === 'STABLE')) {
            [baseAssetClass, quoteAssetClass] = [quoteAssetClass, baseAssetClass];
        }
    }

    const pairType = determinePairType(baseAssetClass, quoteAssetClass);
    if (!pairType) return null;

    if (!isWrappedPair && baseAssetClass === quoteAssetClass) return null;

    const chainName = CONFIG.CHAIN_ID_MAP[(pool.chainId || '').toLowerCase()] || pool.chainId || 'unknown';

    // Extract fee from DexScreener - they often have it in the labels or as feeTier
    let feeTier = null;
    if (pool.labels && Array.isArray(pool.labels)) {
        for (const label of pool.labels) {
            const feeMatch = label.match(/(\d+\.?\d*)\s*%/);
            if (feeMatch) {
                feeTier = parseFloat(feeMatch[1]);
                break;
            }
        }
    }
    if (!feeTier && pool.feeTier) {
        feeTier = parseFeeToPercent(pool.feeTier);
    }
    // Try to extract from pair name
    if (!feeTier) {
        const pairName = pool.pairName || `${baseSymbol}/${quoteSymbol}`;
        const feeMatch = pairName.match(/(\d+\.?\d*)\s*%/);
        if (feeMatch) {
            feeTier = parseFloat(feeMatch[1]);
        }
    }

    return {
        id: pool.pairAddress,
        name: `${baseSymbol}/${quoteSymbol}`,
        baseAsset: baseAssetClass,
        quoteAsset: quoteAssetClass,
        pairType: pairType,
        liquidityUsd: parseFloat(pool.liquidity?.usd) || 0,
        volumeUsd24h: parseFloat(pool.volume?.h24) || 0,
        feeTier: feeTier,
        chain: chainName,
        source: pool._source,
        sourceRank: pool._sourceRank,
        score: null,
        apr: null,
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

    logMessage(`Normalized ${normalizedPools.length} unique pools.`, 'info');
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
    logMessage(`Filtered to ${validPools.length} valid pools.`, 'info');
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
 * Scores and ranks pools by turnover ratio, also calculates APR.
 */
function scoreAndRankPools(pools) {
    const scoredPools = pools.map(pool => {
        const score = calculateTurnoverScore(pool);
        // Use fee if available, otherwise estimate based on pool type
        const effectiveFee = pool.feeTier || CONFIG.DEFAULT_FEE_PERCENT || 0.3;
        const apr = calculateApr(pool.volumeUsd24h, pool.liquidityUsd, effectiveFee);
        
        return {
            ...pool,
            score: score,
            apr: apr
        };
    });

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
        'btc-eth': [],
        'wrapped': []
    };

    for (const pool of pools) {
        if (categories[pool.pairType]) {
            categories[pool.pairType].push(pool);
        }
    }

    for (const key in categories) {
        categories[key] = scoreAndRankPools(categories[key]);
    }

    return categories;
}

// =================================================================
// UI RENDERING
// =================================================================

/**
 * Formats USD value in compact form.
 */
function formatUsdCompact(value) {
    if (value >= 1000000000) {
        return '$' + (value / 1000000000).toFixed(2) + 'B';
    } else if (value >= 1000000) {
        return '$' + (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
        return '$' + (value / 1000).toFixed(1) + 'K';
    }
    return '$' + value.toFixed(0);
}

/**
 * Formats fee as percentage string.
 */
function formatFee(feePercent) {
    if (feePercent === null || feePercent === undefined) {
        return '—';
    }
    return feePercent.toFixed(2) + '%';
}

/**
 * Formats APR as percentage string.
 */
function formatApr(apr) {
    if (apr === null || apr === undefined || apr === 0) {
        return '—';
    }
    if (apr >= 1000) {
        return (apr / 1000).toFixed(1) + 'K%';
    }
    if (apr >= 100) {
        return apr.toFixed(0) + '%';
    }
    return apr.toFixed(1) + '%';
}

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

        // Column 1: Chain
        const chainCell = document.createElement('td');
        chainCell.textContent = pool.chain || 'unknown';
        row.appendChild(chainCell);

        // Column 2: Pool Name & Link
        const nameCell = document.createElement('td');
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

        // Column 3: Fee
        const feeCell = document.createElement('td');
        const feeBadge = document.createElement('span');
        feeBadge.className = 'fee-badge';
        if (pool.feeTier !== null && pool.feeTier !== undefined) {
            feeBadge.classList.add(getFeeBadgeClass(pool.feeTier));
        }
        feeBadge.textContent = formatFee(pool.feeTier);
        feeCell.appendChild(feeBadge);
        row.appendChild(feeCell);

        // Column 4: Liquidity with color indicator
        const liquidityCell = document.createElement('td');
        liquidityCell.className = 'liquidity-cell';
        
        const liqIndicator = getLiquidityIndicator(pool.liquidityUsd);
        
        const bar = document.createElement('div');
        bar.className = 'liquidity-bar';
        bar.style.width = `${liqIndicator.percentage}%`;
        bar.style.backgroundColor = `hsl(${liqIndicator.hue}, 70%, 50%)`;
        liquidityCell.appendChild(bar);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = `liquidity-value ${liqIndicator.colorClass}`;
        valueSpan.textContent = formatUsdCompact(pool.liquidityUsd);
        liquidityCell.appendChild(valueSpan);
        
        row.appendChild(liquidityCell);

        // Column 5: Volume 24h
        const volumeCell = document.createElement('td');
        volumeCell.textContent = formatUsdCompact(pool.volumeUsd24h);
        row.appendChild(volumeCell);

        // Column 6: Turnover Ratio
        const scoreCell = document.createElement('td');
        scoreCell.textContent = pool.score.toFixed(3);
        row.appendChild(scoreCell);

        // Column 7: Estimated APR
        const aprCell = document.createElement('td');
        const aprSpan = document.createElement('span');
        aprSpan.className = `apr-value ${getAprColorClass(pool.apr)}`;
        aprSpan.textContent = formatApr(pool.apr);
        aprCell.appendChild(aprSpan);
        row.appendChild(aprCell);

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

    renderPoolsToTable(
        categorizedPools['wrapped'],
        'wrapped-table-body',
        'wrapped-no-data',
        'wrapped-count'
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
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const sortKey = header.dataset.sort;
            const sectionId = header.dataset.section;
            sortSectionByKey(sectionId, sortKey, header);
        });
    });
}

let currentCategorizedPools = {};

/**
 * Sorts a specific section's pools by key.
 */
function sortSectionByKey(sectionId, sortKey, clickedHeader) {
    const pools = currentCategorizedPools[sectionId];
    if (!pools || pools.length === 0) return;

    const isCurrentlyDesc = clickedHeader.classList.contains('sort-desc');
    const newOrder = isCurrentlyDesc ? 'asc' : 'desc';

    const sectionHeaders = document.querySelectorAll(`th[data-section="${sectionId}"]`);
    sectionHeaders.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

    clickedHeader.classList.add(newOrder === 'asc' ? 'sort-asc' : 'sort-desc');

    pools.sort((a, b) => {
        let aVal, bVal;

        switch (sortKey) {
            case 'name':
            case 'chain':
                aVal = (a[sortKey] || '').toLowerCase();
                bVal = (b[sortKey] || '').toLowerCase();
                return newOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'feeTier':
                aVal = a.feeTier || 0;
                bVal = b.feeTier || 0;
                return newOrder === 'asc' ? aVal - bVal : bVal - aVal;
            case 'apr':
                aVal = a.apr || 0;
                bVal = b.apr || 0;
                return newOrder === 'asc' ? aVal - bVal : bVal - aVal;
            case 'liquidityUsd':
            case 'volumeUsd24h':
            case 'score':
            default:
                aVal = a[sortKey] || 0;
                bVal = b[sortKey] || 0;
                return newOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });

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
        const allRawPools = await fetchAllPoolData();
        if (allRawPools.length === 0) {
            throw new Error('All data sources failed to return pool data.');
        }

        updateStatusBar('Processing data...', 'info');

        const normalizedPools = normalizeAllPools(allRawPools);
        const validPools = filterPools(normalizedPools);
        const categorizedPools = categorizePools(validPools);
        currentCategorizedPools = categorizedPools;

        renderAllSections(categorizedPools);

        const totalPools = Object.values(categorizedPools).reduce((sum, arr) => sum + arr.length, 0);
        updateStatusBar(`Loaded ${totalPools} pools across 4 categories.`, 'success');
        updateLastUpdatedTime();

    } catch (error) {
        console.error('Dashboard application failed:', error);
        logMessage(`An error occurred: ${error.message}`, 'error');
        updateStatusBar(`Error: ${error.message}`, 'error');
        renderAllSections({ 'btc-stable': [], 'eth-stable': [], 'btc-eth': [], 'wrapped': [] });
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

    const refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            logMessage('Manual refresh triggered.', 'info');
            clearCache();
            stopAutoRefresh();
            mainApp().finally(() => startAutoRefresh());
        });
    }

    setupSectionCollapse();
    setupTableSorting();
    mainApp();
    startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', initializeDashboard);
