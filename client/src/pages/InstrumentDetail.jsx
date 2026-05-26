import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { instrumentsApi, timeSeriesApi, analyticsApi, marketDataApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function InstrumentDetail() {
  const { id } = useParams();
  const [instrument, setInstrument] = useState(null);
  const [versions, setVersions] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [stats, setStats] = useState(null);
  const [liveQuote, setLiveQuote] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [marketError, setMarketError] = useState(null);
  const [asOfDate, setAsOfDate] = useState('');
  const [temporalSnapshot, setTemporalSnapshot] = useState(null);
  const [temporalLoading, setTemporalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [instRes, versRes, tsRes, statsRes] = await Promise.all([
          instrumentsApi.get(id),
          instrumentsApi.getVersions(id),
          timeSeriesApi.getByInstrument(id, { limit: 60 }),
          analyticsApi.stats(id)
        ]);
        setInstrument(instRes.data);
        setVersions(versRes.data);
        setTimeSeries(tsRes.data.reverse());
        setStats(statsRes.data.stats);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  async function fetchLiveQuote() {
    if (!instrument?.symbol) return;
    setMarketError(null);
    setLiveLoading(true);
    try {
      const res = await marketDataApi.getQuote(instrument.symbol);
      setLiveQuote(res.data.quote);
    } catch (err) {
      setMarketError(err.response?.data?.error || err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  async function ingestLiveQuote() {
    if (!instrument?.symbol) return;
    setMarketError(null);
    setIngestLoading(true);
    try {
      const res = await marketDataApi.ingestQuote(instrument.symbol, { dataSourceId: 'ds-yahoo' });
      setLiveQuote(res.data.quote);
      const tsRes = await timeSeriesApi.getByInstrument(id, { limit: 60 });
      setTimeSeries(tsRes.data.reverse());
      setMarketError(null);
    } catch (err) {
      setMarketError(err.response?.data?.error || err.message);
    } finally {
      setIngestLoading(false);
    }
  }

  useEffect(() => {
    if (instrument?.symbol) {
      fetchLiveQuote();
    }
  }, [instrument?.symbol]);

  async function queryAtTime() {
    if (!asOfDate) return;
    setTemporalLoading(true);
    try {
      const res = await instrumentsApi.getAtTime(id, new Date(asOfDate).toISOString());
      setTemporalSnapshot(res.data);
    } catch (err) {
      setTemporalSnapshot({ error: err.message });
    } finally {
      setTemporalLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!instrument) return <ErrorMessage message="Instrument not found" />;

  const chartData = timeSeries.map(r => ({
    date: new Date(r.date).toLocaleDateString(),
    close: parseFloat(r.close),
    open: parseFloat(r.open),
    high: parseFloat(r.high),
    low: parseFloat(r.low)
  }));

  return (
    <div className="page">
      <Link to="/instruments" className="back-link">Back to Instruments</Link>
      <div className="detail-header">
        <h1>{instrument.symbol} - {instrument.name}</h1>
        <span className="class-badge large">{instrument.instrumentClass}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>Details</h3>
          <dl className="detail-list">
            <dt>Symbol</dt><dd>{instrument.symbol}</dd>
            <dt>Class</dt><dd>{instrument.instrumentClass}</dd>
            <dt>Currency</dt><dd>{instrument.currency}</dd>
            <dt>Exchange</dt><dd>{instrument.exchange}</dd>
            <dt>ISIN</dt><dd>{instrument.isin || 'N/A'}</dd>
            <dt>Region</dt><dd>{instrument.region || 'N/A'}</dd>
            <dt>Description</dt><dd>{instrument.description}</dd>
          </dl>
        </div>

        <div className="detail-card">
          <h3>Live Market Data</h3>
          {marketError && <ErrorMessage message={marketError} />}
          <div className="market-data-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={fetchLiveQuote} disabled={liveLoading || ingestLoading}>
              {liveLoading ? 'Refreshing…' : 'Refresh Quote'}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={ingestLiveQuote} disabled={liveLoading || ingestLoading}>
              {ingestLoading ? 'Ingesting…' : 'Ingest Quote'}
            </button>
          </div>
          {liveQuote ? (
            <dl className="detail-list">
              <dt>Date</dt><dd>{new Date(liveQuote.latestTradingDay || liveQuote.date || Date.now()).toLocaleString()}</dd>
              <dt>Price</dt><dd>${liveQuote.price?.toFixed(2)}</dd>
              <dt>Open</dt><dd>${liveQuote.open?.toFixed(2)}</dd>
              <dt>High</dt><dd>${liveQuote.high?.toFixed(2)}</dd>
              <dt>Low</dt><dd>${liveQuote.low?.toFixed(2)}</dd>
              <dt>Volume</dt><dd>{liveQuote.volume?.toLocaleString()}</dd>
              <dt>Change</dt><dd>{liveQuote.change?.toFixed(2)} ({liveQuote.changePercent})</dd>
            </dl>
          ) : (
            <p>Fetch live instrument data from Yahoo Finance.</p>
          )}
        </div>

        {stats && (
          <div className="detail-card">
            <h3>Statistics</h3>
            <dl className="detail-list">
              <dt>Data Points</dt><dd>{stats.count}</dd>
              <dt>Avg Close</dt><dd>${stats.avgClose?.toFixed(2)}</dd>
              <dt>Min Low</dt><dd>${stats.minLow?.toFixed(2)}</dd>
              <dt>Max High</dt><dd>${stats.maxHigh?.toFixed(2)}</dd>
              <dt>Avg Volume</dt><dd>{Math.round(stats.avgVolume)?.toLocaleString()}</dd>
              <dt>Period</dt>
              <dd>{new Date(stats.firstDate).toLocaleDateString()} - {new Date(stats.lastDate).toLocaleDateString()}</dd>
            </dl>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="section-card">
          <h2>Price Chart</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} name="Close" />
              <Line type="monotone" dataKey="high" stroke="#16a34a" dot={false} name="High" />
              <Line type="monotone" dataKey="low" stroke="#dc2626" dot={false} name="Low" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="section-card">
        <h2>Point-in-Time Query</h2>
        <p className="section-description">
          Query the state of this instrument at any historical date. The temporal data warehouse
          preserves all versions so you can see exactly how the record looked at any point in time.
        </p>
        <div className="filters" style={{ marginBottom: 16 }}>
          <input
            type="date"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            className="search-input"
            style={{ maxWidth: 220 }}
            max={new Date().toISOString().split('T')[0]}
          />
          <button
            className="btn btn-primary"
            onClick={queryAtTime}
            disabled={!asOfDate || temporalLoading}
          >
            {temporalLoading ? 'Querying…' : 'Query State at Date'}
          </button>
        </div>
        {temporalSnapshot && (
          temporalSnapshot.error ? (
            <div className="error-message">{temporalSnapshot.error}</div>
          ) : (
            <div className="detail-card" style={{ marginTop: 4 }}>
              <h3>
                State as of {new Date(asOfDate).toLocaleDateString()}
                {temporalSnapshot.status === 'deleted_at_requested_time' && (
                  <span className="class-badge" style={{ marginLeft: 12, background: 'rgba(244,63,94,.12)', color: '#be123c' }}>
                    Deleted at this date
                  </span>
                )}
              </h3>
              <dl className="detail-list">
                <dt>Symbol</dt><dd>{temporalSnapshot.symbol}</dd>
                <dt>Class</dt><dd>{temporalSnapshot.instrumentClass}</dd>
                <dt>Exchange</dt><dd>{temporalSnapshot.exchange}</dd>
                <dt>Region</dt><dd>{temporalSnapshot.region || 'N/A'}</dd>
                {temporalSnapshot.version ? (
                  <>
                    <dt>Valid From</dt><dd>{new Date(temporalSnapshot.version.validFrom).toLocaleString()}</dd>
                    <dt>Valid To</dt><dd>{temporalSnapshot.version.validTo ? new Date(temporalSnapshot.version.validTo).toLocaleString() : 'Current'}</dd>
                    <dt>Attributes</dt>
                    <dd>
                      <pre className="attributes-json">
                        {JSON.stringify(temporalSnapshot.version.attributes, null, 2)}
                      </pre>
                    </dd>
                  </>
                ) : (
                  <><dt>Version</dt><dd>No version found for this date</dd></>
                )}
              </dl>
            </div>
          )
        )}
      </div>

      <div className="section-card">
        <h2>Version History (Temporal)</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Version ID</th>
              <th>Valid From</th>
              <th>Valid To</th>
              <th>Deleted</th>
              <th>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {versions.map(v => (
              <tr key={v._id} className={v.isDeleted ? 'deleted-row' : ''}>
                <td>{v._id.substring(0, 8)}...</td>
                <td>{new Date(v.validFrom).toLocaleString()}</td>
                <td>{v.validTo ? new Date(v.validTo).toLocaleString() : 'Current'}</td>
                <td>{v.isDeleted ? 'Yes' : 'No'}</td>
                <td><pre className="attributes-json">{JSON.stringify(v.attributes, null, 2)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
