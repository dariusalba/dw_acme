
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB           = require('../config/db');
const FinancialInstrument = require('../models/FinancialInstrument');
const TimeSeriesRecord    = require('../models/TimeSeriesRecord');
const { v4: uuidv4 }      = require('uuid');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.findIndex(a => a === `--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}
const DRY_RUN       = args.includes('--dry-run');
const DEBUG         = args.includes('--debug');
const SYMBOL_FILTER = getArg('symbols')?.split(',').map(s => s.trim().toUpperCase()) ?? null;
const LIMIT         = getArg('limit') ? parseInt(getArg('limit'), 10) : Infinity;
const FROM_DATE     = getArg('from')  ?? '20230101';
const TO_DATE       = getArg('to')    ?? todayStr();
const DATA_SOURCE_ID = 'ds-yahoo';
const RATE_LIMIT_MS  = 800;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
function toUnix(yyyymmdd) {
  const s = String(yyyymmdd);
  return Math.floor(new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`).getTime() / 1000);
}

// ─── Symbol mapping ───────────────────────────────────────────────────────────
const CRYPTO_SYMBOLS = new Set([
  'BTC','ETH','BNB','SOL','XRP','ADA','AVAX','DOT','LINK','MATIC',
  'DOGE','SHIB','LTC','XLM','ALGO'
]);
const EXCHANGE_SUFFIX = {
  'XETR': '.DE', 'FSX': '.DE',
  'LSE': '.L',   'XLON': '.L',
  'TYO': '.T',   'TSE': '.T',
  'HKEX': '.HK', 'HKG': '.HK',
  'SSE': '.SS',  'SZSE': '.SZ',
};
function toYahooSymbol(symbol, exchange, region, instrumentClass) {
  if (instrumentClass === 'crypto' || CRYPTO_SYMBOLS.has(symbol)) return `${symbol}-USD`;
  if (['bond', 'futures', 'index'].includes(instrumentClass)) return null;
  if (exchange && EXCHANGE_SUFFIX[exchange]) return symbol + EXCHANGE_SUFFIX[exchange];
  if (region === 'Europe') return symbol + '.DE';
  if (region === 'Asia')   return symbol + '.T';
  if (region === 'China')  return symbol + '.SS';
  return symbol;
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────
async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      });
      if (res.status === 404) return null;
      if (res.status === 429) { await sleep(5000 * attempt); throw new Error('rate-limited (429)'); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(attempt * 2500);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Parse Yahoo v8 chart JSON response ──────────────────────────────────────
// Response shape: { chart: { result: [{ timestamp: [...], indicators: { quote: [{open,high,low,close,volume}], adjclose: [{adjclose}] } }] } }
function parseChartJSON(data) {
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const quote      = result.indicators?.quote?.[0] ?? {};
  const adjClose   = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  const records = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null || isNaN(close)) continue;
    records.push({
      date:         new Date(timestamps[i] * 1000),
      open:         quote.open?.[i]   ?? close,
      high:         quote.high?.[i]   ?? close,
      low:          quote.low?.[i]    ?? close,
      close,
      adjustedClose: adjClose[i]      ?? close,
      volume:       quote.volume?.[i] ?? 0,
    });
  }
  return records;
}

// ─── Ingestion ────────────────────────────────────────────────────────────────
async function ingestRecords(instrumentId, rows) {
  if (rows.length === 0) return 0;
  const existing = await TimeSeriesRecord.find(
    { instrumentId, dataSourceId: DATA_SOURCE_ID }, { date: 1, _id: 0 }
  ).lean();
  const existingSet = new Set(existing.map(r => r.date.getTime()));
  const toInsert = rows
    .filter(r => !existingSet.has(r.date.getTime()))
    .map(r => ({ _id: uuidv4(), instrumentId, dataSourceId: DATA_SOURCE_ID, ...r }));
  if (toInsert.length === 0) return 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    await TimeSeriesRecord.insertMany(toInsert.slice(i, i + 500), { ordered: false });
  }
  return toInsert.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await connectDB();

  const query = SYMBOL_FILTER ? { symbol: { $in: SYMBOL_FILTER } } : {};
  let instruments = await FinancialInstrument.find(query).lean();
  if (LIMIT < Infinity) instruments = instruments.slice(0, LIMIT);

  const p1 = toUnix(FROM_DATE);
  const p2 = toUnix(TO_DATE) + 86400;

  console.log(`\nYahoo Finance fetcher — ${instruments.length} instrument(s) | ${FROM_DATE} → ${TO_DATE}\n`);
  if (DRY_RUN) console.log('DRY RUN — nothing will be written\n');

  let totalInserted = 0, skipped = 0, failed = 0;

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const sym  = toYahooSymbol(inst.symbol, inst.exchange, inst.region, inst.instrumentClass);

    process.stdout.write(`[${String(i+1).padStart(3)}/${instruments.length}] ${inst.symbol.padEnd(10)} `);

    if (!sym) { console.log('→ skip (class not supported)'); skipped++; continue; }

    // Yahoo Finance v8 chart API — no crumb/cookies needed for public symbols
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
                `?interval=1d&period1=${p1}&period2=${p2}&events=history&includeAdjustedClose=true`;

    try {
      if (DRY_RUN) { console.log(`→ dry-run  ${sym}`); continue; }

      const data = await fetchJSON(url);
      if (data === null) { console.log(`→ not found  (${sym})`); skipped++; continue; }

      const chartErr = data?.chart?.error;
      if (chartErr) { console.log(`→ Yahoo error: ${chartErr.description ?? chartErr.code}  (${sym})`); skipped++; continue; }

      if (DEBUG && !data?.chart?.result?.[0]) {
        console.log(`→ no result  (${sym})  raw: ${JSON.stringify(data).slice(0, 150)}`);
        skipped++; continue;
      }

      const rows = parseChartJSON(data);
      if (rows.length === 0) {
        console.log(`→ no rows  (${sym})`);
        skipped++;
      } else {
        const inserted = await ingestRecords(inst._id, rows);
        totalInserted += inserted;
        console.log(`→ ${String(rows.length).padStart(4)} rows, ${String(inserted).padStart(4)} new  (${sym})`);
      }
    } catch (err) {
      console.log(`→ ERROR: ${err.message}`);
      failed++;
    }

    if (i < instruments.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Total inserted : ${totalInserted}`);
  console.log(`Skipped        : ${skipped}`);
  console.log(`Failed         : ${failed}`);
  console.log('─────────────────────────────────────────\n');

  process.exit(0);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
