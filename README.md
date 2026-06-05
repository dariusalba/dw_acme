# Acme Financial Data Warehouse

Full-stack temporal data warehouse for financial market data — React + Express + MongoDB + Apache Spark + Claude AI.

## Stack
- **Frontend** React + Vite + Recharts
- **Backend** Express.js REST API
- **DB** MongoDB (temporal, append-only)
- **Big data** PySpark — DataFrame aggregations + MLlib (LinearRegression, GBTRegressor)
- **AI** Claude Haiku 4.5 with agentic tool-calling (falls back to keyword routing if no API key)
- **Tests** Jest + `mongodb-memory-server`

## Use cases
- **UC1** Yahoo Finance ingest (live + historical, no API key)
- **UC2** RESTful API — instruments, sources, time-series, portfolios
- **UC3** Analytics — stats, compare, trend, SMA forecast, risk metrics, CSV export
- **UC4** MCP-style Claude assistant — 8 tools (`list_assets`, `get_risk_metrics`, `compare_assets`, `forecast_price`, …)
- **M6/M7** PySpark aggregation + Spark MLlib price prediction (LR / GBT, 9 engineered features, RMSE/MAE/R²)
- **Temporal DWH** every update creates a new version, deletes write `isDeleted=true` markers, `?asOf=` queries any past state

## Setup

```bash
npm run install:all
npm run seed                 # populates ~107 instruments, ~108k TS records, 19 portfolios
npm run dev:server           # :5000
npm run dev:client           # :5173
```

Optional — Spark jobs (require Python 3.10+ and JDK 17+):
```bash
pip install -r server/src/spark/requirements.txt
python server/src/spark/aggregation_job.py     # writes spark_aggregations
python server/src/spark/ml_prediction_job.py   # writes spark_predictions
```

On Windows, set `PYSPARK_PYTHON` and `PYSPARK_DRIVER_PYTHON` to your full `python.exe` path to avoid the Microsoft Store python alias.

## Tests
```bash
cd server && npm test
```
Covers DAL (save/find/filter), instrument CRUD via temporal versioning, ingestion dedup (`bulkWrite` upsert on `instrumentId+dataSourceId+date`).

## Data model
9 collections: `financial_instruments`, `instrument_versions`, `data_sources`, `time_series_records`, `portfolio_owners`, `portfolios`, `portfolio_assets`, `spark_aggregations`, `spark_predictions`.

## Key endpoints
| Group | Endpoints |
|---|---|
| Instruments | `GET /api/instruments`, `GET /:id`, `GET /:id/at?asOf=`, `GET /:id/versions`, `POST`, `PUT`, `DELETE` |
| Data sources | `GET /api/data-sources`, `GET /:id`, `POST` |
| Time series | `GET /api/time-series/instrument/:id`, `GET /:instrumentId/:dataSourceId`, `POST /ingest` |
| Market data | `GET /api/market-data/quote/:symbol`, `POST /ingest/:symbol`, `POST /refresh` |
| Analytics | `GET /api/analytics/{stats,compare,trend,forecast,risk,export}/:id` |
| Assistant | `GET /api/assistant/tools`, `POST /call`, `POST /chat` |
| Spark | `GET /api/spark/{status,aggregations,predictions}`, `POST /run` |

## Environment
| Var | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/acme_financial_dwh` | DB connection |
| `ANTHROPIC_API_KEY` | — | Claude assistant (preferred provider) |
| `GROQ_API_KEY` | — | Groq Llama assistant — used if Anthropic key is absent |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Override Groq model name |
| `PORT` | `5000` | Backend |
| `VITE_API_URL` | `http://localhost:5000/api` | Frontend → backend base URL |
| `EXPRESS_URL` | `http://localhost:5000` | PySpark → Express base URL |
