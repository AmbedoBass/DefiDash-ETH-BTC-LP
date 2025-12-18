// config.js

const CONFIG = {
    // Asset definitions for canonical resolution
    ASSET_CLASSES: {
        BTC: ["btc", "wbtc", "cbbtc", "kbtc", "tbtc", "ebtc", "renbtc", "sbtc", "hbtc"],
        ETH: ["eth", "weth", "eeth", "steth", "wsteth", "reth", "cbeth", "seth", "meth"],
        STABLE: ["usdc", "usdt", "dai", "usdbc", "frax", "lusd", "usds", "crvusd", "tusd", "busd", "gusd", "usdp", "usdd"]
    },

    // Data fetching and filtering thresholds
    MIN_LIQUIDITY: 100000,      // $100k minimum liquidity
    MIN_VOLUME_24H: 10000,      // $10k minimum 24h volume
    
    // Default fee percentage when fee is not available from API
    DEFAULT_FEE_PERCENT: 0.3,

    // Auto-refresh interval in milliseconds
    UPDATE_INTERVAL_MS: 900000, // 15 minutes

    // Chain confidence levels
    HIGH_CONFIDENCE_CHAINS: ["ethereum"],
    MEDIUM_CONFIDENCE_CHAINS: ["arbitrum", "optimism", "base", "polygon", "zksync", "linea", "scroll", "blast"],

    // API endpoints
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

    // GeckoTerminal chain ID mapping
    CHAIN_TO_GECKO_ID: {
        "ethereum": "eth",
        "arbitrum": "arbitrum",
        "optimism": "optimism",
        "base": "base",
        "polygon": "polygon_pos",
        "zksync": "zksync",
        "linea": "linea",
        "scroll": "scroll",
        "blast": "blast"
    },

    // Chain ID normalization
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
        "sol": "solana",
        "bsc": "bsc"
    }
};
