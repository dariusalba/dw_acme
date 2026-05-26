const { SparkAggregation, SparkPrediction } = require('../models/SparkResult');
const { FinancialInstrument, TimeSeriesRecord } = require('../models');
const { execFile } = require('child_process');
const path = require('path');

// GET /api/spark/aggregations
async function getAggregations(req, res) {
  try {
    const { symbol, limit = 200 } = req.query;
    const query = symbol ? { symbol: { $in: symbol.split(',').map(s => s.trim().toUpperCase()) } } : {};
    const docs = await SparkAggregation.find(query).limit(Number(limit)).lean();
    res.json({ count: docs.length, aggregations: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/spark/predictions
async function getPredictions(req, res) {
  try {
    const { symbol, model } = req.query;
    const query = {};
    if (symbol) query.symbol = { $in: symbol.split(',').map(s => s.trim().toUpperCase()) };
    if (model) query.modelType = model;
    const docs = await SparkPrediction.find(query).lean();
    res.json({ count: docs.length, predictions: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/spark/predictions/:symbol
async function getPredictionBySymbol(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const docs = await SparkPrediction.find({ symbol }).lean();
    if (!docs.length) return res.status(404).json({ error: 'No predictions found. Run the ML job first.' });
    res.json({ symbol, predictions: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/spark/run   { job: 'aggregation'|'ml'|'all', symbol?: '...' }
function runJob(req, res) {
  const { job = 'all', symbol } = req.body;
  const sparkDir = path.join(__dirname, '../spark');
  const scripts = {
    aggregation: 'aggregation_job.py',
    ml: 'ml_prediction_job.py',
    all: 'run_jobs.sh',
  };
  const script = scripts[job];
  if (!script) return res.status(400).json({ error: 'job must be aggregation | ml | all' });

  const extraArgs = symbol ? ['--symbol', symbol] : [];
  const isShell = script.endsWith('.sh');
  const cmd = isShell ? 'bash' : 'python';
  const file = path.join(sparkDir, script);
  const cmdArgs = isShell ? [file, ...extraArgs] : [file, ...extraArgs];

  res.json({ status: 'started', job, message: `Spark job '${job}' launched in background.` });

  // Fire-and-forget — don't block the HTTP response
  execFile(cmd, cmdArgs, { cwd: path.join(__dirname, '../../'), timeout: 600_000 },
    (err, stdout, stderr) => {
      if (err) console.error(`[Spark] Job '${job}' error:`, err.message, stderr);
      else console.log(`[Spark] Job '${job}' finished.\n`, stdout.slice(-500));
    }
  );
}

// GET /api/spark/status  — quick check whether results exist
async function getStatus(req, res) {
  try {
    const [aggCount, predCount] = await Promise.all([
      SparkAggregation.countDocuments(),
      SparkPrediction.countDocuments(),
    ]);
    res.json({
      aggregations: aggCount,
      predictions: predCount,
      hasResults: aggCount > 0 || predCount > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Internal "data plane" endpoints — called by the PySpark jobs over HTTP so
// Python doesn't have to talk to MongoDB Atlas directly (Python's TLS stack
// has issues with some Atlas clusters; Node's driver works fine).
// ────────────────────────────────────────────────────────────────────────────

// GET /api/spark/internal/source-data?symbol=AAPL,MSFT
// Returns everything the Spark jobs need: instruments + time-series records.
async function getSourceData(req, res) {
  try {
    const { symbol } = req.query;

    const instQuery = symbol
      ? { symbol: { $in: symbol.split(',').map(s => s.trim().toUpperCase()) } }
      : {};

    const instruments = await FinancialInstrument
      .find(instQuery, { _id: 1, symbol: 1, name: 1, instrumentClass: 1, region: 1 })
      .lean();

    if (!instruments.length) {
      return res.json({ instruments: [], records: [] });
    }

    const ids = instruments.map(i => i._id);
    const recordsRaw = await TimeSeriesRecord
      .find({ instrumentId: { $in: ids } },
            { _id: 0, instrumentId: 1, date: 1, open: 1, close: 1, high: 1, low: 1, volume: 1 })
      .lean();

    // Normalise Decimal128 → Number so Python sees plain numbers
    const toNum = v => (v == null ? null : (typeof v === 'object' && v.toString ? parseFloat(v.toString()) : Number(v)));
    const records = recordsRaw.map(r => ({
      instrumentId: r.instrumentId,
      date:   r.date,
      open:   toNum(r.open),
      close:  toNum(r.close),
      high:   toNum(r.high),
      low:    toNum(r.low),
      volume: toNum(r.volume),
    }));

    res.json({
      instruments: instruments.map(i => ({
        _id: i._id,
        symbol: i.symbol,
        name: i.name ?? '',
        instrumentClass: i.instrumentClass ?? '',
        region: i.region ?? '',
      })),
      records,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/spark/internal/save-aggregations
// Body: { aggregations: [...] }  — overwrites the whole collection.
async function saveAggregations(req, res) {
  try {
    const { aggregations } = req.body;
    if (!Array.isArray(aggregations)) {
      return res.status(400).json({ error: 'aggregations must be an array' });
    }
    await SparkAggregation.deleteMany({});
    if (aggregations.length) {
      await SparkAggregation.insertMany(aggregations, { ordered: false });
    }
    res.json({ saved: aggregations.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/spark/internal/save-predictions
// Body: { predictions: [...] }  — overwrites the whole collection.
async function savePredictions(req, res) {
  try {
    const { predictions } = req.body;
    if (!Array.isArray(predictions)) {
      return res.status(400).json({ error: 'predictions must be an array' });
    }
    await SparkPrediction.deleteMany({});
    if (predictions.length) {
      await SparkPrediction.insertMany(predictions, { ordered: false });
    }
    res.json({ saved: predictions.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getAggregations, getPredictions, getPredictionBySymbol, runJob, getStatus,
  // Internal endpoints used by the Python Spark jobs:
  getSourceData, saveAggregations, savePredictions,
};
