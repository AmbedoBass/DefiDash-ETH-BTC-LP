// config.js

const CONFIG = {
    // Asset definitions for canonical resolution
    ASSET_CLASSES: {
        BTC: ["btc", "wbtc", "cbbtc", "kbtc", "tbtc", "ebtc", "sbtc", "renbtc", "hbtc", "obtc", "pbtc", "btcb"],
        ETH: ["eth", "weth", "eeth", "steth", "wsteth", "reth", "cbeth", "frxeth", "sfrxeth", "meth", "oeth", "ankreth"],
        STABLE: ["usdc", "usdt", "dai", "usdbc", "frax", "lusd", "usds", "crvusd", "gusd", "busd", "tusd", "usdd", "susd", "eurs", "eurc", "pyusd", "usdp", "fei"]
    },

    // Data fetching and filtering thresholds - LOWERED for more results
    MIN_LIQUIDITY: 50000,      // $50k (was $100k)
    MIN_VOLUME_24H: 5000,      // $5k (was $10k)

    // Pagination settings
    GECKO_MAX_PAGES: 3,        // Fetch up to 3 pages per chain
    
    // Auto-refresh interval in milliseconds
    UPDATE_INTERVAL_MS: 900000, // 15 minutes

    // Chain confidence levels for UI indicators
    HIGH_CONFIDENCE_CHAINS: ["ethereum"],
    MEDIUM_CONFIDENCE_CHAINS: ["arbitrum", "optimism", "base", "polygon", "zksync", "linea", "scroll", "blast", "avalanche", "bsc"],

    // API endpoints and source configuration
    DATA_SOURCES: {
        GeckoTerminal: {
            name: "GeckoTerminal",
            baseUrl: "https://api.geckoterminal.com/api/v2",
            rank: 1
        },
        DexScreener: {
            name: "DexScreener",
            baseUrl: "https://api.dexscreener.com/latest/dex",
            rank: 2
        }
    },

    // Mapping of internal chain names to GeckoTerminal network IDs
    CHAIN_TO_GECKO_ID: {
        "ethereum": "eth",
        "arbitrum": "arbitrum",
        "optimism": "optimism",
        "base": "base",
        "polygon": "polygon_pos",
        "zksync": "zksync",
        "linea": "linea",
        "scroll": "scroll",
        "blast": "blast",
        "avalanche": "avax",
        "bsc": "bsc"
    },

    // Mapping of API chain IDs to our internal canonical names
    CHAIN_ID_MAP: {
        "eth": "ethereum",
        "ethereum": "ethereum",
        "arbitrum": "arbitrum",
        "optimism": "optimism",
        "base": "base",
        "polygon": "polygon",
        "polygon_pos": "polygon",
        "zksync": "zksync",
        "linea": "linea",
        "scroll": "scroll",
        "blast": "blast",
        "avax": "avalanche",
        "avalanche": "avalanche",
        "bsc": "bsc",
        "sol": "solana"
    },

    // DexScreener search queries - expanded for more coverage
    DEXSCREENER_QUERIES: [
        "WBTC", "WETH", "cbBTC", "tBTC", "eBTC",
        "stETH", "wstETH", "rETH", "cbETH", "frxETH",
        "WBTC USDC", "WETH USDC", "WBTC USDT", "WETH USDT"
    ],

    // Pair type definitions for sectioning
    PAIR_TYPES: {
        BTC_STABLE: {
            id: "btc-stable",
            label: "BTC / Stablecoin",
            baseAssets: ["BTC"],
            quoteAssets: ["STABLE"]
        },
        ETH_STABLE: {
            id: "eth-stable",
            label: "ETH / Stablecoin",
            baseAssets: ["ETH"],
            quoteAssets: ["STABLE"]
        },
        BTC_ETH: {
            id: "btc-eth",
            label: "BTC / ETH",
            baseAssets: ["BTC"],
            quoteAssets: ["ETH"]
        }
    }
};
