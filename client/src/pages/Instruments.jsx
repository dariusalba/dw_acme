import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { instrumentsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const CLASSES = ['stock', 'bond', 'crypto', 'commodity', 'etf', 'forex', 'options', 'futures', 'index'];
const REGIONS = ['US', 'Europe', 'Asia', 'China', 'Africa', 'Global', 'Latin America'];

const EMPTY_FORM = {
  symbol: '', instrumentClass: 'stock', name: '', description: '',
  currency: 'USD', exchange: '', isin: '', region: 'US'
};

export default function Instruments() {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  function loadInstruments() {
    return instrumentsApi.list()
      .then(res => setInstruments(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadInstruments(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await instrumentsApi.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setLoading(true);
      await loadInstruments();
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const classes = [...new Set([...CLASSES, ...instruments.map(i => i.instrumentClass)])];
  const regions = [...new Set([...REGIONS, ...instruments.map(i => i.region).filter(Boolean)])];

  const filtered = instruments.filter(i => {
    const matchesSearch = !filter ||
      i.symbol.toLowerCase().includes(filter.toLowerCase()) ||
      (i.name && i.name.toLowerCase().includes(filter.toLowerCase()));
    const matchesClass = classFilter === 'all' || i.instrumentClass === classFilter;
    const matchesRegion = regionFilter === 'all' || i.region === regionFilter;
    return matchesSearch && matchesClass && matchesRegion;
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Financial Instruments</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add Instrument'}
        </button>
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom: 24 }}>
          <h2>New Instrument</h2>
          {saveError && <div className="error-message" style={{ marginBottom: 16 }}>{saveError}</div>}
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Symbol *</label>
                <input className="search-input" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} required placeholder="e.g. AAPL" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Name *</label>
                <input className="search-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Apple Inc." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Class *</label>
                <select className="select-input" value={form.instrumentClass} onChange={e => setForm(f => ({ ...f, instrumentClass: e.target.value }))}>
                  {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Exchange</label>
                <input className="search-input" value={form.exchange} onChange={e => setForm(f => ({ ...f, exchange: e.target.value }))} placeholder="e.g. NASDAQ" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Currency</label>
                <input className="search-input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="USD" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Region</label>
                <select className="select-input" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>ISIN</label>
                <input className="search-input" value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>Description</label>
              <input className="search-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the instrument" />
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create Instrument'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setSaveError(null); setForm(EMPTY_FORM); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="filters">
        <input
          type="text"
          placeholder="Search by symbol or name..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="search-input"
        />
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="select-input">
          <option value="all">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="select-input">
          <option value="all">All Regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Class</th>
                <th>Region</th>
                <th>Exchange</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inst => (
                <tr key={inst._id}>
                  <td><strong>{inst.symbol}</strong></td>
                  <td>{inst.name}</td>
                  <td><span className="class-badge" data-class={inst.instrumentClass?.toLowerCase()}>{inst.instrumentClass}</span></td>
                  <td>{inst.region || '—'}</td>
                  <td>{inst.exchange}</td>
                  <td>
                    <Link to={`/instruments/${inst._id}`} className="btn btn-sm">Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>No instruments found matching your filters.</p>
        </div>
      )}
    </div>
  );
}
