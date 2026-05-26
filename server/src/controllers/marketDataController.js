const { fetchGlobalQuote } = require('../services/yahooFinanceService');
const { ingestSymbolQuote, refreshSymbols } = require('../services/marketDataService');

async function getGlobalQuote(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const quote = await fetchGlobalQuote(symbol);
    res.json({ quote });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function ingestQuote(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const sourceId = req.body.dataSourceId || 'ds-yahoo';
    const result = await ingestSymbolQuote(symbol, sourceId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function refreshQuotes(req, res) {
  try {
    const { symbols, limit, dataSourceId } = req.body;
    const refreshResult = await refreshSymbols({ symbols, limit, dataSourceId });
    res.json(refreshResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getGlobalQuote,
  ingestQuote,
  refreshQuotes
};
