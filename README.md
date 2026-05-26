# Acme Financial Data Warehouse

A full-stack data platform for collecting, storing, exploring, and analyzing financial market data. Built for Acme Ltd to extract insights, assess risk, and provide financial recommendations.

## Architecture

- **Frontend**: React + Vite (SPA with react-router, Recharts for visualization)
- **Backend**: Express.js RESTful API
- **Database**: MongoDB (NoSQL, temporal data warehouse approach)

## Features

### UC1: Data Ingest from Financial Data Providers
Import time series data from external providers (Nasdaq, Bloomberg, Yahoo Finance) with automatic data provenance tracking.

### UC2: RESTful API for Data Consumption
- `GET /api/instruments` - List all financial instruments (Q1)
- `GET /api/instruments/:id` - Get instrument details with current version (Q2)
- `GET /api/data-sources` - List all data sources (Q3)
- `GET /api/data-sources/:id` - Get data source details (Q4)
- `GET /api/time-series/:instrumentId/:dataSourceId` - Get time series data (Q5)

### UC3: Analytics and Data Mining
- Aggregate statistics (count, min, max, average)
- Instrument comparison
- Price trend analysis with configurable intervals
- Simple moving average price forecast

### UC4: LLM Assistant (MCP-style)
Natural language interface powered by **Claude AI** (claude-haiku-4-5) with an agentic tool-calling loop:
- `list_assets`, `get_asset`, `list_data_sources`
- `fetch_time_series`, `summarize_trends`
- `compare_assets`, `forecast_price`, `get_risk_metrics`

Falls back to rule-based keyword matching if `ANTHROPIC_API_KEY` is not set.

### Temporal Data Warehouse
- Records are never updated or deleted in-place
- Updates create new versioned records
- Deletion adds a marker record with `isDeleted: true`
- Historical data queryable at any point in time via `?asOf=` parameter

## Data Model

Seven collections following the conceptual model:

| Collection | Description |
|---|---|
| `financial_instruments` | Core instrument data (stocks, bonds, crypto, commodities) |
| `instrument_versions` | Temporal versioning with attributes map |
| `data_sources` | External data providers/vendors |
| `time_series_records` | OHLCV price data with provenance |
| `portfolio_owners` | Persons or companies owning portfolios |
| `portfolios` | Named collections of assets |
| `portfolio_assets` | Links instruments to portfolios |

## Prerequisites

- Node.js >= 18
- MongoDB >= 7.0

## Setup

```bash
# Install all dependencies
npm run install:all

# Start MongoDB (if not running)
sudo systemctl start mongod

# Seed the database with sample data
npm run seed

# Start the backend server (port 5000)
npm run dev:server

# In another terminal, start the frontend (port 5173)
npm run dev:client
```

Open http://localhost:5173 in your browser.

## API Reference

### Instruments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/instruments` | List instruments (limited info) |
| GET | `/api/instruments/:id` | Get instrument details |
| GET | `/api/instruments/:id/at?asOf=` | Get instrument at point in time |
| GET | `/api/instruments/:id/versions` | Version history |
| POST | `/api/instruments` | Create instrument |
| PUT | `/api/instruments/:id` | Update (new version) |
| DELETE | `/api/instruments/:id` | Mark as deleted |

### Data Sources
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/data-sources` | List sources (limited info) |
| GET | `/api/data-sources/:id` | Get source details |
| POST | `/api/data-sources` | Create source |

### Time Series
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/time-series/instrument/:instrumentId` | Get by instrument |
| GET | `/api/time-series/:instrumentId/:dataSourceId` | Get by instrument + source |
| POST | `/api/time-series/ingest` | Ingest batch data |

### Market Data
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/market-data/quote/:symbol` | Fetch latest quote from Yahoo Finance |
| POST | `/api/market-data/ingest/:symbol` | Fetch and ingest latest quote for symbol |
| POST | `/api/market-data/refresh` | Refresh quotes for selected instruments and ingest into the DWH |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/stats/:instrumentId` | Aggregate statistics |
| GET | `/api/analytics/compare/:id1/:id2` | Compare two instruments |
| GET | `/api/analytics/trend/:instrumentId` | Price trend data |
| GET | `/api/analytics/forecast/:instrumentId` | SMA forecast |
| GET | `/api/analytics/export/:instrumentId` | Export raw time-series records for an instrument (CSV) |
| GET | `/api/analytics/risk/:instrumentId` | Annualized volatility, max drawdown, Sharpe ratio |

### Assistant (MCP)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/assistant/tools` | List available MCP tools |
| POST | `/api/assistant/call` | Execute a tool |
| POST | `/api/assistant/chat` | Natural language query |

## Sample Data

The seed script populates:
- **100 financial instruments** across stocks, bonds, crypto, ETFs, commodities, European and Asian equities
- **5 data sources** (Nasdaq, Bloomberg, Yahoo Finance, Yahoo Finance live, Stooq)
- **~100 000 time-series records** — 2 years of GBM-simulated OHLCV data per instrument
- 4 portfolio owners, 4 portfolios, 25 portfolio assets

### Fetching Real Historical Data (Optional)

After seeding, you can enrich the database with real OHLCV data from [Stooq](https://stooq.com) (free, no API key):

```bash
# Fetch all instruments
node src/scripts/fetchRealData.js

# Fetch specific symbols only
node src/scripts/fetchRealData.js --symbols AAPL,MSFT,TSLA

# Limit to first 20 instruments
node src/scripts/fetchRealData.js --limit 20

# Custom date range
node src/scripts/fetchRealData.js --from 20220101 --to 20241231

# Dry run (no writes)
node src/scripts/fetchRealData.js --dry-run
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend server port |
| `MONGODB_URI` | `mongodb://localhost:27017/acme_financial_dwh` | MongoDB connection string |
| `ANTHROPIC_API_KEY` | | Anthropic API key for Claude AI assistant; falls back to rule-based mode if unset |
| `MARKET_DATA_REFRESH_INTERVAL_MINUTES` | `15` | Minutes between scheduled market-data refresh runs; disable by setting to `0` |
| `MARKET_DATA_REFRESH_LIMIT` | `5` | Max instruments to refresh each scheduled run |
| `ANTHROPIC_API_KEY` | | Anthropic API key for Claude AI assistant; falls back to rule-based mode if unset |
| `VITE_API_URL` | `http://localhost:5000/api` | Frontend API base URL |
