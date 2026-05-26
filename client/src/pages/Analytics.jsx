import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { instrumentsApi, analyticsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Analytics() {
  const [instruments, setInstruments] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const [compareInstrument, setCompareInstrument] = useState('');
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    instrumentsApi.list()
      .then(res => setInstruments(res.data))
      .catch(err => setError(err.message))
      .finally(() => setPageLoading(false));
  }, []);

  async function analyzeInstrument() {
    if (!selectedInstrument) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, trendRes, forecastRes, riskRes] = await Promise.all([
        analyticsApi.stats(selectedInstrument),
        analyticsApi.trend(selectedInstrument, { interval: 'daily' }),
        analyticsApi.forecast(selectedInstrument, { window: 5 }),
        analyticsApi.risk(selectedInstrument)
      ]);
      setStats(statsRes.data.stats);
      setTrend(trendRes.data);
      setForecast(forecastRes.data);
      setRisk(riskRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runComparison() {
    if (!selectedInstrument || !compareInstrument) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.compare(selectedInstrument, compareInstrument);
      setComparison(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) return <LoadingSpinner />;

  const chartData = trend.map(t => ({
    date: new Date(t.date).toLocaleDateString(),
    close: t.avgClose?.toFixed(2),
    high: t.maxHigh?.toFixed(2),
    low: t.minLow?.toFixed(2),
    volume: t.totalVolume
  }));

  const selectedName = instruments.find(i => i._id === selectedInstrument)?.symbol || '';

  return (
    <div className="page">
      <h1>Analytics</h1>

      <div className="filters">
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
        <button onClick={analyzeInstrument} className="btn btn-primary" disabled={!selectedInstrument}>
          Analyze
        </button>
        {selectedInstrument && (
          <a
            href={analyticsApi.exportUrl(selectedInstrument)}
            download
            className="btn btn-secondary"
          >
            Export CSV
          </a>
        )}
      </div>

      {error && <ErrorMessage message={error} />}
      {loading && <LoadingSpinner />}

      {stats && (
        <div className="detail-grid">
          <div className="stat-card">
            <h3>Average Close</h3>
            <span className="stat-number">${stats.avgClose?.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <h3>Min Low</h3>
            <span className="stat-number">${stats.minLow?.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <h3>Max High</h3>
            <span className="stat-number">${stats.maxHigh?.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <h3>Data Points</h3>
            <span className="stat-number">{stats.count}</span>
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="section-card">
          <h2>{selectedName} Price Trend</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} name="Avg Close" />
              <Line type="monotone" dataKey="high" stroke="#16a34a" dot={false} name="Max High" />
              <Line type="monotone" dataKey="low" stroke="#dc2626" dot={false} name="Min Low" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {forecast && forecast.forecastedClose && (
        <div className="section-card">
          <h2>Forecast</h2>
          <div className="detail-card">
            <dl className="detail-list">
              <dt>Method</dt><dd>{forecast.method}</dd>
              <dt>Last Date</dt><dd>{new Date(forecast.lastDate).toLocaleDateString()}</dd>
              <dt>Forecast Date</dt><dd>{new Date(forecast.forecastDate).toLocaleDateString()}</dd>
              <dt>Forecasted Close</dt><dd><strong>${forecast.forecastedClose}</strong></dd>
              <dt>Based On</dt><dd>{forecast.recentCloses?.map(c => `$${c}`).join(', ')}</dd>
            </dl>
          </div>
        </div>
      )}

      {risk && risk.annualizedVolatilityPct !== undefined && (
        <div className="section-card">
          <h2>Risk Metrics</h2>
          <div className="detail-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <h3>Annualized Volatility</h3>
              <span className="stat-number" style={{ fontSize: 28 }}>{risk.annualizedVolatilityPct}%</span>
            </div>
            <div className="stat-card">
              <h3>Max Drawdown</h3>
              <span className="stat-number price-down" style={{ fontSize: 28 }}>{risk.maxDrawdownPct}%</span>
            </div>
            <div className="stat-card">
              <h3>Sharpe Ratio</h3>
              <span className="stat-number" style={{ fontSize: 28 }}>{risk.sharpeRatio}</span>
            </div>
            <div className="stat-card">
              <h3>Risk Category</h3>
              <span className="stat-number" style={{
                fontSize: 24,
                color: risk.riskCategory === 'Low' ? 'var(--green)' : risk.riskCategory === 'Medium' ? 'var(--amber)' : 'var(--rose)'
              }}>
                {risk.riskCategory}
              </span>
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Based on {risk.dataPoints} data points &bull; Daily avg return: {risk.avgDailyReturnPct}%
          </div>
        </div>
      )}

      <div className="section-card">
        <h2>Compare Instruments</h2>
        <div className="filters">
          <select
            value={compareInstrument}
            onChange={e => setCompareInstrument(e.target.value)}
            className="select-input"
          >
            <option value="">Select Second Instrument</option>
            {instruments.filter(i => i._id !== selectedInstrument).map(i => (
              <option key={i._id} value={i._id}>{i.symbol} - {i.name}</option>
            ))}
          </select>
          <button
            onClick={runComparison}
            className="btn btn-primary"
            disabled={!selectedInstrument || !compareInstrument}
          >
            Compare
          </button>
        </div>

        {comparison && (
          <div className="comparison-grid">
            {comparison.map(item => (
              <div key={item.instrument._id} className="detail-card">
                <h3>{item.instrument.symbol} - {item.instrument.name}</h3>
                {item.stats ? (
                  <dl className="detail-list">
                    <dt>Avg Close</dt><dd>${item.stats.avgClose?.toFixed(2)}</dd>
                    <dt>Min Low</dt><dd>${item.stats.minLow?.toFixed(2)}</dd>
                    <dt>Max High</dt><dd>${item.stats.maxHigh?.toFixed(2)}</dd>
                    <dt>Avg Volume</dt><dd>{Math.round(item.stats.avgVolume)?.toLocaleString()}</dd>
                    <dt>Data Points</dt><dd>{item.stats.count}</dd>
                  </dl>
                ) : (
                  <p>No data available</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
