import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/',             label: 'Dashboard' },
  { to: '/instruments',  label: 'Instruments' },
  { to: '/data-sources', label: 'Data Sources' },
  { to: '/portfolios',   label: 'Portfolios' },
  { to: '/analytics',    label: 'Analytics' },
  { to: '/market-data',  label: 'Market Data' },
  { to: '/ingest',       label: 'Data Ingest' },
  { to: '/spark',        label: 'Spark Analytics' },
  { to: '/assistant',    label: 'AI Assistant' },
];

export default function Layout() {
  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">A</div>
            <h2>Acme DWH</h2>
          </div>
          <span className="subtitle">Financial Data Platform</span>
        </div>

        <ul className="nav-list">
          {navItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
