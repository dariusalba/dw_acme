const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const financialInstrumentSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  symbol: { type: String, required: true, index: true },
  instrumentClass: { type: String, required: true, index: true },
  name: { type: String },
  description: { type: String },
  currency: { type: String },
  exchange: { type: String },
  isin: { type: String },
  region: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('FinancialInstrument', financialInstrumentSchema, 'financial_instruments');
