// config.js

const CONFIG = {
    // Asset definitions for canonical resolution
    ASSET_CLASSES: {
        BTC: ["btc", "wbtc", "cbbtc", "kbtc", "tbtc", "ebtc"],
        ETH: ["eth", "weth", "eeth"],
        STABLE: ["usdc", "usdt", "dai", "usdbc", "frax", "lusd", "usds", "crvusd"]
    },

    // Data fetching and filtering thresholds
    MIN_LIQUIDITY: 100000,    // $100k
    MIN_VOLUME_24H: 10000,    // $10k

    // Auto-refresh interval in milliseconds
    UPDATE_INTERVAL_MS: 900000, // 15 minutes

    // Chain confidence levels for UI indicators
    HIGH_CONFIDENCE_CHAINS: ["ethereum"],
    MEDIUM_CONFIDENCE_CHAINS: ["arbitrum", "optimism", "base", "polygon", "zksync", "linea", "scroll", "blast"],

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
        },
        DeFiLlama: {
            name: "DeFiLlama",
            baseUrl: "https://yields.llama.fi/pools",
            rank: 3
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
        "blast": "blast"
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
        "sol": "solana",
        "bsc": "bsc"
    },

    // UI state messages
    UI_MESSAGES: {
        INITIALIZING: "Initializing dashboard...",
        FETCHING_DATA: "Fetching data from sources...",
        PROCESSING_DATA: "Processing and normalizing data...",
        RENDERING_UI: "Rendering dashboard...",
        ERROR_NO_DATA: "Could not retrieve pool data from any source. Please check your connection and try again.",
        ERROR_GENERIC: "An error occurred. Please refresh the page.",
        LAST_UPDATED: "Last updated: "
    }
};