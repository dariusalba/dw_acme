const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const portfolioAssetSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  portfolioId: { type: String, required: true, ref: 'Portfolio', index: true },
  instrumentId: { type: String, required: true, ref: 'FinancialInstrument', index: true },
  addedAt: { type: Date, required: true, default: Date.now },
  removedAt: { type: Date, default: null }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('PortfolioAsset', portfolioAssetSchema, 'portfolio_assets');
