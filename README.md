
# ETH / BTC Liquidity Turnover Dashboard

**Version: 2025-12-17**

## Project Overview

This is a static, client-side web dashboard designed to identify and rank BTC- and ETH-related liquidity pools based on their **Liquidity Turnover Ratio**.

Liquidity Turnover Ratio = 24h Trading Volume / Total Liquidity

A high ratio indicates that a pool's liquidity is being actively utilized for trading, rather than sitting idle.

### What This Dashboard IS

- A discovery tool for active BTC / ETH pools
- A comparative liquidity utilization scanner
- A static, browser-safe analytics dashboard (GitHub Pages compatible)
- A project that gracefully handles API failures

### What This Dashboard IS NOT

- A yield calculator or APR estimator
- A fee-optimizing tool
- A v3 range optimizer
- A token-canonicality oracle
- A financial advice platform

## Core Constraints

- **Static Frontend Only:** HTML, CSS, and JavaScript only. No backend required.
- **No API Keys:** All data from public, CORS-enabled APIs.
- **Browser CORS Restrictions:** Data sources chosen for browser accessibility.
- **Chain-Specific Assets:** Assets from different chains are never merged.
- **Graceful Degradation:** Automatic fallback if primary sources fail.

## Data Sources

1. **GeckoTerminal** (Primary) - Purpose-built for per-pool liquidity and volume
2. **DexScreener** (Fallback) - Comprehensive pool coverage

## Configuration

Key parameters in config.js:

Parameter | Default | Description
-----------|---------|-------------
MIN_LIQUIDITY | $100,000 | Minimum pool liquidity
MIN_VOLUME_24H | $10,000 | Minimum 24h volume
UPDATE_INTERVAL_MS | 900000 | Auto-refresh (15 min)

## Supported Chains

**High Confidence:** Ethereum

**Medium Confidence:** Arbitrum, Optimism, Base, Polygon, zkSync, Linea, Scroll, Blast

## How to Run

1. Clone or download this repository
2. Open index.html in a web browser
3. For permanent hosting, deploy to GitHub Pages

## File Structure

.
├── index.html    # Main HTML structure
├── style.css     # Styling (responsive, dark mode)
├── config.js     # Configuration
├── script.js     # Application logic
└── README.md     # Documentation

## Disclaimer

This tool is for informational and educational purposes only. Data is sourced from third-party APIs and may be inaccurate, delayed, or incomplete. Always do your own research before making any financial decisions.