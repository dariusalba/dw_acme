import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dataSourcesApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const LICENSE_TYPES = ['free', 'freemium', 'commercial', 'open', 'academic'];
const EMPTY_FORM = { vendorName: '', apiEndpoint: '', description: '', licenseType: 'commercial' };

export default function DataSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  function loadSources() {
    return dataSourcesApi.list()
      .then(res => setSources(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadSources(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await dataSourcesApi.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setLoading(true);
      await loadSources();
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Data Sources</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add Data Source'}
        </button>
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom: 24 }}>
          <h2>New Data Source</h2>
          {saveError && <div className="error-message" style={{ marginBottom: 16 }}>{saveError}</div>}
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Vendor Name *</label>
                <input className="search-input" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} required placeholder="e.g. Nasdaq Data Link" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>API Endpoint</label>
                <input className="search-input" value={form.apiEndpoint} onChange={e => setForm(f => ({ ...f, apiEndpoint: e.target.value }))} placeholder="https://api.example.com" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>License Type</label>
                <select className="select-input" value={form.licenseType} onChange={e => setForm(f => ({ ...f, licenseType: e.target.value }))}>
                  {LICENSE_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>Description</label>
              <input className="search-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the data vendor" />
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create Data Source'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setSaveError(null); setForm(EMPTY_FORM); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>License Type</th>
                <th>Last Synced</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(src => (
                <tr key={src._id}>
                  <td><strong>{src.vendorName}</strong></td>
                  <td><span className="class-badge" data-class={src.licenseType?.toLowerCase()}>{src.licenseType}</span></td>
                  <td>{src.lastSyncedAt ? new Date(src.lastSyncedAt).toLocaleString() : 'Never'}</td>
                  <td>
                    <Link to={`/data-sources/${src._id}`} className="btn btn-sm">Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
