const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const timeSeriesRecordSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  instrumentId: { type: String, required: true, ref: 'FinancialInstrument', index: true },
  dataSourceId: { type: String, required: true, ref: 'DataSource', index: true },
  date: { type: Date, required: true },
  open: { type: mongoose.Schema.Types.Decimal128 },
  close: { type: mongoose.Schema.Types.Decimal128 },
  adjustedClose: { type: mongoose.Schema.Types.Decimal128 },
  high: { type: mongoose.Schema.Types.Decimal128 },
  low: { type: mongoose.Schema.Types.Decimal128 },
  volume: { type: mongoose.Schema.Types.Decimal128 }
}, {
  timestamps: false,
  versionKey: false,
  toJSON: {
    transform(doc, ret) {
      for (const key of ['open', 'close', 'adjustedClose', 'high', 'low', 'volume']) {
        if (ret[key] != null) ret[key] = parseFloat(ret[key].toString());
      }
      return ret;
    }
  }
});

timeSeriesRecordSchema.index({ instrumentId: 1, dataSourceId: 1, date: -1 });

module.exports = mongoose.model('TimeSeriesRecord', timeSeriesRecordSchema, 'time_series_records');
