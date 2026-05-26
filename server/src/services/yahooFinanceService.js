
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchGlobalQuote(symbol) {
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=5d&includeAdjustedClose=true`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Yahoo Finance request failed: HTTP ${res.status}`);

  const data = await res.json();
  const chartErr = data?.chart?.error;
  if (chartErr) throw new Error(`Yahoo Finance error: ${chartErr.description ?? chartErr.code}`);

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo Finance returned no data for ' + symbol);

  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const adjArr = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  // Walk back from the last entry to find a day with a valid close
  let lastIdx = timestamps.length - 1;
  while (lastIdx > 0 && (q.close?.[lastIdx] == null || isNaN(q.close[lastIdx]))) lastIdx--;

  const close = q.close?.[lastIdx];
  if (close == null) throw new Error('No valid close price found for ' + symbol);

  const prevClose = q.close?.[Math.max(lastIdx - 1, 0)] ?? close;
  const change = parseFloat((close - prevClose).toFixed(4));
  const changePct = prevClose ? ((change / prevClose) * 100).toFixed(2) + '%' : '0.00%';

  return {
    symbol: symbol.toUpperCase(),
    open: q.open?.[lastIdx] ?? close,
    high: q.high?.[lastIdx] ?? close,
    low: q.low?.[lastIdx] ?? close,
    price: close,
    volume: q.volume?.[lastIdx] ?? 0,
    latestTradingDay: new Date(timestamps[lastIdx] * 1000).toISOString().split('T')[0],
    previousClose: prevClose,
    change,
    changePercent: changePct,
    adjustedClose: adjArr[lastIdx] ?? close,
  };
}

module.exports = { fetchGlobalQuote };
