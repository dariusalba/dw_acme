#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo " Acme DWH — Spark Pipeline"

echo ""
echo ">>> Step 1: Aggregation job"
python "$SCRIPT_DIR/aggregation_job.py" "$@"

echo ""
echo ">>> Step 2: ML prediction job"
python "$SCRIPT_DIR/ml_prediction_job.py" "$@"

echo ""
echo ">>> Both jobs finished successfully."
