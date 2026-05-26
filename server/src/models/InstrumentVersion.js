const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const instrumentVersionSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  instrumentId: { type: String, required: true, ref: 'FinancialInstrument', index: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  isDeleted: { type: Boolean, default: false },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: false,
  versionKey: false
});

instrumentVersionSchema.index({ instrumentId: 1, validFrom: -1 });

module.exports = mongoose.model('InstrumentVersion', instrumentVersionSchema, 'instrument_versions');
