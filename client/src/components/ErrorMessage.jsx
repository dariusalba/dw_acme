export default function ErrorMessage({ message }) {
  return (
    <div className="error-message">
      <p>{message || 'An error occurred'}</p>
    </div>
  );
}
