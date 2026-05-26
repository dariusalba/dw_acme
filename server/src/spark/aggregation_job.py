
import sys
import os
import argparse
from datetime import datetime, timezone

#cli args
parser = argparse.ArgumentParser(description="Acme DWH Spark Aggregation Job")
parser.add_argument("--symbol", type=str, default=None,
                    help="Comma-separated symbols to process (default: all)")
parser.add_argument("--api", type=str,
                    default=os.environ.get("EXPRESS_URL", "http://localhost:5000"),
                    help="Express server base URL (default: http://localhost:5000)")
args   = parser.parse_args()
API    = args.api.rstrip("/")
SYMBOL = args.symbol

# fetch source data from Express
import requests

print(f"\n[Spark] Fetching source data from {API} …")
params = {"symbol": SYMBOL} if SYMBOL else {}
try:
    resp = requests.get(f"{API}/api/spark/internal/source-data",
                        params=params, timeout=120)
    resp.raise_for_status()
except Exception as exc:
    print(f"[Spark] ERROR: cannot reach Express at {API}: {exc}")
    print("[Spark] Make sure the Node.js server is running (npm run dev).")
    sys.exit(1)

payload   = resp.json()
inst_rows = payload.get("instruments", [])
ts_raw    = payload.get("records", [])

print(f"[Spark] Got {len(inst_rows)} instrument(s) and {len(ts_raw)} time-series records.")

if not inst_rows or not ts_raw:
    print("[Spark] No data to process. Exiting.")
    sys.exit(0)

inst_rows = [{
    "inst_id":         d["_id"],
    "symbol":          d.get("symbol", ""),
    "name":            d.get("name", ""),
    "instrumentClass": d.get("instrumentClass", ""),
    "region":          d.get("region", ""),
} for d in inst_rows]

def _f(v):
    """Force JSON numbers to Python float so Spark infers DoubleType consistently."""
    return None if v is None else float(v)

ts_rows = [{
    "instrumentId": d["instrumentId"],
    "date":         datetime.fromisoformat(d["date"].replace("Z", "+00:00")),
    "open":   _f(d.get("open")),
    "close":  _f(d.get("close")),
    "high":   _f(d.get("high")),
    "low":    _f(d.get("low")),
    "volume": _f(d.get("volume")),
} for d in ts_raw]

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

print("[Spark] Starting SparkSession …")
spark = (
    SparkSession.builder
    .appName("AcmeDWH-Aggregation")
    .master("local[*]")
    .config("spark.sql.session.timeZone", "UTC")
    .config("spark.driver.memory", "2g")
    .config("spark.ui.showConsoleProgress", "false")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")

ts_df   = spark.createDataFrame(ts_rows)
inst_df = spark.createDataFrame(inst_rows)

print("[Spark] Computing aggregations …")
agg = (
    ts_df.groupBy("instrumentId")
    .agg(
        F.count("*")                .alias("dataPoints"),
        F.round(F.avg("close"), 4)  .alias("avgClose"),
        F.round(F.min("low"),   4)  .alias("minLow"),
        F.round(F.max("high"),  4)  .alias("maxHigh"),
        F.round(F.avg("volume"), 0) .alias("avgVolume"),
        F.round(F.stddev("close"),4).alias("stddevClose"),
        F.min("date")               .alias("firstDate"),
        F.max("date")               .alias("lastDate"),
    )
)

# Annualised volatility: σ_daily / avg_close × √252
agg = agg.withColumn(
    "annualisedVolatility",
    F.round(F.col("stddevClose") / F.col("avgClose") * (252 ** 0.5), 4),
)

result = (
    agg.join(
        inst_df,
        agg.instrumentId == inst_df.inst_id,
        "left",
    )
    .drop("inst_id")
    .withColumn("computedAt", F.lit(datetime.now(timezone.utc).isoformat()))
)

result.printSchema()
n = result.count()
print(f"[Spark] Aggregated {n} instrument(s).")
result.show(10, truncate=False)

# ── Send results to Express ────────────────────────────────────────────────────
print(f"[Spark] Posting {n} aggregation(s) to Express …")
rows = result.collect()

def row_to_doc(row):
    d = row.asDict()
    for key in ("firstDate", "lastDate"):
        v = d.get(key)
        if v is not None and hasattr(v, "isoformat"):
            d[key] = v.isoformat()
    return d

docs = [row_to_doc(r) for r in rows]

try:
    save_resp = requests.post(
        f"{API}/api/spark/internal/save-aggregations",
        json={"aggregations": docs},
        timeout=120,
    )
    save_resp.raise_for_status()
    print(f"[Spark] Express saved {save_resp.json().get('saved', '?')} aggregation document(s).")
except Exception as exc:
    print(f"[Spark] ERROR posting results: {exc}")
    sys.exit(1)

print("[Spark] Aggregation job complete.\n")
spark.stop()
