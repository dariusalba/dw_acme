/**
 * DAL tests — Instrument CRUD (temporal data warehouse pattern)
 *
 * Covers:
 *  1. createInstrument — creates FinancialInstrument + initial InstrumentVersion
 *  2. getInstrument    — returns instrument with its current (active) version
 *  3. updateInstrument — closes old version (sets validTo), creates new version
 *  4. deleteInstrument — creates a version with isDeleted=true; instrument still exists
 */
const { setupDB, teardownDB, clearDB, mockReq, mockRes } = require('./helpers');
const { createInstrument, getInstrument, updateInstrument, deleteInstrument } = require('../controllers/instrumentController');
const { FinancialInstrument, InstrumentVersion } = require('../models');

beforeAll(() => setupDB());
afterAll(() => teardownDB());
beforeEach(() => clearDB());

// ────────────────────────────────────────────────────────────────────────────
// Helper: create via controller and return parsed JSON body
// ────────────────────────────────────────────────────────────────────────────
async function createViaController(overrides = {}) {
  const req = mockReq({
    body: {
      symbol: 'AAPL',
      instrumentClass: 'stock',
      name: 'Apple Inc.',
      currency: 'USD',
      exchange: 'NASDAQ',
      attributes: { sector: 'Technology' },
      ...overrides,
    },
  });
  const res = mockRes();
  await createInstrument(req, res);
  // status(201).json(…) was called
  const [[body]] = res.json.mock.calls;
  return body;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Create
// ────────────────────────────────────────────────────────────────────────────
describe('createInstrument', () => {
  it('creates a FinancialInstrument document', async () => {
    const body = await createViaController();

    const count = await FinancialInstrument.countDocuments({ symbol: 'AAPL' });
    expect(count).toBe(1);
    expect(body.symbol).toBe('AAPL');
    expect(body.instrumentClass).toBe('stock');
  });

  it('creates an initial InstrumentVersion with validTo=null and isDeleted=false', async () => {
    const body = await createViaController();

    const version = await InstrumentVersion.findOne({ instrumentId: body._id }).lean();
    expect(version).not.toBeNull();
    expect(version.validTo).toBeNull();
    expect(version.isDeleted).toBe(false);
    expect(version.attributes).toMatchObject({ sector: 'Technology' });
  });

  it('responds with HTTP 201 and includes currentVersion in the body', async () => {
    const req = mockReq({ body: { symbol: 'MSFT', instrumentClass: 'stock', name: 'Microsoft' } });
    const res = mockRes();
    await createInstrument(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const [[body]] = res.json.mock.calls;
    expect(body.currentVersion).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Read
// ────────────────────────────────────────────────────────────────────────────
describe('getInstrument', () => {
  it('returns 404 when instrument does not exist', async () => {
    const req = mockReq({ params: { id: 'nonexistent-id' } });
    const res = mockRes();
    await getInstrument(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the instrument together with its current version', async () => {
    const created = await createViaController();
    const req = mockReq({ params: { id: created._id } });
    const res = mockRes();
    await getInstrument(req, res);

    const [[body]] = res.json.mock.calls;
    expect(body._id).toBe(created._id);
    expect(body.currentVersion).not.toBeNull();
    expect(body.currentVersion.isDeleted).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Update (temporal: close old version, open new version)
// ────────────────────────────────────────────────────────────────────────────
describe('updateInstrument', () => {
  it('closes the previous version (sets validTo) and creates a new open version', async () => {
    const created = await createViaController();

    const req = mockReq({
      params: { id: created._id },
      body: { attributes: { sector: 'Technology', marketCap: 'mega' } },
    });
    const res = mockRes();
    await updateInstrument(req, res);

    const versions = await InstrumentVersion
      .find({ instrumentId: created._id })
      .sort({ validFrom: 1 })
      .lean();

    // Two versions total
    expect(versions).toHaveLength(2);

    const [oldV, newV] = versions;
    // Old version now has a validTo date
    expect(oldV.validTo).not.toBeNull();
    // New version is open (validTo=null) and not deleted
    expect(newV.validTo).toBeNull();
    expect(newV.isDeleted).toBe(false);
    expect(newV.attributes).toMatchObject({ marketCap: 'mega' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Delete (temporal: create a deleted-marker version; row still in DB)
// ────────────────────────────────────────────────────────────────────────────
describe('deleteInstrument', () => {
  it('does not physically remove the FinancialInstrument document', async () => {
    const created = await createViaController();

    const req = mockReq({ params: { id: created._id } });
    const res = mockRes();
    await deleteInstrument(req, res);

    const stillExists = await FinancialInstrument.findById(created._id).lean();
    expect(stillExists).not.toBeNull();
  });

  it('creates a new version with isDeleted=true and closes the old one', async () => {
    const created = await createViaController();

    const req = mockReq({ params: { id: created._id } });
    const res = mockRes();
    await deleteInstrument(req, res);

    const versions = await InstrumentVersion
      .find({ instrumentId: created._id })
      .sort({ validFrom: 1 })
      .lean();

    expect(versions).toHaveLength(2);

    const [oldV, deletedV] = versions;
    // Original version was closed
    expect(oldV.validTo).not.toBeNull();
    // Delete-marker version
    expect(deletedV.isDeleted).toBe(true);
    expect(deletedV.validTo).toBeNull();
  });

  it('responds with a confirmation message', async () => {
    const created = await createViaController();
    const req = mockReq({ params: { id: created._id } });
    const res = mockRes();
    await deleteInstrument(req, res);

    const [[body]] = res.json.mock.calls;
    expect(body.message).toMatch(/deleted/i);
    expect(body.instrumentId).toBe(created._id);
  });
});
