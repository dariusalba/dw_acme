const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const dataSourceSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  vendorName: { type: String, required: true, unique: true },
  apiEndpoint: { type: String },
  description: { type: String },
  licenseType: { type: String },
  lastSyncedAt: { type: Date, default: null }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('DataSource', dataSourceSchema, 'data_sources');
