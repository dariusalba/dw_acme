require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const {
  FinancialInstrument, InstrumentVersion, DataSource,
  TimeSeriesRecord, PortfolioOwner, Portfolio, PortfolioAsset
} = require('../models');

// ── Box-Muller normal random ──────────────────────────────────────────────────
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Geometric Brownian Motion price series ────────────────────────────────────
// annualVol: e.g. 0.25 = 25% annual vol   annualDrift: e.g. 0.08 = 8% annual
function generateGBM(instrumentId, dataSourceId, basePrice, annualVol, annualDrift, tradingDays) {
  const records = [];
  const start = new Date('2023-01-02');
  let price = basePrice;
  const dt = 1 / 252;
  const drift = (annualDrift - 0.5 * annualVol ** 2) * dt;
  const diffusion = annualVol * Math.sqrt(dt);
  let calendarDay = 0;

  for (let i = 0; i < tradingDays; i++) {
    // advance calendar, skip weekends
    let date = new Date(start);
    date.setDate(date.getDate() + calendarDay);
    while (date.getDay() === 0 || date.getDay() === 6) {
      calendarDay++;
      date = new Date(start);
      date.setDate(date.getDate() + calendarDay);
    }
    calendarDay++;

    price = price * Math.exp(drift + diffusion * randn());
    price = Math.max(price, 0.01);

    const dayRange = price * annualVol / Math.sqrt(252);
    const open  = Math.max(price + randn() * dayRange * 0.4, 0.01);
    const close = Math.max(price + randn() * dayRange * 0.4, 0.01);
    const high  = Math.max(open, close) + Math.abs(randn()) * dayRange * 0.2;
    const low   = Math.min(open, close) - Math.abs(randn()) * dayRange * 0.2;
    const volume = Math.round(Math.abs(randn() * 5e6 + 10e6) * (basePrice > 1000 ? 0.1 : basePrice > 100 ? 0.5 : 2));

    records.push({
      instrumentId,
      dataSourceId,
      date,
      open:  Math.round(open  * 100) / 100,
      close: Math.round(close * 100) / 100,
      adjustedClose: Math.round(close * 100) / 100,
      high:  Math.round(high  * 100) / 100,
      low:   Math.max(Math.round(low * 100) / 100, 0.01),
      volume
    });
  }
  return records;
}

// ── Instrument catalogue ──────────────────────────────────────────────────────
// [id, symbol, class, name, exchange, currency, region, basePrice, annualVol, annualDrift]
const INSTRUMENTS = [
  // ── US Technology ────────────────────────────────────────────────────────────
  ['inst-aapl',  'AAPL',  'stock', 'Apple Inc.',                  'NASDAQ','USD','US',  185, 0.28, 0.12],
  ['inst-msft',  'MSFT',  'stock', 'Microsoft Corporation',       'NASDAQ','USD','US',  380, 0.25, 0.14],
  ['inst-nvda',  'NVDA',  'stock', 'NVIDIA Corporation',          'NASDAQ','USD','US',  480, 0.55, 0.40],
  ['inst-googl', 'GOOGL', 'stock', 'Alphabet Inc.',               'NASDAQ','USD','US',  140, 0.27, 0.13],
  ['inst-meta',  'META',  'stock', 'Meta Platforms Inc.',         'NASDAQ','USD','US',  350, 0.38, 0.18],
  ['inst-amzn',  'AMZN',  'stock', 'Amazon.com Inc.',             'NASDAQ','USD','US',  178, 0.30, 0.14],
  ['inst-tsla',  'TSLA',  'stock', 'Tesla Inc.',                  'NASDAQ','USD','US',  245, 0.60, 0.08],
  ['inst-nflx',  'NFLX',  'stock', 'Netflix Inc.',                'NASDAQ','USD','US',  450, 0.38, 0.15],
  ['inst-crm',   'CRM',   'stock', 'Salesforce Inc.',             'NYSE',  'USD','US',  235, 0.33, 0.10],
  ['inst-adbe',  'ADBE',  'stock', 'Adobe Inc.',                  'NASDAQ','USD','US',  550, 0.30, 0.10],
  ['inst-amd',   'AMD',   'stock', 'Advanced Micro Devices Inc.', 'NASDAQ','USD','US',  110, 0.52, 0.22],
  ['inst-intc',  'INTC',  'stock', 'Intel Corporation',           'NASDAQ','USD','US',   38, 0.32, -0.05],
  ['inst-qcom',  'QCOM',  'stock', 'Qualcomm Inc.',               'NASDAQ','USD','US',  125, 0.30, 0.08],
  ['inst-orcl',  'ORCL',  'stock', 'Oracle Corporation',          'NYSE',  'USD','US',  115, 0.25, 0.16],
  ['inst-avgo',  'AVGO',  'stock', 'Broadcom Inc.',               'NASDAQ','USD','US',  870, 0.32, 0.20],
  ['inst-txn',   'TXN',   'stock', 'Texas Instruments Inc.',      'NASDAQ','USD','US',  175, 0.22, 0.08],
  ['inst-mu',    'MU',    'stock', 'Micron Technology Inc.',      'NASDAQ','USD','US',   80, 0.45, 0.12],
  ['inst-uber',  'UBER',  'stock', 'Uber Technologies Inc.',      'NYSE',  'USD','US',   65, 0.42, 0.20],
  ['inst-snow',  'SNOW',  'stock', 'Snowflake Inc.',              'NYSE',  'USD','US',  165, 0.62, 0.05],
  ['inst-pltr',  'PLTR',  'stock', 'Palantir Technologies Inc.',  'NYSE',  'USD','US',   18, 0.65, 0.15],

  // ── US Finance ───────────────────────────────────────────────────────────────
  ['inst-jpm',   'JPM',   'stock', 'JPMorgan Chase & Co.',        'NYSE',  'USD','US',  195, 0.22, 0.14],
  ['inst-bac',   'BAC',   'stock', 'Bank of America Corp.',       'NYSE',  'USD','US',   35, 0.28, 0.10],
  ['inst-gs',    'GS',    'stock', 'Goldman Sachs Group Inc.',    'NYSE',  'USD','US',  395, 0.24, 0.12],
  ['inst-wfc',   'WFC',   'stock', 'Wells Fargo & Company',       'NYSE',  'USD','US',   50, 0.26, 0.09],
  ['inst-ms',    'MS',    'stock', 'Morgan Stanley',              'NYSE',  'USD','US',   95, 0.26, 0.10],
  ['inst-v',     'V',     'stock', 'Visa Inc.',                   'NYSE',  'USD','US',  270, 0.20, 0.12],
  ['inst-ma',    'MA',    'stock', 'Mastercard Inc.',             'NYSE',  'USD','US',  420, 0.21, 0.13],
  ['inst-axp',   'AXP',   'stock', 'American Express Company',   'NYSE',  'USD','US',  185, 0.24, 0.11],

  // ── US Healthcare ────────────────────────────────────────────────────────────
  ['inst-jnj',   'JNJ',   'stock', 'Johnson & Johnson',           'NYSE',  'USD','US',  155, 0.16, 0.04],
  ['inst-unh',   'UNH',   'stock', 'UnitedHealth Group Inc.',     'NYSE',  'USD','US',  520, 0.18, 0.12],
  ['inst-pfe',   'PFE',   'stock', 'Pfizer Inc.',                 'NYSE',  'USD','US',   32, 0.24, -0.04],
  ['inst-mrk',   'MRK',   'stock', 'Merck & Co. Inc.',            'NYSE',  'USD','US',  110, 0.18, 0.09],
  ['inst-abbv',  'ABBV',  'stock', 'AbbVie Inc.',                 'NYSE',  'USD','US',  160, 0.20, 0.10],
  ['inst-lly',   'LLY',   'stock', 'Eli Lilly and Company',       'NYSE',  'USD','US',  580, 0.28, 0.35],
  ['inst-amgn',  'AMGN',  'stock', 'Amgen Inc.',                  'NASDAQ','USD','US',  280, 0.20, 0.06],

  // ── US Energy ────────────────────────────────────────────────────────────────
  ['inst-xom',   'XOM',   'stock', 'Exxon Mobil Corporation',     'NYSE',  'USD','US',  105, 0.22, 0.09],
  ['inst-cvx',   'CVX',   'stock', 'Chevron Corporation',         'NYSE',  'USD','US',  155, 0.22, 0.07],
  ['inst-cop',   'COP',   'stock', 'ConocoPhillips',              'NYSE',  'USD','US',  115, 0.28, 0.10],
  ['inst-slb',   'SLB',   'stock', 'Schlumberger Limited',        'NYSE',  'USD','US',   48, 0.30, 0.06],

  // ── US Consumer ──────────────────────────────────────────────────────────────
  ['inst-wmt',   'WMT',   'stock', 'Walmart Inc.',                'NYSE',  'USD','US',   60, 0.16, 0.10],
  ['inst-cost',  'COST',  'stock', 'Costco Wholesale Corporation','NASDAQ','USD','US',  720, 0.18, 0.15],
  ['inst-hd',    'HD',    'stock', 'The Home Depot Inc.',         'NYSE',  'USD','US',  370, 0.20, 0.09],
  ['inst-mcd',   'MCD',   'stock', "McDonald's Corporation",      'NYSE',  'USD','US',  300, 0.16, 0.08],
  ['inst-sbux',  'SBUX',  'stock', 'Starbucks Corporation',       'NASDAQ','USD','US',   92, 0.24, 0.02],
  ['inst-nke',   'NKE',   'stock', 'Nike Inc.',                   'NYSE',  'USD','US',   98, 0.24, 0.02],
  ['inst-pg',    'PG',    'stock', 'Procter & Gamble Co.',        'NYSE',  'USD','US',  152, 0.14, 0.06],

  // ── US Industrial ────────────────────────────────────────────────────────────
  ['inst-cat',   'CAT',   'stock', 'Caterpillar Inc.',            'NYSE',  'USD','US',  285, 0.24, 0.14],
  ['inst-de',    'DE',    'stock', 'Deere & Company',             'NYSE',  'USD','US',  410, 0.24, 0.08],
  ['inst-rtx',   'RTX',   'stock', 'RTX Corporation',             'NYSE',  'USD','US',   85, 0.20, 0.07],
  ['inst-lmt',   'LMT',   'stock', 'Lockheed Martin Corporation', 'NYSE',  'USD','US',  450, 0.18, 0.06],
  ['inst-ba',    'BA',    'stock', 'The Boeing Company',          'NYSE',  'USD','US',  210, 0.35, 0.02],
  ['inst-hon',   'HON',   'stock', 'Honeywell International Inc.','NASDAQ','USD','US',  195, 0.20, 0.06],
  ['inst-gm',    'GM',    'stock', 'General Motors Company',      'NYSE',  'USD','US',   38, 0.30, 0.04],

  // ── ETFs ─────────────────────────────────────────────────────────────────────
  ['inst-spy',   'SPY',   'etf', 'SPDR S&P 500 ETF Trust',         'NYSE',  'USD','US',  450, 0.16, 0.10],
  ['inst-qqq',   'QQQ',   'etf', 'Invesco QQQ Trust',              'NASDAQ','USD','US',  385, 0.20, 0.14],
  ['inst-iwm',   'IWM',   'etf', 'iShares Russell 2000 ETF',       'NYSE',  'USD','US',  185, 0.22, 0.06],
  ['inst-vti',   'VTI',   'etf', 'Vanguard Total Stock Market ETF','NYSE',  'USD','US',  230, 0.16, 0.10],
  ['inst-dia',   'DIA',   'etf', 'SPDR Dow Jones Industrial ETF',  'NYSE',  'USD','US',  380, 0.16, 0.09],
  ['inst-gld',   'GLD',   'etf', 'SPDR Gold Shares',               'NYSE',  'USD','US',  185, 0.14, 0.06],
  ['inst-slv',   'SLV',   'etf', 'iShares Silver Trust',           'NYSE',  'USD','US',   22, 0.22, 0.04],
  ['inst-tlt',   'TLT',   'etf', 'iShares 20+ Year Treasury ETF',  'NASDAQ','USD','US',   88, 0.14, -0.04],
  ['inst-hyg',   'HYG',   'etf', 'iShares iBoxx High Yield ETF',   'NYSE',  'USD','US',   74, 0.08, 0.04],
  ['inst-eem',   'EEM',   'etf', 'iShares MSCI Emerging Markets ETF','NYSE', 'USD','US',  39, 0.20, 0.02],
  ['inst-arkk',  'ARKK',  'etf', 'ARK Innovation ETF',             'NYSE',  'USD','US',   45, 0.70, -0.10],
  ['inst-xlf',   'XLF',   'etf', 'Financial Select Sector SPDR',   'NYSE',  'USD','US',   40, 0.20, 0.10],

  // ── Crypto ───────────────────────────────────────────────────────────────────
  ['inst-btc',   'BTC',   'crypto', 'Bitcoin',          'CRYPTO','USD','Global', 42000, 0.70, 0.30],
  ['inst-eth',   'ETH',   'crypto', 'Ethereum',         'CRYPTO','USD','Global', 2200,  0.75, 0.25],
  ['inst-bnb',   'BNB',   'crypto', 'BNB',              'CRYPTO','USD','Global',  320,  0.65, 0.20],
  ['inst-sol',   'SOL',   'crypto', 'Solana',           'CRYPTO','USD','Global',   85,  0.90, 0.50],
  ['inst-xrp',   'XRP',   'crypto', 'XRP',              'CRYPTO','USD','Global',    0.6, 0.80, 0.10],
  ['inst-doge',  'DOGE',  'crypto', 'Dogecoin',         'CRYPTO','USD','Global',    0.08,1.20, 0.05],
  ['inst-ada',   'ADA',   'crypto', 'Cardano',          'CRYPTO','USD','Global',    0.5, 0.85, 0.05],
  ['inst-avax',  'AVAX',  'crypto', 'Avalanche',        'CRYPTO','USD','Global',   35,  0.95, 0.20],
  ['inst-dot',   'DOT',   'crypto', 'Polkadot',         'CRYPTO','USD','Global',    7.5, 0.85, 0.05],
  ['inst-link',  'LINK',  'crypto', 'Chainlink',        'CRYPTO','USD','Global',   14,  0.85, 0.20],
  ['inst-ltc',   'LTC',   'crypto', 'Litecoin',         'CRYPTO','USD','Global',   90,  0.70, 0.05],
  ['inst-uni',   'UNI',   'crypto', 'Uniswap',          'CRYPTO','USD','Global',    6.5, 0.90, 0.05],
  ['inst-atom',  'ATOM',  'crypto', 'Cosmos',           'CRYPTO','USD','Global',   10,  0.85, 0.05],
  ['inst-near',  'NEAR',  'crypto', 'NEAR Protocol',    'CRYPTO','USD','Global',    3.2, 0.95, 0.15],
  ['inst-matic', 'MATIC', 'crypto', 'Polygon',          'CRYPTO','USD','Global',    0.9, 0.95, 0.10],

  // ── Bonds / Rates ─────────────────────────────────────────────────────────────
  ['inst-us10y',  'US10Y',  'bond', 'U.S. 10-Year Treasury Note',  'GOVT','USD','US',    4.3, 0.08, 0.00],
  ['inst-us2y',   'US2Y',   'bond', 'U.S. 2-Year Treasury Note',   'GOVT','USD','US',    4.8, 0.06, 0.00],
  ['inst-us30y',  'US30Y',  'bond', 'U.S. 30-Year Treasury Bond',  'GOVT','USD','US',    4.5, 0.09, 0.00],
  ['inst-eu10y',  'EU10Y',  'bond', 'German 10-Year Bund',         'GOVT','EUR','Europe', 2.4, 0.07, 0.00],
  ['inst-uk10y',  'UK10Y',  'bond', 'UK 10-Year Gilt',             'GOVT','GBP','Europe', 4.1, 0.08, 0.00],

  // ── Commodities ──────────────────────────────────────────────────────────────
  ['inst-xau',   'XAUUSD', 'commodity', 'Gold Spot (USD)',          'FOREX','USD','Global', 1950, 0.14, 0.06],
  ['inst-xag',   'XAGUSD', 'commodity', 'Silver Spot (USD)',        'FOREX','USD','Global',   23, 0.22, 0.03],
  ['inst-wti',   'WTIUSD', 'commodity', 'WTI Crude Oil',            'NYMEX','USD','Global',   78, 0.35, 0.02],
  ['inst-brent', 'BRNUSD', 'commodity', 'Brent Crude Oil',          'ICE',  'USD','Global',   82, 0.33, 0.02],
  ['inst-natgas','NATGAS',  'commodity', 'Natural Gas (Henry Hub)',  'NYMEX','USD','US',        2.5, 0.55, -0.05],
  ['inst-copper','COPPER',  'commodity', 'Copper Futures',           'COMEX','USD','Global',   3.8, 0.25, 0.03],

  // ── European Stocks ───────────────────────────────────────────────────────────
  ['inst-asml',  'ASML',  'stock', 'ASML Holding N.V.',            'NASDAQ','USD','Europe', 680, 0.32, 0.18],
  ['inst-sap',   'SAP',   'stock', 'SAP SE',                       'NYSE',  'USD','Europe', 175, 0.24, 0.15],
  ['inst-nesn',  'NESN',  'stock', 'Nestlé S.A.',                  'OTC',   'USD','Europe', 103, 0.14, 0.04],
  ['inst-nvob',  'NOVO',  'stock', 'Novo Nordisk A/S',             'NYSE',  'USD','Europe', 105, 0.28, 0.30],
  ['inst-bp',    'BP',    'stock', 'BP p.l.c.',                    'NYSE',  'USD','Europe',  37, 0.22, 0.05],
  ['inst-shell', 'SHEL',  'stock', 'Shell plc',                    'NYSE',  'USD','Europe',  65, 0.20, 0.06],
  ['inst-lvmh',  'LVMH',  'stock', 'LVMH Moët Hennessy',           'OTC',   'USD','Europe', 175, 0.24, 0.06],
  ['inst-siem',  'SIEGY', 'stock', 'Siemens AG',                   'OTC',   'USD','Europe',  88, 0.22, 0.10],

  // ── Asian Stocks ──────────────────────────────────────────────────────────────
  ['inst-tsm',   'TSM',   'stock', 'Taiwan Semiconductor Mfg.',    'NYSE',  'USD','Asia',  108, 0.30, 0.10],
  ['inst-baba',  'BABA',  'stock', 'Alibaba Group Holding',        'NYSE',  'USD','Asia',   80, 0.40, -0.10],
  ['inst-jd',    'JD',    'stock', 'JD.com Inc.',                  'NASDAQ','USD','Asia',   28, 0.40, -0.08],
  ['inst-nio',   'NIO',   'stock', 'NIO Inc.',                     'NYSE',  'USD','Asia',    7, 0.75, -0.20],
  ['inst-tm',    'TM',    'stock', 'Toyota Motor Corporation',     'NYSE',  'USD','Asia',  195, 0.20, 0.08],
  ['inst-sony',  'SONY',  'stock', 'Sony Group Corporation',       'NYSE',  'USD','Asia',   90, 0.24, 0.06],
  ['inst-bidu',  'BIDU',  'stock', 'Baidu Inc.',                   'NASDAQ','USD','Asia',  115, 0.40, -0.08],
  ['inst-tcehy', 'TCEHY', 'stock', 'Tencent Holdings Ltd.',        'OTC',   'USD','Asia',   38, 0.35, -0.05],
];

async function seed() {
  await connectDB();
  console.log('🗑  Clearing existing data...');
  await Promise.all([
    FinancialInstrument.deleteMany({}),
    InstrumentVersion.deleteMany({}),
    DataSource.deleteMany({}),
    TimeSeriesRecord.deleteMany({}),
    PortfolioOwner.deleteMany({}),
    Portfolio.deleteMany({}),
    PortfolioAsset.deleteMany({})
  ]);

  // ── Data Sources ──────────────────────────────────────────────────────────────
  console.log('📡 Seeding data sources...');
  await DataSource.insertMany([
    { _id: 'ds-nasdaq',        vendorName: 'Nasdaq Data Link',   apiEndpoint: 'https://data.nasdaq.com/api/v3',         description: 'Nasdaq market data — open & commercial',   licenseType: 'freemium',    lastSyncedAt: new Date('2024-06-15') },
    { _id: 'ds-bloomberg',     vendorName: 'Bloomberg',           apiEndpoint: 'https://api.bloomberg.com/market',       description: '35M instruments, 330+ exchanges',           licenseType: 'commercial',  lastSyncedAt: new Date('2024-06-14') },
    { _id: 'ds-yahoo',         vendorName: 'Yahoo Finance',       apiEndpoint: 'https://query1.finance.yahoo.com/v8',    description: 'Free stock quotes and financial news',      licenseType: 'free',        lastSyncedAt: new Date('2024-06-15') },
    { _id: 'ds-alpha-vantage', vendorName: 'Yahoo Finance (live)', apiEndpoint: 'https://query1.finance.yahoo.com/v8',    description: 'Live quotes ingested via Yahoo Finance v8 chart API', licenseType: 'free', lastSyncedAt: null },
    { _id: 'ds-stooq',         vendorName: 'Stooq',               apiEndpoint: 'https://stooq.com/q/d/l',               description: 'Free historical market data (no key)',      licenseType: 'free',        lastSyncedAt: null },
  ]);

  // ── Financial Instruments ─────────────────────────────────────────────────────
  console.log(`📈 Seeding ${INSTRUMENTS.length} financial instruments...`);
  const instrumentDocs = INSTRUMENTS.map(([id, symbol, cls, name, exchange, currency, region]) => ({
    _id: id, symbol, instrumentClass: cls, name, exchange, currency, region,
    description: `${name} — traded on ${exchange}`,
    isin: (cls === 'stock' && region === 'US') ? `US${id.replace('inst-','').toUpperCase().padEnd(10,'0').slice(0,10)}` : null
  }));
  const instruments = await FinancialInstrument.insertMany(instrumentDocs);

  // ── Instrument Versions ───────────────────────────────────────────────────────
  console.log('🕐 Seeding instrument versions...');
  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const versionDocs = [];
  for (const [id, symbol, cls, , exchange, , region] of INSTRUMENTS) {
    // archived version (2 years ago → 1 year ago)
    versionDocs.push({
      instrumentId: id,
      validFrom: twoYearsAgo, validTo: oneYearAgo,
      isDeleted: false,
      attributes: { version: 1, notes: 'Initial record', region, exchange }
    });
    // current version
    versionDocs.push({
      instrumentId: id,
      validFrom: oneYearAgo, validTo: null,
      isDeleted: false,
      attributes: { version: 2, notes: 'Current record', region, exchange, sector: cls === 'stock' ? 'Equities' : cls }
    });
  }
  await InstrumentVersion.insertMany(versionDocs);

  // ── Time Series (GBM simulation, 2 sources) ───────────────────────────────────
  console.log('📊 Generating time series data (this may take a minute)...');
  const SOURCES = ['ds-nasdaq', 'ds-yahoo'];
  const TRADING_DAYS = 504; // ~2 years
  const BATCH = 2000;

  let totalInserted = 0;
  let batch = [];

  for (const [id, , , , , , , basePrice, annualVol, annualDrift] of INSTRUMENTS) {
    for (const src of SOURCES) {
      const records = generateGBM(id, src, basePrice, annualVol, annualDrift, TRADING_DAYS);
      batch.push(...records);

      if (batch.length >= BATCH) {
        await TimeSeriesRecord.insertMany(batch);
        totalInserted += batch.length;
        process.stdout.write(`\r   Inserted ${totalInserted.toLocaleString()} time-series records...`);
        batch = [];
      }
    }
  }
  if (batch.length > 0) {
    await TimeSeriesRecord.insertMany(batch);
    totalInserted += batch.length;
  }
  console.log(`\r   ✅ Inserted ${totalInserted.toLocaleString()} time-series records         `);

  // ── Portfolio Owners ──────────────────────────────────────────────────────────
  console.log('👤 Seeding portfolio owners...');
  await PortfolioOwner.insertMany([
    // Individual investors
    { _id: 'owner-john',    ownerType: 'person',  name: 'John Smith',                   email: 'john.smith@acme.com',         region: 'US'           },
    { _id: 'owner-maria',   ownerType: 'person',  name: 'Maria Chen',                   email: 'maria.chen@acme.com',         region: 'Asia'         },
    { _id: 'owner-sarah',   ownerType: 'person',  name: 'Sarah Williams',               email: 'sarah.williams@acme.com',     region: 'US'           },
    { _id: 'owner-david',   ownerType: 'person',  name: 'David Okonkwo',                email: 'david.okonkwo@acme.com',      region: 'Africa'       },
    { _id: 'owner-carlos',  ownerType: 'person',  name: 'Carlos Mendez',                email: 'carlos.mendez@acme.com',      region: 'Latin America'},
    // Institutional
    { _id: 'owner-acme',    ownerType: 'company', name: 'Acme Investment Ltd',          email: 'investments@acme.com',        region: 'Europe'       },
    { _id: 'owner-fund',    ownerType: 'company', name: 'Acme Global Fund',             email: 'globalfund@acme.com',         region: 'US'           },
    { _id: 'owner-horizon', ownerType: 'company', name: 'Horizon Capital Partners',     email: 'info@horizoncap.com',         region: 'US'           },
    { _id: 'owner-pacific', ownerType: 'company', name: 'Pacific Rim Asset Management', email: 'invest@pacificrim.com',      region: 'Asia'         },
  ]);

  // ── Portfolios ────────────────────────────────────────────────────────────────
  console.log('💼 Seeding portfolios...');
  await Portfolio.insertMany([
    // John Smith — 2 portfolios
    { _id: 'port-tech',          ownerId: 'owner-john',    name: 'Tech Growth Portfolio',    description: 'High-growth US technology stocks',                   currency: 'USD' },
    { _id: 'port-john-retire',   ownerId: 'owner-john',    name: 'Retirement Fund',          description: 'Conservative long-term ETF and bond allocation',      currency: 'USD' },
    // Maria Chen — 2 portfolios
    { _id: 'port-crypto',        ownerId: 'owner-maria',   name: 'Crypto Alpha',             description: 'Digital assets and DeFi exposure',                   currency: 'USD' },
    { _id: 'port-maria-asia',    ownerId: 'owner-maria',   name: 'Asia Pacific Equity',      description: 'Growth-oriented Asian equity selection',              currency: 'USD' },
    // Sarah Williams — 2 portfolios
    { _id: 'port-sarah-fixed',   ownerId: 'owner-sarah',   name: 'Fixed Income Ladder',      description: 'Investment-grade bonds and treasuries',               currency: 'USD' },
    { _id: 'port-sarah-income',  ownerId: 'owner-sarah',   name: 'Dividend Income',          description: 'High-dividend defensive US equities',                 currency: 'USD' },
    // David Okonkwo — 1 portfolio
    { _id: 'port-david-em',      ownerId: 'owner-david',   name: 'Emerging Markets Focus',   description: 'Diversified emerging markets exposure',               currency: 'USD' },
    // Carlos Mendez — 2 portfolios
    { _id: 'port-carlos-commod', ownerId: 'owner-carlos',  name: 'Commodities Play',         description: 'Diversified real assets and energy exposure',         currency: 'USD' },
    { _id: 'port-carlos-active', ownerId: 'owner-carlos',  name: 'Active Momentum',          description: 'High-conviction momentum trades',                     currency: 'USD' },
    // Acme Investment Ltd — 3 portfolios
    { _id: 'port-balanced',      ownerId: 'owner-acme',    name: 'Balanced Fund',            description: 'Diversified across asset classes',                    currency: 'USD' },
    { _id: 'port-acme-europe',   ownerId: 'owner-acme',    name: 'European Equity Fund',     description: 'Blue-chip European equity exposure',                  currency: 'EUR' },
    { _id: 'port-acme-esg',      ownerId: 'owner-acme',    name: 'ESG Portfolio',            description: 'Sustainability-screened global equities',             currency: 'USD' },
    // Acme Global Fund — 3 portfolios
    { _id: 'port-global',        ownerId: 'owner-fund',    name: 'Global Macro Fund',        description: 'Multi-region, multi-asset macro strategy',            currency: 'USD' },
    { _id: 'port-fund-uslc',     ownerId: 'owner-fund',    name: 'US Large Cap Core',        description: 'Broad US large-cap equity index exposure',            currency: 'USD' },
    { _id: 'port-fund-sector',   ownerId: 'owner-fund',    name: 'Sector Rotation',          description: 'Dynamic sector allocation based on macro cycle',      currency: 'USD' },
    // Horizon Capital Partners — 2 portfolios
    { _id: 'port-horizon-alpha', ownerId: 'owner-horizon', name: 'Hedge Fund Alpha',         description: 'Concentrated long positions in high-conviction ideas', currency: 'USD' },
    { _id: 'port-horizon-ls',    ownerId: 'owner-horizon', name: 'Long/Short Equity',        description: 'Market-neutral long/short equity strategy',           currency: 'USD' },
    // Pacific Rim Asset Management — 2 portfolios
    { _id: 'port-pacific-apac',  ownerId: 'owner-pacific', name: 'APAC Growth Fund',         description: 'Asia Pacific equity growth strategy',                 currency: 'USD' },
    { _id: 'port-pacific-china', ownerId: 'owner-pacific', name: 'China Technology Fund',    description: 'Chinese technology and internet sector focus',        currency: 'USD' },
  ]);

  // ── Portfolio Assets ──────────────────────────────────────────────────────────
  console.log('🔗 Seeding portfolio assets...');
  await PortfolioAsset.insertMany([
    // ── John Smith: Tech Growth ──────────────────────────────────────────────
    { portfolioId: 'port-tech', instrumentId: 'inst-aapl',  addedAt: new Date('2023-01-15') },
    { portfolioId: 'port-tech', instrumentId: 'inst-msft',  addedAt: new Date('2023-01-15') },
    { portfolioId: 'port-tech', instrumentId: 'inst-nvda',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-tsla',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-meta',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-amzn',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-googl', addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-amd',   addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-avgo',  addedAt: new Date('2023-07-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-uber',  addedAt: new Date('2023-08-01') },
    { portfolioId: 'port-tech', instrumentId: 'inst-snow',  addedAt: new Date('2023-06-01'), removedAt: new Date('2024-01-15') },
    { portfolioId: 'port-tech', instrumentId: 'inst-intc',  addedAt: new Date('2023-03-01'), removedAt: new Date('2023-10-01') },

    // ── John Smith: Retirement Fund ──────────────────────────────────────────
    { portfolioId: 'port-john-retire', instrumentId: 'inst-spy',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-vti',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-tlt',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-jnj',   addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-pg',    addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-jpm',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-gld',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-us10y', addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-john-retire', instrumentId: 'inst-us30y', addedAt: new Date('2023-06-01') },

    // ── Maria Chen: Crypto Alpha ─────────────────────────────────────────────
    { portfolioId: 'port-crypto', instrumentId: 'inst-btc',   addedAt: new Date('2023-01-05') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-eth',   addedAt: new Date('2023-01-05') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-sol',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-avax',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-bnb',   addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-link',  addedAt: new Date('2023-07-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-dot',   addedAt: new Date('2023-09-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-near',  addedAt: new Date('2023-10-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-ada',   addedAt: new Date('2024-01-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-doge',  addedAt: new Date('2023-11-01'), removedAt: new Date('2024-03-01') },
    { portfolioId: 'port-crypto', instrumentId: 'inst-uni',   addedAt: new Date('2023-06-01'), removedAt: new Date('2023-12-01') },

    // ── Maria Chen: Asia Pacific Equity ─────────────────────────────────────
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-tsm',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-sony',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-tm',    addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-tcehy', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-bidu',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-baba',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-eem',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-jd',    addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-maria-asia', instrumentId: 'inst-nio',   addedAt: new Date('2023-03-01'), removedAt: new Date('2024-02-01') },

    // ── Sarah Williams: Fixed Income Ladder ──────────────────────────────────
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-us10y', addedAt: new Date('2023-01-05') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-us2y',  addedAt: new Date('2023-01-05') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-us30y', addedAt: new Date('2023-01-05') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-eu10y', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-uk10y', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-tlt',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-sarah-fixed', instrumentId: 'inst-hyg',   addedAt: new Date('2023-06-01') },

    // ── Sarah Williams: Dividend Income ──────────────────────────────────────
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-jnj',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-pg',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-mcd',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-wmt',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-jpm',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-v',    addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-xom',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-cvx',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-abbv', addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-sarah-income', instrumentId: 'inst-lmt',  addedAt: new Date('2023-07-01') },

    // ── David Okonkwo: Emerging Markets Focus ────────────────────────────────
    { portfolioId: 'port-david-em', instrumentId: 'inst-eem',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-baba',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-tsm',   addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-tcehy', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-bidu',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-jd',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-near',  addedAt: new Date('2023-06-01') },
    { portfolioId: 'port-david-em', instrumentId: 'inst-nio',   addedAt: new Date('2023-05-01'), removedAt: new Date('2024-01-01') },

    // ── Carlos Mendez: Commodities Play ──────────────────────────────────────
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-xau',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-gld',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-wti',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-brent',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-xag',    addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-slv',    addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-copper', addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-cop',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-xom',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-carlos-commod', instrumentId: 'inst-natgas', addedAt: new Date('2023-09-01'), removedAt: new Date('2024-04-01') },

    // ── Carlos Mendez: Active Momentum ───────────────────────────────────────
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-nvda',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-tsla',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-btc',   addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-sol',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-pltr',  addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-amd',   addedAt: new Date('2023-07-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-arkk',  addedAt: new Date('2023-06-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-snow',  addedAt: new Date('2023-08-01') },
    { portfolioId: 'port-carlos-active', instrumentId: 'inst-meta',  addedAt: new Date('2023-02-01'), removedAt: new Date('2023-09-01') },

    // ── Acme Investment Ltd: Balanced Fund ───────────────────────────────────
    { portfolioId: 'port-balanced', instrumentId: 'inst-spy',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-gld',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-tlt',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-us10y', addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-btc',   addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-xau',   addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-qqq',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-eem',   addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-hyg',   addedAt: new Date('2023-06-01') },
    { portfolioId: 'port-balanced', instrumentId: 'inst-vti',   addedAt: new Date('2023-07-01') },

    // ── Acme Investment Ltd: European Equity Fund ─────────────────────────────
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-asml',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-sap',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-nesn',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-nvob',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-lvmh',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-siem',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-shell', addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-bp',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-eu10y', addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-europe', instrumentId: 'inst-uk10y', addedAt: new Date('2023-01-10') },

    // ── Acme Investment Ltd: ESG Portfolio ───────────────────────────────────
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-msft',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-aapl',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-googl', addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-nesn',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-asml',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-nvob',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-v',     addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-ma',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-cost',  addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-acme-esg', instrumentId: 'inst-lly',   addedAt: new Date('2023-07-01') },

    // ── Acme Global Fund: Global Macro ───────────────────────────────────────
    { portfolioId: 'port-global', instrumentId: 'inst-spy',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-global', instrumentId: 'inst-eem',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-global', instrumentId: 'inst-xau',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-global', instrumentId: 'inst-wti',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-global', instrumentId: 'inst-eu10y',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-global', instrumentId: 'inst-asml',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-global', instrumentId: 'inst-tsm',    addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-global', instrumentId: 'inst-gld',    addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-global', instrumentId: 'inst-tlt',    addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-global', instrumentId: 'inst-copper', addedAt: new Date('2023-06-01') },

    // ── Acme Global Fund: US Large Cap Core ──────────────────────────────────
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-spy',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-qqq',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-vti',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-dia',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-aapl', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-msft', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-nvda', addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-amzn', addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-jpm',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-unh',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-fund-uslc', instrumentId: 'inst-xom',  addedAt: new Date('2023-05-01') },

    // ── Acme Global Fund: Sector Rotation ────────────────────────────────────
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-xlf',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-qqq',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-gld',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-tlt',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-xom',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-cvx',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-jpm',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-gs',   addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-arkk', addedAt: new Date('2023-02-01'), removedAt: new Date('2023-11-01') },
    { portfolioId: 'port-fund-sector', instrumentId: 'inst-iwm',  addedAt: new Date('2023-06-01'), removedAt: new Date('2024-02-01') },

    // ── Horizon Capital: Hedge Fund Alpha ─────────────────────────────────────
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-nvda',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-msft',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-avgo',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-lly',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-meta',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-asml',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-tsm',   addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-gs',    addedAt: new Date('2023-05-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-btc',   addedAt: new Date('2023-07-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-eth',   addedAt: new Date('2023-07-01') },
    { portfolioId: 'port-horizon-alpha', instrumentId: 'inst-ba',    addedAt: new Date('2023-03-01'), removedAt: new Date('2024-01-01') },

    // ── Horizon Capital: Long/Short Equity ───────────────────────────────────
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-aapl',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-msft',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-nvda',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-jpm',   addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-v',     addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-spy',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-tsla',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-pltr',  addedAt: new Date('2023-06-01') },
    { portfolioId: 'port-horizon-ls', instrumentId: 'inst-snow',  addedAt: new Date('2023-05-01'), removedAt: new Date('2024-03-01') },

    // ── Pacific Rim: APAC Growth Fund ────────────────────────────────────────
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-tsm',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-sony',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-tm',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-tcehy', addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-bidu',  addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-baba',  addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-eem',   addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-asml',  addedAt: new Date('2023-04-01') },
    { portfolioId: 'port-pacific-apac', instrumentId: 'inst-nio',   addedAt: new Date('2023-02-01'), removedAt: new Date('2023-12-01') },

    // ── Pacific Rim: China Technology Fund ───────────────────────────────────
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-baba',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-jd',    addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-bidu',  addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-tcehy', addedAt: new Date('2023-01-10') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-nio',   addedAt: new Date('2023-02-01') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-eem',   addedAt: new Date('2023-03-01') },
    { portfolioId: 'port-pacific-china', instrumentId: 'inst-btc',   addedAt: new Date('2023-06-01') },
  ]);

  // ── Summary ───────────────────────────────────────────────────────────────────
  const counts = {
    instruments:      await FinancialInstrument.countDocuments(),
    versions:         await InstrumentVersion.countDocuments(),
    dataSources:      await DataSource.countDocuments(),
    timeSeriesRecords: await TimeSeriesRecord.countDocuments(),
    owners:           await PortfolioOwner.countDocuments(),
    portfolios:       await Portfolio.countDocuments(),
    portfolioAssets:  await PortfolioAsset.countDocuments()
  };
  console.log('\n✅ Seed complete!');
  console.table(counts);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
