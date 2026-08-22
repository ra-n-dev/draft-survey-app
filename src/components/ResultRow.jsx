export default function ResultRow({ label, value, unit = "m", decimals = 3, highlight }) {
  const display = value === null || value === undefined ? "—" : Number(value).toFixed(decimals);
  return (
    <div className={`result-row ${highlight ? "highlight" : ""}`}>
      <span className="result-label">{label}</span>
      <span className="result-value">
        {display} <span className="result-unit">{value !== null ? unit : ""}</span>
      </span>
    </div>
  );
}
