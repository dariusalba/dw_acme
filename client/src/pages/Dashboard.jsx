import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { instrumentsApi, dataSourcesApi, portfoliosApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [instruments, sources, portfolios, owners] = await Promise.all([
          instrumentsApi.list(),
          dataSourcesApi.list(),
          portfoliosApi.list(),
          portfoliosApi.listOwners()
        ]);
        setStats({
          instruments: instruments.data,
          sources: sources.data,
          portfolios: portfolios.data,
          owners: owners.data
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const classCounts = {};
  stats.instruments.forEach(i => {
    classCounts[i.instrumentClass] = (classCounts[i.instrumentClass] || 0) + 1;
  });

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Financial Instruments</h3>
          <span className="stat-number">{stats.instruments.length}</span>
          <Link to="/instruments">View all</Link>
        </div>
        <div className="stat-card">
          <h3>Data Sources</h3>
          <span className="stat-number">{stats.sources.length}</span>
          <Link to="/data-sources">View all</Link>
        </div>
        <div className="stat-card">
          <h3>Portfolios</h3>
          <span className="stat-number">{stats.portfolios.length}</span>
          <Link to="/portfolios">View all</Link>
        </div>
        <div className="stat-card">
          <h3>Portfolio Owners</h3>
          <span className="stat-number">{stats.owners.length}</span>
        </div>
      </div>

      <div className="dashboard-sections">
        <section className="section-card">
          <h2>Instruments by Class</h2>
          <div className="class-list">
            {Object.entries(classCounts).map(([cls, count]) => (
              <div key={cls} className="class-item">
                <span className="class-badge" data-class={cls.toLowerCase()}>{cls}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card">
          <h2>Recent Instruments</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Class</th>
                <th>Exchange</th>
              </tr>
            </thead>
            <tbody>
              {stats.instruments.slice(0, 5).map(inst => (
                <tr key={inst._id}>
                  <td><Link to={`/instruments/${inst._id}`}>{inst.symbol}</Link></td>
                  <td>{inst.name}</td>
                  <td><span className="class-badge" data-class={inst.instrumentClass}>{inst.instrumentClass}</span></td>
                  <td>{inst.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="section-card">
          <h2>Data Sources</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>License</th>
                <th>Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {stats.sources.map(src => (
                <tr key={src._id}>
                  <td><Link to={`/data-sources/${src._id}`}>{src.vendorName}</Link></td>
                  <td><span className="class-badge" data-class={src.licenseType?.toLowerCase()}>{src.licenseType}</span></td>
                  <td>{src.lastSyncedAt ? new Date(src.lastSyncedAt).toLocaleDateString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
