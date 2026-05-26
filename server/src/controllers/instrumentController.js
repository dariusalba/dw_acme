const { FinancialInstrument, InstrumentVersion } = require('../models');

// Q1: Return limited info about all financial assets
async function listInstruments(req, res) {
  try {
    const instruments = await FinancialInstrument.find()
      .select('_id symbol instrumentClass name exchange region')
      .lean();
    res.json(instruments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Q2: Return all details of an asset by ID (with current version attributes)
async function getInstrument(req, res) {
  try {
    const instrument = await FinancialInstrument.findById(req.params.id).lean();
    if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

    const currentVersion = await InstrumentVersion.findOne({
      instrumentId: req.params.id,
      isDeleted: { $ne: true },
      validFrom: { $lte: new Date() },
      $or: [{ validTo: null }, { validTo: { $gt: new Date() } }]
    }).sort({ validFrom: -1 }).lean();

    res.json({ ...instrument, currentVersion: currentVersion || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get instrument at a specific point in time (temporal query)
async function getInstrumentAtTime(req, res) {
  try {
    const { id } = req.params;
    const { asOf } = req.query;
    const asOfDate = asOf ? new Date(asOf) : new Date();

    const instrument = await FinancialInstrument.findById(id).lean();
    if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

    const version = await InstrumentVersion.findOne({
      instrumentId: id,
      validFrom: { $lte: asOfDate },
      $or: [{ validTo: null }, { validTo: { $gt: asOfDate } }]
    }).sort({ validFrom: -1 }).lean();

    if (version && version.isDeleted) {
      return res.json({ ...instrument, version, status: 'deleted_at_requested_time' });
    }

    res.json({ ...instrument, version: version || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Create a new instrument (temporal: inserts only)
async function createInstrument(req, res) {
  try {
    const { symbol, instrumentClass, name, description, currency, exchange, isin, region, attributes } = req.body;

    const instrument = await FinancialInstrument.create({
      symbol, instrumentClass, name, description, currency, exchange, isin, region
    });

    const version = await InstrumentVersion.create({
      instrumentId: instrument._id,
      validFrom: new Date(),
      validTo: null,
      isDeleted: false,
      attributes: attributes || {}
    });

    res.status(201).json({ ...instrument.toJSON(), currentVersion: version.toJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// "Update" an instrument (temporal: close old version, create new version)
async function updateInstrument(req, res) {
  try {
    const { id } = req.params;
    const { attributes } = req.body;

    const instrument = await FinancialInstrument.findById(id);
    if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

    const now = new Date();

    await InstrumentVersion.updateMany(
      { instrumentId: id, validTo: null, isDeleted: false },
      { $set: { validTo: now } }
    );

    const newVersion = await InstrumentVersion.create({
      instrumentId: id,
      validFrom: now,
      validTo: null,
      isDeleted: false,
      attributes: attributes || {}
    });

    res.json({ instrument, currentVersion: newVersion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// "Delete" an instrument (temporal: mark as deleted with a marker record)
async function deleteInstrument(req, res) {
  try {
    const { id } = req.params;

    const instrument = await FinancialInstrument.findById(id);
    if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

    const now = new Date();

    await InstrumentVersion.updateMany(
      { instrumentId: id, validTo: null, isDeleted: false },
      { $set: { validTo: now } }
    );

    await InstrumentVersion.create({
      instrumentId: id,
      validFrom: now,
      validTo: null,
      isDeleted: true,
      attributes: {}
    });

    res.json({ message: 'Instrument marked as deleted', instrumentId: id, deletedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get version history for an instrument
async function getInstrumentVersions(req, res) {
  try {
    const versions = await InstrumentVersion.find({ instrumentId: req.params.id })
      .sort({ validFrom: -1 })
      .lean();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listInstruments,
  getInstrument,
  getInstrumentAtTime,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  getInstrumentVersions
};
