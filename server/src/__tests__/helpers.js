/**
 * Shared test helpers — in-memory MongoDB setup/teardown via MongoMemoryServer.
 * Import and call setupDB() / teardownDB() in each test suite's beforeAll/afterAll.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

async function setupDB() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function teardownDB() {
  await mongoose.disconnect();
  await mongod.stop();
}

async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/** Minimal mock for Express res object */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

/** Minimal mock for Express req object */
function mockReq(overrides = {}) {
  return { params: {}, body: {}, query: {}, ...overrides };
}

module.exports = { setupDB, teardownDB, clearDB, mockRes, mockReq };
