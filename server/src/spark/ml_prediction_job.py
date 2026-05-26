
import sys
import os
import argparse
from datetime import datetime, timezone

#cli args
parser = argparse.ArgumentParser(description="Acme DWH Spark ML Job")
parser.add_argument("--symbol", type=str, default="AAPL,MSFT,NVDA,BTC,ETH",
                    help="Comma-separated symbols (default: AAPL,MSFT,NVDA,BTC,ETH)")
parser.add_argument("--model",  type=str, default="both",
                    choices=["lr", "gbt", "both"],
                    help="Model to train: lr=LinearRegression, gbt=GBTRegressor, both")
parser.add_argument("--api", type=str,
                    default=os.environ.get("EXPRESS_URL", "http://localhost:5000"),
                    help="Express server base URL (default: http://localhost:5000)")
args    = parser.parse_args()
API     = args.api.rstrip("/")
SYMBOLS = args.symbol
use_lr  = args.model in ("lr",  "both")
use_gbt = args.model in ("gbt", "both")

#fetch source data from Express
import requests

print(f"\n[Spark ML] Fetching source data from {API} …")
try:
    resp = requests.get(f"{API}/api/spark/internal/source-data",
                        params={"symbol": SYMBOLS}, timeout=120)
    resp.raise_for_status()
except Exception as exc:
    print(f"[Spark ML] ERROR: cannot reach Express at {API}: {exc}")
    print("[Spark ML] Make sure the Node.js server is running (npm run dev).")
    sys.exit(1)

payload = resp.json()
inst_rows = payload.get("instruments", [])
ts_raw    = payload.get("records", [])

print(f"[Spark ML] Got {len(inst_rows)} instrument(s) and {len(ts_raw)} time-series records.")

if not inst_rows or not ts_raw:
    print(f"[Spark ML] No data for symbols: {SYMBOLS}. Exiting.")
    sys.exit(0)

id_sym = {d["_id"]: d.get("symbol", "") for d in inst_rows}
print(f"[Spark ML] Processing: {list(id_sym.values())}")

# Parse rows for Spark
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

from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.regression import LinearRegression, GBTRegressor
from pyspark.ml.evaluation import RegressionEvaluator
from pyspark.ml import Pipeline

print("[Spark ML] Starting SparkSession …")
spark = (
    SparkSession.builder
    .appName("AcmeDWH-ML-Prediction")
    .master("local[*]")
    .config("spark.sql.session.timeZone", "UTC")
    .config("spark.driver.memory", "2g")
    .config("spark.ui.showConsoleProgress", "false")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")

ts_df = spark.createDataFrame(ts_rows)

FEATURES = ["lag_1", "lag_5", "lag_10", "ma_5", "ma_20",
            "day_of_week", "month", "high_low_range", "open_close_diff"]

def engineer_features(df):
    """Add lag, moving-average, and calendar features partitioned by instrument."""
    w   = Window.partitionBy("instrumentId").orderBy("date")
    w5  = Window.partitionBy("instrumentId").orderBy("date").rowsBetween(-4,  0)
    w20 = Window.partitionBy("instrumentId").orderBy("date").rowsBetween(-19, 0)

    return (
        df
        .withColumn("lag_1",  F.lag("close", 1).over(w))
        .withColumn("lag_5",  F.lag("close", 5).over(w))
        .withColumn("lag_10", F.lag("close", 10).over(w))
        .withColumn("ma_5",   F.avg("close").over(w5))
        .withColumn("ma_20",  F.avg("close").over(w20))
        .withColumn("day_of_week", F.dayofweek("date").cast(DoubleType()))
        .withColumn("month",       F.month("date").cast(DoubleType()))
        .withColumn("high_low_range",  F.col("high")  - F.col("low"))
        .withColumn("open_close_diff", F.col("close") - F.col("open"))
        .withColumn("target", F.lead("close", 1).over(w))   # next day's close
        .dropna(subset=FEATURES + ["target"])
    )

print("[Spark ML] Engineering features …")
featured = engineer_features(ts_df).cache()

eval_rmse = RegressionEvaluator(labelCol="target", predictionCol="prediction", metricName="rmse")
eval_mae  = RegressionEvaluator(labelCol="target", predictionCol="prediction", metricName="mae")
eval_r2   = RegressionEvaluator(labelCol="target", predictionCol="prediction", metricName="r2")

assembler = VectorAssembler(inputCols=FEATURES, outputCol="features_raw")
scaler    = StandardScaler(inputCol="features_raw", outputCol="features",
                           withMean=True, withStd=True)

all_results = []

for inst_id, symbol in id_sym.items():
    print(f"\n[Spark ML] Processing {symbol} …")
    df_inst = featured.filter(F.col("instrumentId") == inst_id).orderBy("date")
    n_total = df_inst.count()

    if n_total < 60:
        print(f"  ↳ Skipping {symbol}: only {n_total} rows after feature engineering (need ≥ 60)")
        continue

    n_train  = int(n_total * 0.8)
    rows     = df_inst.collect()
    train_df = spark.createDataFrame(rows[:n_train], schema=df_inst.schema)
    test_df  = spark.createDataFrame(rows[n_train:],  schema=df_inst.schema)

    models_to_run = []
    if use_lr:
        models_to_run.append(("LinearRegression",
            LinearRegression(featuresCol="features", labelCol="target",
                             maxIter=100, regParam=0.01, elasticNetParam=0.0)))
    if use_gbt:
        models_to_run.append(("GBTRegressor",
            GBTRegressor(featuresCol="features", labelCol="target",
                         maxIter=50, maxDepth=5, stepSize=0.1)))

    for model_name, regressor in models_to_run:
        print(f"  ↳ Training {model_name} ({n_train} train / {n_total - n_train} test rows) …")
        try:
            pipeline = Pipeline(stages=[assembler, scaler, regressor])
            fitted   = pipeline.fit(train_df)
            preds    = fitted.transform(test_df)

            rmse = eval_rmse.evaluate(preds)
            mae  = eval_mae.evaluate(preds)
            r2   = eval_r2.evaluate(preds)
            print(f"    RMSE={rmse:.4f}  MAE={mae:.4f}  R²={r2:.4f}")

            pred_rows = (
                preds.select("date", "target", "prediction")
                     .orderBy("date")
                     .limit(90)
                     .collect()
            )
            test_predictions = [
                {
                    "date":      str(r["date"])[:10],
                    "actual":    round(float(r["target"]),     4),
                    "predicted": round(float(r["prediction"]), 4),
                }
                for r in pred_rows
            ]

            all_results.append({
                "instrumentId":    inst_id,
                "symbol":          symbol,
                "modelType":       model_name,
                "features":        FEATURES,
                "trainRows":       n_train,
                "testRows":        n_total - n_train,
                "rmse":            round(rmse, 4),
                "mae":             round(mae,  4),
                "r2":              round(r2,   4),
                "testPredictions": test_predictions,
                "computedAt":      datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            print(f"    ERROR training {model_name} for {symbol}: {exc}")

featured.unpersist()

#send results to Express
if all_results:
    print(f"\n[Spark ML] Posting {len(all_results)} result(s) to Express …")
    try:
        save_resp = requests.post(
            f"{API}/api/spark/internal/save-predictions",
            json={"predictions": all_results},
            timeout=120,
        )
        save_resp.raise_for_status()
        print(f"[Spark ML] Express saved {save_resp.json().get('saved', '?')} prediction document(s).")
    except Exception as exc:
        print(f"[Spark ML] ERROR posting results: {exc}")
        sys.exit(1)
    print("[Spark ML] ML prediction job complete.\n")
else:
    print("[Spark ML] No results to save (all symbols had insufficient data).")

spark.stop()
