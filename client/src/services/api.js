import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

export const instrumentsApi = {
  list: () => api.get('/instruments'),
  get: (id) => api.get(`/instruments/${id}`),
  getAtTime: (id, asOf) => api.get(`/instruments/${id}/at`, { params: { asOf } }),
  getVersions: (id) => api.get(`/instruments/${id}/versions`),
  create: (data) => api.post('/instruments', data),
  update: (id, data) => api.put(`/instruments/${id}`, data),
  remove: (id) => api.delete(`/instruments/${id}`)
};

export const dataSourcesApi = {
  list: () => api.get('/data-sources'),
  get: (id) => api.get(`/data-sources/${id}`),
  create: (data) => api.post('/data-sources', data)
};

export const timeSeriesApi = {
  getByInstrument: (instrumentId, params) =>
    api.get(`/time-series/instrument/${instrumentId}`, { params }),
  get: (instrumentId, dataSourceId, params) =>
    api.get(`/time-series/${instrumentId}/${dataSourceId}`, { params }),
  ingest: (data) => api.post('/time-series/ingest', data)
};

export const marketDataApi = {
  getQuote: (symbol) => api.get(`/market-data/quote/${symbol}`),
  ingestQuote: (symbol, data) => api.post(`/market-data/ingest/${symbol}`, data),
  refreshQuotes: (payload) => api.post('/market-data/refresh', payload)
};

export const portfoliosApi = {
  listOwners: () => api.get('/portfolios/owners'),
  getOwner: (id) => api.get(`/portfolios/owners/${id}`),
  createOwner: (data) => api.post('/portfolios/owners', data),
  list: () => api.get('/portfolios'),
  get: (id) => api.get(`/portfolios/${id}`),
  create: (data) => api.post('/portfolios', data),
  addAsset: (data) => api.post('/portfolios/assets', data),
  removeAsset: (id) => api.delete(`/portfolios/assets/${id}`)
};

export const analyticsApi = {
  stats: (instrumentId, params) => api.get(`/analytics/stats/${instrumentId}`, { params }),
  compare: (id1, id2, params) => api.get(`/analytics/compare/${id1}/${id2}`, { params }),
  trend: (instrumentId, params) => api.get(`/analytics/trend/${instrumentId}`, { params }),
  forecast: (instrumentId, params) => api.get(`/analytics/forecast/${instrumentId}`, { params }),
  risk: (instrumentId, params) => api.get(`/analytics/risk/${instrumentId}`, { params }),
  exportUrl: (instrumentId, params) => {
    const qs = new URLSearchParams({ ...params, format: 'csv' }).toString();
    return `${API_BASE}/analytics/export/${instrumentId}?${qs}`;
  }
};

export const assistantApi = {
  getTools: () => api.get('/assistant/tools'),
  callTool: (tool, params) => api.post('/assistant/call', { tool, params }),
  chat: (message) => api.post('/assistant/chat', { message })
};

export default api;
