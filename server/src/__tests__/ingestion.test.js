/**
 * Ingestion pipeline tests — ingestTimeSeries controller
 *
 * Covers:
 *  1. Stores records with the correct instrumentId and dataSourceId
 *  2. Deduplication: re-ingesting the same dates does not create duplicate rows
 *  3. Partial deduplication: only truly new dates are inserted on second call
 *  4. Returns 400 when records array is missing or empty
 */
const { setupDB, teardownDB, clearDB, mockReq, mockRes } = require('./helpers');
const { ingestTimeSeries } = require('../controllers/timeSeriesController');
const TimeSeriesRecord = require('../models/TimeSeriesRecord');

const INSTRUMENT_ID  = 'inst-goog';
const DATA_SOURCE_ID = 'ds-yahoo';

const SAMPLE_RECORDS = [
  { date: '2024-03-01', open: 170, close: 172, high: 174, low: 169, volume: 20_000_000 },
  { date: '2024-03-04', open: 172, close: 175, high: 176, low: 171, volume: 22_000_000 },
  { date: '2024-03-05', open: 175, close: 173, high: 177, low: 172, volume: 18_000_000 },
];

beforeAll(() => setupDB());
afterAll(() => teardownDB());
beforeEach(() => clearDB());

// ─── helpers ────────────────────────────────────────────────────────────────
async function callIngest(records = SAMPLE_RECORDS, instId = INSTRUMENT_ID, srcId = DATA_SOURCE_ID) {
  const req = mockReq({ body: { instrumentId: instId, dataSourceId: srcId, records } });
  const res = mockRes();
  await ingestTimeSeries(req, res);
  const statusArg = res.status.mock.calls[0]?.[0] ?? 201;
  const [[body]]  = res.json.mock.calls;
  return { statusCode: statusArg, body };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Basic storage
// ────────────────────────────────────────────────────────────────────────────
describe('ingestTimeSeries – basic storage', () => {
  it('responds with HTTP 201 and a positive inserted count', async () => {
    const { statusCode, body } = await callIngest();
    expect(statusCode).toBe(201);
    expect(body.inserted).toBe(SAMPLE_RECORDS.length);
  });

  it('persists all records in the database', async () => {
    await callIngest();
    const count = await TimeSeriesRecord.countDocuments({ instrumentId: INSTRUMENT_ID });
    expect(count).toBe(SAMPLE_RECORDS.length);
  });

  it('stores records with the correct instrumentId', async () => {
    await callIngest();
    const records = await TimeSeriesRecord.find({ instrumentId: INSTRUMENT_ID }).lean();
    records.forEach(r => expect(r.instrumentId).toBe(INSTRUMENT_ID));
  });

  it('stores records with the correct dataSourceId', async () => {
    await callIngest();
    const records = await TimeSeriesRecord.find({ dataSourceId: DATA_SOURCE_ID }).lean();
    expect(records).toHaveLength(SAMPLE_RECORDS.length);
    records.forEach(r => expect(r.dataSourceId).toBe(DATA_SOURCE_ID));
  });

  it('sets adjustedClose to close when not provided', async () => {
    await callIngest([{ date: '2024-04-01', open: 100, close: 105, high: 106, low: 99 }]);
    const rec = await TimeSeriesRecord.findOne({ instrumentId: INSTRUMENT_ID }).lean();
    expect(rec).not.toBeNull();
    // adjustedClose was set via ?? close fallback in the controller
    expect(parseFloat(rec.adjustedClose.toString())).toBeCloseTo(105, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Deduplication
// ────────────────────────────────────────────────────────────────────────────
describe('ingestTimeSeries – deduplication', () => {
  it('does not create duplicate rows when the same records are ingested twice', async () => {
    await callIngest();
    const { body: body2 } = await callIngest();   // second call, identical data

    const count = await TimeSeriesRecord.countDocuments({ instrumentId: INSTRUMENT_ID });
    expect(count).toBe(SAMPLE_RECORDS.length);    // still 3, not 6
    expect(body2.inserted).toBe(0);               // nothing new was inserted
    expect(body2.skipped).toBe(SAMPLE_RECORDS.length);
  });

  it('only inserts genuinely new dates on a second call with mixed data', async () => {
    await callIngest();   // inserts 3 records

    // Second batch: 2 overlapping dates + 1 new date
    const mixed = [
      { date: '2024-03-01', open: 170, close: 172, high: 174, low: 169 }, // duplicate
      { date: '2024-03-04', open: 172, close: 175, high: 176, low: 171 }, // duplicate
      { date: '2024-03-06', open: 173, close: 176, high: 178, low: 172 }, // NEW
    ];
    const { body } = await callIngest(mixed);

    const count = await TimeSeriesRecord.countDocuments({ instrumentId: INSTRUMENT_ID });
    expect(count).toBe(4);           // 3 originals + 1 new
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(2);
  });

  it('keeps separate records for different dataSourceIds on the same date', async () => {
    await callIngest(SAMPLE_RECORDS, INSTRUMENT_ID, 'ds-yahoo');
    await callIngest(SAMPLE_RECORDS, INSTRUMENT_ID, 'ds-simulated');

    const count = await TimeSeriesRecord.countDocuments({ instrumentId: INSTRUMENT_ID });
    expect(count).toBe(SAMPLE_RECORDS.length * 2);   // 3 + 3 — different sources, same dates are fine
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Validation / error handling
// ────────────────────────────────────────────────────────────────────────────
describe('ingestTimeSeries – validation', () => {
  it('returns 400 when records is an empty array', async () => {
    const req = mockReq({ body: { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID, records: [] } });
    const res = mockRes();
    await ingestTimeSeries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const [[body]] = res.json.mock.calls;
    expect(body.error).toBeDefined();
  });

  it('returns 400 when records is missing from the request body', async () => {
    const req = mockReq({ body: { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID } });
    const res = mockRes();
    await ingestTimeSeries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('does not insert any records on a 400 response', async () => {
    const req = mockReq({ body: { instrumentId: INSTRUMENT_ID, dataSourceId: DATA_SOURCE_ID, records: [] } });
    const res = mockRes();
    await ingestTimeSeries(req, res);

    const count = await TimeSeriesRecord.countDocuments({ instrumentId: INSTRUMENT_ID });
    expect(count).toBe(0);
  });
});
