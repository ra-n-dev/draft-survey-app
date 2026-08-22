export default function MissingFieldsBanner({ missing }) {
  if (!missing || missing.length === 0) {
    return (
      <div className="banner banner-success">
        ✓ All required figures are entered. Calculations below are complete.
      </div>
    );
  }
  return (
    <div className="banner banner-warning">
      <div className="banner-title">
        {missing.length} figure{missing.length > 1 ? "s" : ""} still needed to complete this calculation:
      </div>
      <ul>
        {missing.map((m) => (
          <li key={m.path}>{m.label}</li>
        ))}
      </ul>
    </div>
  );
}
