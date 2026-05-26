const mongoose = require('mongoose');

// spark aggregations
const sparkAggregationSchema = new mongoose.Schema({
  instrumentId: { type: String, index: true },
  symbol: String,
  name: String,
  instrumentClass: String,
  region: String,
  dataPoints: Number,
  avgClose: Number,
  minLow: Number,
  maxHigh: Number,
  avgVolume: Number,
  stddevClose: Number,
  annualisedVolatility: Number,
  firstDate: Date,
  lastDate: Date,
  computedAt: String,
}, { collection: 'spark_aggregations', versionKey: false, strict: false });

//spark predictions
const sparkPredictionSchema = new mongoose.Schema({
  instrumentId: { type: String, index: true },
  symbol: String,
  modelType: String,
  features: [String],
  trainRows: Number,
  testRows: Number,
  rmse: Number,
  mae: Number,
  r2: Number,
  testPredictions: [{ date: String, actual: Number, predicted: Number }],
  computedAt: String,
}, { collection: 'spark_predictions', versionKey: false, strict: false });

const SparkAggregation = mongoose.model('SparkAggregation', sparkAggregationSchema);
const SparkPrediction = mongoose.model('SparkPrediction', sparkPredictionSchema);

module.exports = { SparkAggregation, SparkPrediction };
