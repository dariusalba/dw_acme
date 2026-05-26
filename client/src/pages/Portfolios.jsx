import { useState, useEffect } from 'react';
import { portfoliosApi, instrumentsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Portfolios() {
  const [owners, setOwners] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingAsset, setAddingAsset] = useState(false);
  const [newInstrumentId, setNewInstrumentId] = useState('');
  const [assetError, setAssetError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  async function fetchData() {
    try {
      const [ownersRes, portfoliosRes, instrRes] = await Promise.all([
        portfoliosApi.listOwners(),
        portfoliosApi.list(),
        instrumentsApi.list()
      ]);
      setOwners(ownersRes.data);
      setPortfolios(portfoliosRes.data);
      setInstruments(instrRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function selectPortfolio(id) {
    try {
      const res = await portfoliosApi.get(id);
      setSelectedPortfolio(res.data);
      setNewInstrumentId('');
      setAssetError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddAsset(e) {
    e.preventDefault();
    if (!newInstrumentId || !selectedPortfolio) return;
    setAssetError(null);
    try {
      await portfoliosApi.addAsset({
        portfolioId: selectedPortfolio._id,
        instrumentId: newInstrumentId
      });
      setNewInstrumentId('');
      await selectPortfolio(selectedPortfolio._id);
    } catch (err) {
      setAssetError(err.response?.data?.error || err.message);
    }
  }

  async function handleRemoveAsset(assetId) {
    if (!confirm('Remove this asset from the portfolio?')) return;
    setRemovingId(assetId);
    try {
      await portfoliosApi.removeAsset(assetId);
      await selectPortfolio(selectedPortfolio._id);
    } catch (err) {
      setAssetError(err.response?.data?.error || err.message);
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  function getOwnerName(ownerId) {
    const owner = owners.find(o => o._id === ownerId);
    return owner ? owner.name : 'Unknown';
  }

  function getInstrumentName(instrumentId) {
    const inst = instruments.find(i => i._id === instrumentId);
    return inst ? `${inst.symbol} – ${inst.name}` : instrumentId;
  }

  const availableInstruments = instruments.filter(inst =>
    !selectedPortfolio?.assets?.some(a => a.instrumentId === inst._id && !a.removedAt)
  );

  return (
    <div className="page">
      <h1>Portfolios</h1>

      <div className="dashboard-sections">
        <section className="section-card">
          <h2>Portfolio Owners</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {owners.map(owner => (
                  <tr key={owner._id}>
                    <td><strong>{owner.name}</strong></td>
                    <td><span className="class-badge">{owner.ownerType}</span></td>
                    <td>{owner.email}</td>
                    <td>{owner.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-card">
          <h2>All Portfolios</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Currency</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portfolios.map(p => (
                  <tr key={p._id} style={selectedPortfolio?._id === p._id ? { background: 'rgba(99,102,241,.04)' } : {}}>
                    <td><strong>{p.name}</strong></td>
                    <td>{getOwnerName(p.ownerId)}</td>
                    <td>{p.currency}</td>
                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => selectPortfolio(p._id)} className="btn btn-sm btn-primary">
                        View Assets
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedPortfolio && (
          <section className="section-card">
            <h2>{selectedPortfolio.name} — Assets</h2>
            {selectedPortfolio.description && (
              <p className="section-description">{selectedPortfolio.description}</p>
            )}

            {assetError && <div className="error-message" style={{ marginBottom: 16 }}>{assetError}</div>}

            <form onSubmit={handleAddAsset} style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <select
                className="select-input"
                value={newInstrumentId}
                onChange={e => setNewInstrumentId(e.target.value)}
                style={{ flex: 1, minWidth: 200 }}
              >
                <option value="">Select instrument to add…</option>
                {availableInstruments.map(i => (
                  <option key={i._id} value={i._id}>{i.symbol} — {i.name}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={!newInstrumentId}>
                + Add Asset
              </button>
            </form>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Added At</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPortfolio.assets?.map(asset => (
                    <tr key={asset._id} className={asset.removedAt ? 'deleted-row' : ''}>
                      <td>{getInstrumentName(asset.instrumentId)}</td>
                      <td>{new Date(asset.addedAt).toLocaleDateString()}</td>
                      <td>
                        <span className="class-badge" data-class={asset.removedAt ? 'removed' : 'active'}>
                          {asset.removedAt ? `Removed ${new Date(asset.removedAt).toLocaleDateString()}` : 'Active'}
                        </span>
                      </td>
                      <td>
                        {!asset.removedAt && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemoveAsset(asset._id)}
                            disabled={removingId === asset._id}
                          >
                            {removingId === asset._id ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!selectedPortfolio.assets || selectedPortfolio.assets.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                        No assets in this portfolio yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
