const { DataSource } = require('../models');

// Q3: Return limited info about all data sources
async function listDataSources(req, res) {
  try {
    const sources = await DataSource.find()
      .select('_id vendorName licenseType lastSyncedAt')
      .lean();
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Q4: Return all details of a data source by ID
async function getDataSource(req, res) {
  try {
    const source = await DataSource.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ error: 'Data source not found' });
    res.json(source);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createDataSource(req, res) {
  try {
    const { vendorName, apiEndpoint, description, licenseType } = req.body;
    const source = await DataSource.create({ vendorName, apiEndpoint, description, licenseType });
    res.status(201).json(source);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { listDataSources, getDataSource, createDataSource };
