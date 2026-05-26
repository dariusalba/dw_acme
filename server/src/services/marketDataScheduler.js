const { refreshSymbols } = require('./marketDataService');

const intervalMinutes = parseInt(process.env.MARKET_DATA_REFRESH_INTERVAL_MINUTES, 10) || 0;
const refreshLimit = parseInt(process.env.MARKET_DATA_REFRESH_LIMIT, 10) || 5;

async function runRefresh() {
  console.log('[market-data] scheduled refresh started');
  try {
    const result = await refreshSymbols({ limit: refreshLimit });
    console.log('[market-data] scheduled refresh completed', result);
  } catch (err) {
    console.error('[market-data] scheduled refresh failed:', err.message);
  }
}

function startScheduledMarketRefresh() {
  if (!intervalMinutes || intervalMinutes <= 0) {
    console.log('[market-data] scheduled refresh disabled; set MARKET_DATA_REFRESH_INTERVAL_MINUTES to enable');
    return;
  }

  runRefresh();
  setInterval(runRefresh, intervalMinutes * 60 * 1000);
  console.log(`[market-data] scheduled refresh enabled every ${intervalMinutes} minutes`);
}

module.exports = {
  startScheduledMarketRefresh
};
