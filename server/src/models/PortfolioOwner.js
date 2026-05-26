const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const portfolioOwnerSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  ownerType: { type: String },
  name: { type: String, required: true },
  email: { type: String },
  region: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('PortfolioOwner', portfolioOwnerSchema, 'portfolio_owners');
