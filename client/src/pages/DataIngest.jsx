import { useState, useEffect } from 'react';
import { instrumentsApi, dataSourcesApi, timeSeriesApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function DataIngest() {
  const [instruments, setInstruments] = useState([]);
  const [sources, setSources] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [instRes, srcRes] = await Promise.all([
          instrumentsApi.list(),
          dataSourcesApi.list()
        ]);
        setInstruments(instRes.data);
        setSources(srcRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setPageLoading(false);
      }
    }
    fetchData();
  }, []);

  function generateSample() {
    const sample = [];
    const basePrice = 100 + Math.random() * 200;
    const startDate = new Date('2024-06-01');
    for (let i = 0; i < 5; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const open = Math.round((basePrice + (Math.random() - 0.5) * 10) * 100) / 100;
      const close = Math.round((basePrice + (Math.random() - 0.5) * 10) * 100) / 100;
      sample.push({
        date: date.toISOString().split('T')[0],
        open,
        close,
        high: Math.round(Math.max(open, close) * 1.02 * 100) / 100,
        low: Math.round(Math.min(open, close) * 0.98 * 100) / 100,
        volume: Math.round(1000000 + Math.random() * 10000000)
      });
    }
    setJsonData(JSON.stringify(sample, null, 2));
  }

  async function handleIngest() {
    if (!selectedInstrument || !selectedSource || !jsonData) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const records = JSON.parse(jsonData);
      const res = await timeSeriesApi.ingest({
        instrumentId: selectedInstrument,
        dataSourceId: selectedSource,
        records
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) return <LoadingSpinner />;

  return (
    <div className="page">
      <h1>Data Ingest</h1>
      <p className="page-description">
        Import time series data from external providers into the data warehouse.
        Data provenance is automatically recorded.
      </p>

      <div className="section-card ingest-form">
        <div className="form-group">
          <label>Financial Instrument</label>
          <select
            value={selectedInstrument}
            onChange={e => setSelectedInstrument(e.target.value)}
            className="select-input"
          >
            <option value="">Select Instrument</option>
            {instruments.map(i => (
              <option key={i._id} value={i._id}>{i.symbol} - {i.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Data Source</label>
          <select
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            className="select-input"
          >
            <option value="">Select Data Source</option>
            {sources.map(s => (
              <option key={s._id} value={s._id}>{s.vendorName}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Time Series Data (JSON Array)</span>
            <button onClick={generateSample} className="btn btn-sm btn-secondary" type="button">
              Generate Sample
            </button>
          </label>
          <textarea
            value={jsonData}
            onChange={e => setJsonData(e.target.value)}
            className="json-textarea"
            rows={15}
            placeholder='[{"date": "2024-01-02", "open": 185.0, "close": 186.5, "high": 187.0, "low": 184.5, "volume": 50000000}]'
          />
        </div>

        <button onClick={handleIngest} className="btn btn-primary" disabled={loading}>
          {loading ? 'Ingesting...' : 'Ingest Data'}
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {result && (
        <div className="success-message">
          Successfully ingested {result.inserted} records.
        </div>
      )}
    </div>
  );
}
