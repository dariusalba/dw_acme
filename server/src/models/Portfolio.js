const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const portfolioSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  ownerId: { type: String, required: true, ref: 'PortfolioOwner', index: true },
  name: { type: String, required: true },
  description: { type: String },
  currency: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('Portfolio', portfolioSchema, 'portfolios');
