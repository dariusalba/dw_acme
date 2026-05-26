/**
 * DAL tests — TimeSeriesRecord
 *
 * Covers:
 *  1. Save a record and retrieve it with findOne
 *  2. findLatest: returns the most recent record by date
 *  3. findAll with instrumentId filter
 *  4. findAll with date-range filter
 *  5. Decimal128 fields are serialised to plain numbers via toJSON
 */
const { setupDB, teardownDB, clearDB } = require('./helpers');
const TimeSeriesRecord = require('../models/TimeSeriesRecord');

const INSTRUMENT_ID  = 'inst-aapl';
const INSTRUMENT_ID2 = 'inst-tsla';
const DATA_SOURCE_ID = 'ds-yahoo';

beforeAll(() => setupDB());
afterAll(() => teardownDB());
beforeEach(() => clearDB());

// ────────────────────────────────────────────────────────────────────────────
// 1. Save and retrieve
// ────────────────────────────────────────────────────────────────────────────
describe('TimeSeriesRecord – save & retrieve', () => {
  it('saves a record and retrieves it with findOne', async () => {
    const doc = await TimeSeriesRecord.create({
      instrumentId: INSTRUMENT_ID,
      dataSourceId: DATA_SOURCE_ID,
      date:  new Date('2024-01-15'),
      open:  150.00,
      close: 155.50,
      high:  158.00,
      low:   149.00,
      volume: 80_000_000,
    });

    const found = await TimeSeriesRecord.findById(doc._id).lean();
    expect(found).not.toBeNull();
    expect(found.instrumentId).toBe(INSTRUMENT_ID);
    expect(found.dataSourceId).toBe(DATA_SOURCE_ID);
    expect(found.date.toISOString().startsWith('2024-01-15')).toBe(true);
  });

  it('stores Decimal128 fields and serialises them as numbers via toJSON', async () => {
    const doc = await TimeSeriesRecord.create({
      instrumentId: INSTRUMENT_ID,
      dataSourceId: DATA_SOURCE_ID,
      date:  new Date('2024-02-01'),
      open:  200.12,
      close: 201.99,
      high:  203.00,
      low:   199.50,
      volume: 10_000_000,
    });

    const json = doc.toJSON();
    expect(typeof json.close).toBe('number');
    expect(json.close).toBeCloseTo(201.99, 2);
    expect(typeof json.volume).toBe('number');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. findLatest
// ────────────────────────────────────────────────────────────────────────────
describe('TimeSeriesRecord – findLatest', () => {
  beforeEach(async () => {
    await TimeSeriesRecord.create([
      { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-10'), close: 140 },
      { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-20'), close: 150 },
      { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-05'), close: 135 },
    ]);
  });

  it('returns the record with the most recent date when sorted desc', async () => {
    const latest = await TimeSeriesRecord
      .find({ instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID })
      .sort({ date: -1 })
      .limit(1)
      .lean();

    expect(latest).toHaveLength(1);
    expect(latest[0].date.toISOString().startsWith('2024-01-20')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. findAll with instrumentId filter
// ────────────────────────────────────────────────────────────────────────────
describe('TimeSeriesRecord – filter by instrumentId', () => {
  beforeEach(async () => {
    await TimeSeriesRecord.create([
      { instrumentId: INSTRUMENT_ID,  dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-01'), close: 100 },
      { instrumentId: INSTRUMENT_ID,  dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-02'), close: 101 },
      { instrumentId: INSTRUMENT_ID2, dataSourceId: DATA_SOURCE_ID, date: new Date('2024-01-01'), close: 200 },
    ]);
  });

  it('returns only records matching the given instrumentId', async () => {
    const records = await TimeSeriesRecord
      .find({ instrumentId: INSTRUMENT_ID })
      .lean();

    expect(records).toHaveLength(2);
    records.forEach(r => expect(r.instrumentId).toBe(INSTRUMENT_ID));
  });

  it('returns records for the second instrument independently', async () => {
    const records = await TimeSeriesRecord
      .find({ instrumentId: INSTRUMENT_ID2 })
      .lean();

    expect(records).toHaveLength(1);
    expect(records[0].instrumentId).toBe(INSTRUMENT_ID2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. findAll with date-range filter
// ────────────────────────────────────────────────────────────────────────────
describe('TimeSeriesRecord – filter by date range', () => {
  beforeEach(async () => {
    const dates = ['2024-01-01', '2024-01-10', '2024-01-20', '2024-01-31'];
    await TimeSeriesRecord.create(
      dates.map((d, i) => ({
        instrumentId: INSTRUMENT_ID,
        dataSourceId: DATA_SOURCE_ID,
        date: new Date(d),
        close: 100 + i,
      }))
    );
  });

  it('filters records between startDate and endDate (inclusive)', async () => {
    const records = await TimeSeriesRecord.find({
      instrumentId: INSTRUMENT_ID,
      date: {
        $gte: new Date('2024-01-10'),
        $lte: new Date('2024-01-20'),
      },
    }).lean();

    expect(records).toHaveLength(2);
    const dateStrings = records.map(r => r.date.toISOString().slice(0, 10)).sort();
    expect(dateStrings).toEqual(['2024-01-10', '2024-01-20']);
  });

  it('returns no records when date range matches nothing', async () => {
    const records = await TimeSeriesRecord.find({
      instrumentId: INSTRUMENT_ID,
      date: {
        $gte: new Date('2023-01-01'),
        $lte: new Date('2023-12-31'),
      },
    }).lean();

    expect(records).toHaveLength(0);
  });
});
