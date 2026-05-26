const { TimeSeriesRecord, FinancialInstrument } = require('../models');

// Aggregate stats for an instrument (min, max, avg, count)
async function getAggregateStats(req, res) {
  try {
    const { instrumentId } = req.params;
    const { startDate, endDate, dataSourceId } = req.query;

    const match = { instrumentId };
    if (dataSourceId) match.dataSourceId = dataSourceId;
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$instrumentId',
          count: { $sum: 1 },
          avgClose: { $avg: { $toDouble: '$close' } },
          minLow: { $min: { $toDouble: '$low' } },
          maxHigh: { $max: { $toDouble: '$high' } },
          avgVolume: { $avg: { $toDouble: '$volume' } },
          totalVolume: { $sum: { $toDouble: '$volume' } },
          firstDate: { $min: '$date' },
          lastDate: { $max: '$date' }
        }
      }
    ];

    const result = await TimeSeriesRecord.aggregate(pipeline);
    if (result.length === 0) {
      return res.json({ instrumentId, stats: null });
    }

    res.json({ instrumentId, stats: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Compare two instruments over a time range
async function compareInstruments(req, res) {
  try {
    const { id1, id2 } = req.params;
    const { startDate, endDate } = req.query;

    const match = { instrumentId: { $in: [id1, id2] } };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$instrumentId',
          count: { $sum: 1 },
          avgClose: { $avg: { $toDouble: '$close' } },
          minLow: { $min: { $toDouble: '$low' } },
          maxHigh: { $max: { $toDouble: '$high' } },
          avgVolume: { $avg: { $toDouble: '$volume' } },
          firstDate: { $min: '$date' },
          lastDate: { $max: '$date' }
        }
      }
    ];

    const results = await TimeSeriesRecord.aggregate(pipeline);
    const instruments = await FinancialInstrument.find({ _id: { $in: [id1, id2] } }).lean();

    const comparison = instruments.map(inst => {
      const stats = results.find(r => r._id === inst._id);
      return { instrument: inst, stats: stats || null };
    });

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get price trends (daily close prices) for charting
async function getPriceTrend(req, res) {
  try {
    const { instrumentId } = req.params;
    const { startDate, endDate, dataSourceId, interval } = req.query;

    const match = { instrumentId };
    if (dataSourceId) match.dataSourceId = dataSourceId;
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    let groupId;
    switch (interval) {
      case 'weekly':
        groupId = { year: { $year: '$date' }, week: { $isoWeek: '$date' } };
        break;
      case 'monthly':
        groupId = { year: { $year: '$date' }, month: { $month: '$date' } };
        break;
      default:
        groupId = { year: { $year: '$date' }, month: { $month: '$date' }, day: { $dayOfMonth: '$date' } };
    }

    const pipeline = [
      { $match: match },
      { $sort: { date: 1 } },
      {
        $group: {
          _id: groupId,
          avgOpen: { $avg: { $toDouble: '$open' } },
          avgClose: { $avg: { $toDouble: '$close' } },
          maxHigh: { $max: { $toDouble: '$high' } },
          minLow: { $min: { $toDouble: '$low' } },
          totalVolume: { $sum: { $toDouble: '$volume' } },
          date: { $first: '$date' }
        }
      },
      { $sort: { date: 1 } }
    ];

    const results = await TimeSeriesRecord.aggregate(pipeline);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Simple next-day price forecast using moving average
async function getForecast(req, res) {
  try {
    const { instrumentId } = req.params;
    const { dataSourceId, window } = req.query;
    const windowSize = parseInt(window, 10) || 5;

    const match = { instrumentId };
    if (dataSourceId) match.dataSourceId = dataSourceId;

    const recentRecords = await TimeSeriesRecord.find(match)
      .sort({ date: -1 })
      .limit(windowSize)
      .lean();

    if (recentRecords.length === 0) {
      return res.json({ instrumentId, forecast: null, message: 'No data available' });
    }

    const closes = recentRecords.map(r => parseFloat(r.close.toString()));
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;

    const lastDate = recentRecords[0].date;
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);

    res.json({
      instrumentId,
      method: `simple_moving_average_${windowSize}`,
      windowSize,
      lastDate,
      forecastDate: nextDate,
      forecastedClose: Math.round(avgClose * 100) / 100,
      recentCloses: closes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function exportTimeSeries(req, res) {
  try {
    const { instrumentId } = req.params;
    const { startDate, endDate, dataSourceId, format } = req.query;

    const match = { instrumentId };
    if (dataSourceId) match.dataSourceId = dataSourceId;
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const records = await TimeSeriesRecord.find(match).sort({ date: 1 }).lean();

    if (format === 'csv') {
      const header = 'instrumentId,dataSourceId,date,open,high,low,close,adjustedClose,volume\n';
      const rows = records.map(record => {
        const date = new Date(record.date).toISOString();
        return [
          record.instrumentId,
          record.dataSourceId,
          date,
          record.open,
          record.high,
          record.low,
          record.close,
          record.adjustedClose ?? '',
          record.volume
        ].join(',');
      }).join('\n');
      res.header('Content-Type', 'text/csv');
      return res.send(header + rows);
    }

    res.json({ instrumentId, count: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Risk metrics: volatility, max drawdown, avg daily return
async function getRiskMetrics(req, res) {
  try {
    const { instrumentId } = req.params;
    const { dataSourceId, startDate, endDate } = req.query;

    const match = { instrumentId };
    if (dataSourceId) match.dataSourceId = dataSourceId;
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const records = await TimeSeriesRecord.find(match).sort({ date: 1 }).lean();

    if (records.length < 2) {
      return res.json({ instrumentId, risk: null, message: 'Insufficient data' });
    }

    const closes = records.map(r => parseFloat(r.close.toString()));

    // Daily returns
    const dailyReturns = [];
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
    const dailyVolatility = Math.sqrt(variance);
    const annualizedVolatility = dailyVolatility * Math.sqrt(252);

    // Max drawdown
    let peak = closes[0];
    let maxDrawdown = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      const dd = (peak - c) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Sharpe-like ratio (assume 0 risk-free rate)
    const sharpeRatio = annualizedVolatility > 0
      ? (meanReturn * 252) / annualizedVolatility
      : 0;

    const riskCategory = annualizedVolatility < 0.15 ? 'Low'
      : annualizedVolatility < 0.35 ? 'Medium'
      : 'High';

    res.json({
      instrumentId,
      dataPoints: records.length,
      period: { from: records[0].date, to: records[records.length - 1].date },
      annualizedVolatilityPct: Math.round(annualizedVolatility * 10000) / 100,
      dailyVolatilityPct: Math.round(dailyVolatility * 10000) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 10000) / 100,
      avgDailyReturnPct: Math.round(meanReturn * 10000) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      riskCategory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAggregateStats, compareInstruments, getPriceTrend, getForecast, exportTimeSeries, getRiskMetrics };
