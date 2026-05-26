const { v4: uuidv4 } = require('uuid');
const { TimeSeriesRecord, DataSource } = require('../models');

function normalizeTimeSeriesRecords(records) {
  return records.map(rec => {
    const normalized = { ...rec };
    ['open', 'close', 'adjustedClose', 'high', 'low', 'volume'].forEach(key => {
      if (normalized[key] != null && typeof normalized[key].toString === 'function') {
        normalized[key] = parseFloat(normalized[key].toString());
      }
    });
    return normalized;
  });
}

// Q5: Return time-series data for specified asset and data source
async function getTimeSeries(req, res) {
  try {
    const { instrumentId, dataSourceId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const query = { instrumentId, dataSourceId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    let q = TimeSeriesRecord.find(query).sort({ date: -1 });
    if (limit) q = q.limit(parseInt(limit, 10));

    const records = normalizeTimeSeriesRecords(await q.lean());
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// List time series for a given instrument across all sources
async function getTimeSeriesByInstrument(req, res) {
  try {
    const { instrumentId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const query = { instrumentId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    let q = TimeSeriesRecord.find(query).sort({ date: -1 });
    if (limit) q = q.limit(parseInt(limit, 10));

    const records = normalizeTimeSeriesRecords(await q.lean());
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function ingestTimeSeries(req, res) {
  try {
    const { instrumentId, dataSourceId, records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }

    const docs = records.map(r => ({
      instrumentId,
      dataSourceId,
      date: new Date(r.date),
      open: r.open,
      close: r.close,
      adjustedClose: r.adjustedClose ?? r.close,
      high: r.high,
      low: r.low,
      volume: r.volume
    }));

    // Deduplicate: upsert on (instrumentId, dataSourceId, date) — skip existing records
    const ops = docs.map(doc => ({
      updateOne: {
        filter: { instrumentId: doc.instrumentId, dataSourceId: doc.dataSourceId, date: doc.date },
        update: { $setOnInsert: { _id: uuidv4(), ...doc } },
        upsert: true
      }
    }));
    const writeResult = await TimeSeriesRecord.bulkWrite(ops, { ordered: false });
    const inserted = writeResult.upsertedCount;
    const skipped  = docs.length - inserted;

    await DataSource.findByIdAndUpdate(dataSourceId, { lastSyncedAt: new Date() });

    res.status(201).json({ inserted, skipped });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { getTimeSeries, getTimeSeriesByInstrument, ingestTimeSeries };
