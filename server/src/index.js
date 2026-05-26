require('dotenv').config({
  path: require('path').resolve(__dirname, '.env')
});
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

const instrumentRoutes = require('./routes/instruments');
const dataSourceRoutes = require('./routes/dataSources');
const timeSeriesRoutes = require('./routes/timeSeries');
const portfolioRoutes = require('./routes/portfolios');
const analyticsRoutes = require('./routes/analytics');
const assistantRoutes = require('./routes/assistant');
const marketDataRoutes = require('./routes/marketData');
const sparkRoutes      = require('./routes/spark');
const { startScheduledMarketRefresh } = require('./services/marketDataScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

console.log('MONGODB_URI:', process.env.MONGODB_URI);

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(morgan('dev'));

app.use('/api/instruments', instrumentRoutes);
app.use('/api/data-sources', dataSourceRoutes);
app.use('/api/time-series', timeSeriesRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/market-data', marketDataRoutes);
app.use('/api/spark',       sparkRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startScheduledMarketRefresh();
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });

module.exports = app;
