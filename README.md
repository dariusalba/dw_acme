# Acme Financial Data Warehouse

A full-stack data platform for collecting, storing, exploring, and analyzing financial market data. Built for Acme Ltd to extract insights, assess risk, and provide financial recommendations.

## Architecture

- **Frontend**: React + Vite (SPA with react-router, Recharts for visualization)
- **Backend**: Express.js RESTful API
- **Database**: MongoDB (NoSQL, temporal data warehouse approach)
- **Big-data layer**: Apache Spark (PySpark) — DataFrame aggregations + Spark MLlib (LinearRegression, GBTRegressor)
- **Tests**: Jest + `mongodb-memory-server` (unit tests for DAL & ingestion pipeline)

## Features

### UC1: Data Ingest from Financial Data Providers
Import time series data from external providers (Yahoo Finance, Nasdaq, Bloomberg) with automatic data provenance tracking. Live quotes are fetched via the Yahoo Finance v8 chart API (no API key required).

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

### UC5: Apache Spark Analytics (M6 / M7)
Distributed batch processing for instrument-level statistics and ML price prediction. Two PySpark jobs live in `server/src/spark/`:

- **`aggregation_job.py`** — Spark DataFrame API: `groupBy("instrumentId").agg(count, avg, min, max, stddev, …)` plus an annualised volatility column (σ_daily × √252). Writes the per-instrument summary to the `spark_aggregations` collection.
- **`ml_prediction_job.py`** — Spark MLlib `Pipeline` ( `VectorAssembler → StandardScaler → LinearRegression | GBTRegressor` ). Engineers nine features per row (`lag_1`, `lag_5`, `lag_10`, `ma_5`, `ma_20`, day-of-week, month, high-low range, open-close diff) with `Window` functions, splits 80/20 chronologically, evaluates with `RegressionEvaluator` (RMSE/MAE/R²), and stores results + the first 90 test predictions in `spark_predictions` for charting.

The Python scripts read source data and write results over HTTP via internal Express endpoints, so Python never has to authenticate to MongoDB directly. The React **Spark Analytics** page (`/spark`) renders the aggregation table, the model-metrics table, and an actual-vs-predicted Recharts line chart per symbol/model.

### Temporal Data Warehouse
- Records are never updated or deleted in-place
- Updates create new versioned records
- Deletion adds a marker record with `isDeleted: true`
- Historical data queryable at any point in time via `?asOf=` parameter

## Data Model

Nine collections following the conceptual model:

| Collection | Description |
|---|---|
| `financial_instruments` | Core instrument data (stocks, bonds, crypto, commodities) |
| `instrument_versions` | Temporal versioning with attributes map |
| `data_sources` | External data providers/vendors |
| `time_series_records` | OHLCV price data with provenance |
| `portfolio_owners` | Persons or companies owning portfolios |
| `portfolios` | Named collections of assets |
| `portfolio_assets` | Links instruments to portfolios |
| `spark_aggregations` | Output of the PySpark aggregation job (per-instrument statistics + volatility) |
| `spark_predictions` | Output of the PySpark MLlib job (LR + GBT model metrics + test predictions) |

## Prerequisites

- Node.js >= 18
- MongoDB >= 7.0  (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))
- Python >= 3.10  *(only required for the Apache Spark jobs)*
- Java 17+        *(PySpark runtime; JDK 17 is best, 21/25 work with warnings)*

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

### Running the Spark jobs (optional, for the `/spark` page)

The PySpark jobs talk to MongoDB through Express (port 5000), so the backend must be running.

```bash
# 1. Install PySpark + helpers (one-time)
pip install -r server/src/spark/requirements.txt

# 2. (Windows only) tell Spark which Python to use for workers,
#    otherwise the Microsoft Store python alias breaks worker spawn:
$env:PYSPARK_PYTHON        = "C:\Path\To\python.exe"
$env:PYSPARK_DRIVER_PYTHON = "C:\Path\To\python.exe"

# 3. Run from anywhere — paths inside the scripts are resolved automatically
python server/src/spark/aggregation_job.py
python server/src/spark/ml_prediction_job.py

# Optional flags
python server/src/spark/aggregation_job.py --symbol AAPL,MSFT
python server/src/spark/ml_prediction_job.py --symbol AAPL,BTC --model lr
```

You can also trigger the jobs from the **Spark Analytics** page via the *Run Aggregation Job* / *Run ML Job* buttons (they POST to `/api/spark/run`).

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

### Spark
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/spark/status` | Counts of aggregation / prediction documents |
| GET | `/api/spark/aggregations` | Per-instrument Spark aggregation results |
| GET | `/api/spark/predictions` | Spark MLlib model metrics + test predictions |
| GET | `/api/spark/predictions/:symbol` | Predictions for a specific symbol |
| POST | `/api/spark/run` | Launch a Spark job in the background (`job`: `aggregation` \| `ml` \| `all`) |
| GET | `/api/spark/internal/source-data` | *Internal* — feeds raw TS + instruments to the PySpark scripts |
| POST | `/api/spark/internal/save-aggregations` | *Internal* — receives `aggregation_job.py` output |
| POST | `/api/spark/internal/save-predictions` | *Internal* — receives `ml_prediction_job.py` output |

## Sample Data

The seed script populates:
- **107 financial instruments** across stocks, bonds, crypto, ETFs, commodities, European and Asian equities
- **5 data sources** (Nasdaq, Bloomberg, Yahoo Finance, Yahoo Finance Live, Yahoo Finance Historical)
- **~107 000 time-series records** — 2 years of GBM-simulated OHLCV data per instrument
- **9 portfolio owners** (5 individuals + 4 institutions), **19 portfolios**, ~170 portfolio assets

### Fetching Real Historical Data (Optional)

After seeding, you can enrich the database with real OHLCV data from [Yahoo Finance](https://finance.yahoo.com) (free, no API key):

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

## Testing

Backend unit tests use **Jest** + **`mongodb-memory-server`** (no live MongoDB needed — an in-memory instance is spun up per suite).

```bash
cd server
npm install          # pulls in jest + mongodb-memory-server (first time)
npm test
```

What's covered (`server/src/__tests__/`):

| Suite | Covers |
|---|---|
| `timeSeries.dal.test.js` | DAL — save record, `findLatest`, filter by `instrumentId` and date range, Decimal128 → JSON number serialisation |
| `instrument.dal.test.js` | Instrument CRUD via temporal versioning — `create`, `getById`, `update` (closes old version + opens new), `delete` (writes `isDeleted=true` marker) |
| `ingestion.test.js` | Ingestion pipeline — correct `instrumentId` / `dataSourceId` storage, **upsert deduplication** (`bulkWrite` on `(instrumentId, dataSourceId, date)`), `adjustedClose` fallback to `close`, 400 on empty / missing records |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend server port |
| `MONGODB_URI` | `mongodb://localhost:27017/acme_financial_dwh` | MongoDB connection string |
| `ANTHROPIC_API_KEY` | | Anthropic API key for Claude AI assistant; falls back to rule-based mode if unset |
| `MARKET_DATA_REFRESH_INTERVAL_MINUTES` | `15` | Minutes between scheduled market-data refresh runs; disable by setting to `0` |
| `MARKET_DATA_REFRESH_LIMIT` | `5` | Max instruments to refresh each scheduled run |
| `VITE_API_URL` | `http://localhost:5000/api` | Frontend API base URL |
| `EXPRESS_URL` | `http://localhost:5000` | Base URL the PySpark jobs use to reach Express (override with `--api` flag) |
| `PYSPARK_PYTHON` / `PYSPARK_DRIVER_PYTHON` | | (Windows) full path to `python.exe` — required so Spark workers don't hit the Microsoft Store python alias |
