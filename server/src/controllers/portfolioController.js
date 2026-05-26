const { PortfolioOwner, Portfolio, PortfolioAsset } = require('../models');

// Portfolio Owners
async function listOwners(req, res) {
  try {
    const owners = await PortfolioOwner.find().lean();
    res.json(owners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getOwner(req, res) {
  try {
    const owner = await PortfolioOwner.findById(req.params.id).lean();
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const portfolios = await Portfolio.find({ ownerId: req.params.id }).lean();
    res.json({ ...owner, portfolios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createOwner(req, res) {
  try {
    const { ownerType, name, email, region } = req.body;
    const owner = await PortfolioOwner.create({ ownerType, name, email, region });
    res.status(201).json(owner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Portfolios
async function listPortfolios(req, res) {
  try {
    const portfolios = await Portfolio.find().lean();
    res.json(portfolios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPortfolio(req, res) {
  try {
    const portfolio = await Portfolio.findById(req.params.id).lean();
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const assets = await PortfolioAsset.find({
      portfolioId: req.params.id,
      removedAt: null
    }).lean();
    res.json({ ...portfolio, assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createPortfolio(req, res) {
  try {
    const { ownerId, name, description, currency } = req.body;
    const portfolio = await Portfolio.create({ ownerId, name, description, currency });
    res.status(201).json(portfolio);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Portfolio Assets
async function addAsset(req, res) {
  try {
    const { portfolioId, instrumentId } = req.body;
    const asset = await PortfolioAsset.create({ portfolioId, instrumentId });
    res.status(201).json(asset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function removeAsset(req, res) {
  try {
    const asset = await PortfolioAsset.findById(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    asset.removedAt = new Date();
    await asset.save();
    res.json({ message: 'Asset removed from portfolio', asset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listOwners, getOwner, createOwner,
  listPortfolios, getPortfolio, createPortfolio,
  addAsset, removeAsset
};
