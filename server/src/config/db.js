const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/acme_financial_dwh';
  if (!uri) throw new Error('Missing MongoDB URI');
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = connectDB;
