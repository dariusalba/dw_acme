import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Instruments from './pages/Instruments';
import InstrumentDetail from './pages/InstrumentDetail';
import DataSources from './pages/DataSources';
import DataSourceDetail from './pages/DataSourceDetail';
import Portfolios from './pages/Portfolios';
import Analytics from './pages/Analytics';
import DataIngest from './pages/DataIngest';
import Assistant from './pages/Assistant';
import MarketData from './pages/MarketData';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="instruments" element={<Instruments />} />
        <Route path="instruments/:id" element={<InstrumentDetail />} />
        <Route path="data-sources" element={<DataSources />} />
        <Route path="data-sources/:id" element={<DataSourceDetail />} />
        <Route path="portfolios" element={<Portfolios />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="market-data" element={<MarketData />} />
        <Route path="ingest" element={<DataIngest />} />
        <Route path="assistant" element={<Assistant />} />
      </Route>
    </Routes>
  );
}
