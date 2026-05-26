import { useState, useEffect } from 'react';
import { instrumentsApi, marketDataApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function MarketData() {
  const [instruments, setInstruments] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadInstruments() {
      try {
        const res = await instrumentsApi.list();
        setInstruments(res.data);
        if (res.data.length > 0) {
          setSelectedSymbol(res.data[0].symbol);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInstruments();
  }, []);

  async function handleFetchQuote(symbol) {
    setError(null);
    setMarketLoading(true);
    try {
      const res = await marketDataApi.getQuote(symbol);
      setQuote({ symbol, ...res.data.quote });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setMarketLoading(false);
    }
  }

  async function handleIngestQuote(symbol) {
    setError(null);
    setIngestLoading(true);
    try {
      const res = await marketDataApi.ingestQuote(symbol, { dataSourceId: 'ds-yahoo' });
      setQuote({ symbol, ...res.data.quote });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIngestLoading(false);
    }
  }

  async function handleRefreshQuotes() {
    setError(null);
    setRefreshResult(null);
    setRefreshLoading(true);

    try {
      const res = await marketDataApi.refreshQuotes({ limit: 5 });
      setRefreshResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRefreshLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Market Data Dashboard</h1>
          <p className="page-description">Lookup live quotes and ingest them directly into the data warehouse.</p>
        </div>
      </div>

      <div className="dashboard-sections">
        <section className="section-card market-data-panel">
          <div className="market-data-panel-header">
            <h2>Quick Lookup</h2>
            <div className="market-data-controls">
              <select
                className="select-input"
                value={selectedSymbol}
                onChange={e => setSelectedSymbol(e.target.value)}
              >
                {instruments.map(inst => (
                  <option key={inst._id} value={inst.symbol}>
                    {inst.symbol} - {inst.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={!selectedSymbol || marketLoading || ingestLoading}
                onClick={() => handleFetchQuote(selectedSymbol)}
              >
                {marketLoading ? 'Loading…' : 'Fetch Quote'}
              </button>
              <button
                className="btn btn-secondary"
                disabled={!selectedSymbol || marketLoading || ingestLoading || refreshLoading}
                onClick={() => handleIngestQuote(selectedSymbol)}
              >
                {ingestLoading ? 'Ingesting…' : 'Ingest Quote'}
              </button>
              <button
                className="btn btn-primary"
                disabled={marketLoading || ingestLoading || refreshLoading}
                onClick={handleRefreshQuotes}
              >
                {refreshLoading ? 'Refreshing…' : 'Refresh Top Instruments'}
              </button>
            </div>
          </div>

          {quote ? (
            <div className="market-data-card">
              <div className="market-data-card-header">
                <h3>{quote.symbol} Live Quote</h3>
                <span className="class-badge">Yahoo Finance</span>
              </div>
              <div className="market-data-grid">
                <div>
                  <span className="label">Last Update</span>
                  <span className="value">{new Date(quote.latestTradingDay || Date.now()).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="label">Price</span>
                  <span className="value">${quote.price?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="label">Open</span>
                  <span className="value">${quote.open?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="label">High</span>
                  <span className="value price-up">${quote.high?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="label">Low</span>
                  <span className="value price-down">${quote.low?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="label">Volume</span>
                  <span className="value">{quote.volume?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="label">Change</span>
                  <span className={`value ${quote.change >= 0 ? 'price-up' : 'price-down'}`}>
                    {quote.change?.toFixed(2)} ({quote.changePercent})
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📈</div>
              <p>Select an instrument and fetch a live quote to preview market data.</p>
            </div>
          )}

          {refreshResult && (
            <section className="section-card">
              <h2>Refresh Summary</h2>
              <p className="section-description">Scheduled refresh ran against the selected instrument set.</p>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refreshResult.results.map(result => (
                      <tr key={result.symbol} className={result.success ? '' : 'deleted-row'}>
                        <td>{result.symbol}</td>
                        <td>{result.success ? 'Success' : 'Error'}</td>
                        <td>{result.success ? `Saved ${result.recordId}` : result.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>

        <section className="section-card">
          <h2>Instruments</h2>
          <p className="section-description">Use the quick action buttons to fetch or ingest quotes for any supported instrument.</p>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Exchange</th>
                  <th>Class</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map(inst => (
                  <tr key={inst._id}>
                    <td>{inst.symbol}</td>
                    <td>{inst.name}</td>
                    <td>{inst.exchange}</td>
                    <td><span className="class-badge" data-class={inst.instrumentClass?.toLowerCase()}>{inst.instrumentClass}</span></td>
                    <td className="action-cell">
                      <button className="btn btn-sm" onClick={() => handleFetchQuote(inst.symbol)} disabled={marketLoading || ingestLoading}>
                        Quote
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => handleIngestQuote(inst.symbol)} disabled={marketLoading || ingestLoading}>
                        Ingest
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
