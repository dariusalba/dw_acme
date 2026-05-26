const { fetchGlobalQuote } = require('./yahooFinanceService');
const { FinancialInstrument, DataSource, TimeSeriesRecord } = require('../models');

const DEFAULT_SOURCE_ID = 'ds-yahoo';
const DEFAULT_SOURCE_META = {
  _id: DEFAULT_SOURCE_ID,
  vendorName: 'Yahoo Finance',
  apiEndpoint: 'https://query1.finance.yahoo.com/v8/finance/chart',
  description: 'Free market quotes from Yahoo Finance (no API key required)',
  licenseType: 'free'
};

async function getOrCreateSource(sourceId = DEFAULT_SOURCE_ID) {
  let source = await DataSource.findById(sourceId);
  if (!source) {
    source = await DataSource.create({
      ...DEFAULT_SOURCE_META,
      _id: sourceId,
      lastSyncedAt: new Date()
    });
  } else {
    source.lastSyncedAt = new Date();
    await source.save();
  }
  return source;
}

async function ingestSymbolQuote(symbol, sourceId = DEFAULT_SOURCE_ID) {
  const quote = await fetchGlobalQuote(symbol.toUpperCase());
  const instrument = await FinancialInstrument.findOne({ symbol: quote.symbol }).lean();
  if (!instrument) {
    throw new Error(`Instrument ${quote.symbol} not found`);
  }

  const dataSource = await getOrCreateSource(sourceId);
  const record = await TimeSeriesRecord.create({
    instrumentId: instrument._id,
    dataSourceId: dataSource._id,
    date: quote.latestTradingDay ? new Date(quote.latestTradingDay) : new Date(),
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.price,
    adjustedClose: quote.adjustedClose ?? quote.price,
    volume: quote.volume
  });

  return { record, quote, dataSource };
}

async function refreshSymbols({ symbols = [], limit = 5, dataSourceId = DEFAULT_SOURCE_ID } = {}) {
  const instruments = symbols.length
    ? await FinancialInstrument.find({ symbol: { $in: symbols.map(s => s.toUpperCase()) } }).lean()
    : await FinancialInstrument.find().limit(limit).lean();

  if (instruments.length === 0) {
    return { refreshed: 0, results: [] };
  }

  const results = [];
  for (const instrument of instruments) {
    try {
      const { record, quote, dataSource } = await ingestSymbolQuote(instrument.symbol, dataSourceId);
      results.push({ symbol: instrument.symbol, success: true, quote, recordId: record._id, sourceId: dataSource._id });
      await new Promise(resolve => setTimeout(resolve, 12000));
    } catch (err) {
      results.push({ symbol: instrument.symbol, success: false, error: err.message });
    }
  }

  return { refreshed: results.filter(r => r.success).length, results };
}

module.exports = {
  getOrCreateSource,
  ingestSymbolQuote,
  refreshSymbols
};
