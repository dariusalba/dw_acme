import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dataSourcesApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function DataSourceDetail() {
  const { id } = useParams();
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    dataSourcesApi.get(id)
      .then(res => setSource(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!source) return <ErrorMessage message="Data source not found" />;

  return (
    <div className="page">
      <Link to="/data-sources" className="back-link">Back to Data Sources</Link>
      <h1>{source.vendorName}</h1>
      <div className="detail-card">
        <dl className="detail-list">
          <dt>Vendor Name</dt><dd>{source.vendorName}</dd>
          <dt>API Endpoint</dt><dd>{source.apiEndpoint || 'N/A'}</dd>
          <dt>Description</dt><dd>{source.description || 'N/A'}</dd>
          <dt>License Type</dt><dd><span className="class-badge" data-class={source.licenseType?.toLowerCase()}>{source.licenseType}</span></dd>
          <dt>Last Synced</dt><dd>{source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'Never'}</dd>
        </dl>
      </div>
    </div>
  );
}
