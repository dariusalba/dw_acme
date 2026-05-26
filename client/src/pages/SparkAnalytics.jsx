import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { sparkApi, instrumentsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function SparkAnalytics() {
  const [status,       setStatus]       = useState(null);
  const [aggregations, setAggregations] = useState([]);
  const [predictions,  setPredictions]  = useState([]);
  const [instruments,  setInstruments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [running,      setRunning]      = useState(false);
  const [runMsg,       setRunMsg]       = useState(null);
  const [selectedSym,  setSelectedSym]  = useState('');
  const [selectedModel,setSelectedModel]= useState('');
  const [aggFilter,    setAggFilter]    = useState('');

  async function loadAll() {
    try {
      const [statusRes, aggRes, predRes, instRes] = await Promise.all([
        sparkApi.status(),
        sparkApi.aggregations({ limit: 200 }),
        sparkApi.predictions(),
        instrumentsApi.list(),
      ]);
      setStatus(statusRes.data);
      setAggregations(aggRes.data.aggregations ?? []);
      setPredictions(predRes.data.predictions  ?? []);
      setInstruments(instRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleRun(job) {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await sparkApi.run({ job });
      setRunMsg(res.data.message);
      // Poll for results after a delay
      setTimeout(() => { loadAll(); setRunning(false); }, 15_000);
    } catch (err) {
      setRunMsg('Error: ' + (err.response?.data?.error ?? err.message));
      setRunning(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error)   return <ErrorMessage message={error} />;

  // Chart data for selected symbol + model
  const chartPred = predictions.find(
    p => p.symbol === selectedSym && (selectedModel ? p.modelType === selectedModel : true)
  );
  const chartData = chartPred?.testPredictions?.map(r => ({
    date:      r.date,
    actual:    r.actual,
    predicted: r.predicted,
  })) ?? [];

  const modelTypes = [...new Set(predictions.map(p => p.modelType))];
  const predSymbols= [...new Set(predictions.map(p => p.symbol))];

  const filteredAgg = aggregations.filter(a =>
    !aggFilter ||
    a.symbol?.toLowerCase().includes(aggFilter.toLowerCase()) ||
    a.name?.toLowerCase().includes(aggFilter.toLowerCase())
  );

  const hasResults = status?.hasResults;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Spark Analytics</h1>
          <p className="page-description">
            Results computed by Apache Spark (MLlib + DataFrame API). Run the Python jobs to populate.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" disabled={running} onClick={() => handleRun('aggregation')}>
            {running ? 'Running…' : 'Run Aggregation Job'}
          </button>
          <button className="btn btn-primary" disabled={running} onClick={() => handleRun('ml')}>
            {running ? 'Running…' : 'Run ML Job'}
          </button>
        </div>
      </div>

      {runMsg && (
        <div className="section-card" style={{ marginBottom: 16, background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)' }}>
          <p style={{ margin: 0 }}>{runMsg}</p>
          {running && <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Results will refresh automatically in ~15 s once the job finishes…
          </p>}
        </div>
      )}

      {!hasResults && (
        <div className="section-card" style={{ marginBottom: 24, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <h3 style={{ marginBottom: 8 }}>No Spark results yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            Run the jobs from the buttons above, or manually from <code>server/</code>:
          </p>
          <pre style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '12px 20px', display: 'inline-block', textAlign: 'left', fontSize: 13 }}>
{`pip install pyspark python-dotenv
python src/spark/aggregation_job.py
python src/spark/ml_prediction_job.py`}
          </pre>
        </div>
      )}

      {/* ── Status cards ───────────────────────────────────────────────── */}
      {hasResults && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <span className="stat-label">Aggregated Instruments</span>
            <span className="stat-value">{status.aggregations}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">ML Model Results</span>
            <span className="stat-value">{status.predictions}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Model Types</span>
            <span className="stat-value">{modelTypes.join(' · ') || '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Symbols with Predictions</span>
            <span className="stat-value">{predSymbols.length}</span>
          </div>
        </div>
      )}

      {/* ── Aggregation table ───────────────────────────────────────────── */}
      {aggregations.length > 0 && (
        <section className="section-card" style={{ marginBottom: 24 }}>
          <h2>Spark Aggregations <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-muted)' }}>— DataFrame groupBy / agg</span></h2>
          <div className="filters" style={{ marginBottom: 12 }}>
            <input
              className="search-input"
              placeholder="Filter by symbol or name…"
              value={aggFilter}
              onChange={e => setAggFilter(e.target.value)}
            />
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Data Points</th>
                  <th>Avg Close</th>
                  <th>Min Low</th>
                  <th>Max High</th>
                  <th>Ann. Volatility</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgg.map((a, i) => (
                  <tr key={i}>
                    <td><strong>{a.symbol}</strong></td>
                    <td>{a.name}</td>
                    <td><span className="class-badge" data-class={a.instrumentClass?.toLowerCase()}>{a.instrumentClass}</span></td>
                    <td>{Number(a.dataPoints)?.toLocaleString()}</td>
                    <td>${Number(a.avgClose)?.toFixed(2)}</td>
                    <td>${Number(a.minLow)?.toFixed(2)}</td>
                    <td>${Number(a.maxHigh)?.toFixed(2)}</td>
                    <td>{a.annualisedVolatility != null ? (Number(a.annualisedVolatility) * 100).toFixed(1) + '%' : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {a.firstDate ? new Date(a.firstDate).toLocaleDateString() : '—'}
                      {' → '}
                      {a.lastDate  ? new Date(a.lastDate).toLocaleDateString()  : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── ML predictions ─────────────────────────────────────────────── */}
      {predictions.length > 0 && (
        <section className="section-card" style={{ marginBottom: 24 }}>
          <h2>ML Predictions <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-muted)' }}>— Spark MLlib LinearRegression / GBTRegressor</span></h2>

          {/* Model metrics table */}
          <div className="table-wrapper" style={{ marginBottom: 24 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Model</th>
                  <th>Train Rows</th>
                  <th>Test Rows</th>
                  <th>RMSE</th>
                  <th>MAE</th>
                  <th>R²</th>
                  <th>Computed At</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p, i) => (
                  <tr key={i}
                    style={{ cursor: 'pointer', background: selectedSym === p.symbol && selectedModel === p.modelType ? 'rgba(99,102,241,.06)' : '' }}
                    onClick={() => { setSelectedSym(p.symbol); setSelectedModel(p.modelType); }}
                  >
                    <td><strong>{p.symbol}</strong></td>
                    <td><span className="class-badge">{p.modelType}</span></td>
                    <td>{p.trainRows?.toLocaleString()}</td>
                    <td>{p.testRows?.toLocaleString()}</td>
                    <td>{p.rmse?.toFixed(4)}</td>
                    <td>{p.mae?.toFixed(4)}</td>
                    <td style={{ color: p.r2 > 0.9 ? 'var(--success)' : p.r2 > 0.7 ? 'var(--warning)' : 'var(--danger)' }}>
                      {p.r2?.toFixed(4)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.computedAt ? new Date(p.computedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Click a row to view its actual vs predicted chart below.
          </p>

          {/* Actual vs Predicted chart */}
          {chartData.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 16 }}>
                {selectedSym} — {selectedModel}: Actual vs Predicted (test set)
              </h3>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="actual"    stroke="#2563eb" dot={false} name="Actual"    />
                  <Line type="monotone" dataKey="predicted" stroke="#f59e0b" dot={false} name="Predicted" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
