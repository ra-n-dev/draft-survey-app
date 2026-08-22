import { newTank } from "../lib/surveyModel.js";
import NumberField from "./NumberField.jsx";

export default function TankEditor({ title, tanks, onChange, decimals, overrideTotal, onOverrideChange }) {
  const addTank = () => onChange([...(tanks || []), newTank(`Tank ${(tanks?.length || 0) + 1}`)]);
  const removeTank = (id) => onChange(tanks.filter((t) => t.id !== id));
  const updateTank = (id, patch) =>
    onChange(tanks.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const computedTotal = (tanks || []).reduce(
    (sum, t) => sum + (Number(t.volume) || 0) * (Number(t.density) || 0),
    0
  );

  return (
    <div className="tank-editor">
      <div className="tank-editor-head">
        <strong>{title}</strong>
        <button type="button" className="btn-link" onClick={addTank}>
          + Add tank
        </button>
      </div>

      {tanks && tanks.length > 0 ? (
        <div className="tank-list">
          {tanks.map((t) => (
            <div className="tank-row" key={t.id}>
              <input
                className="tank-name"
                value={t.name}
                placeholder="Tank name"
                onChange={(e) => updateTank(t.id, { name: e.target.value })}
              />
              <input
                type="number"
                placeholder="Volume (m³)"
                value={t.volume ?? ""}
                onChange={(e) => updateTank(t.id, { volume: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <input
                type="number"
                placeholder="Density"
                step="0.001"
                value={t.density ?? ""}
                onChange={(e) => updateTank(t.id, { density: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <span className="tank-weight">
                {(Number(t.volume) || 0) && (Number(t.density) || 0)
                  ? ((t.volume || 0) * (t.density || 0)).toFixed(decimals)
                  : "—"}{" "}
                t
              </span>
              <button type="button" className="btn-icon" onClick={() => removeTank(t.id)} aria-label="Remove tank">
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">No tanks added yet - add them individually, or enter a known total below.</p>
      )}

      <div className="tank-total-row">
        <span>Computed from tanks: <strong>{computedTotal.toFixed(decimals)} t</strong></span>
      </div>

      <NumberField
        label={`Or enter a known ${title.toLowerCase()} total directly (overrides tank sum)`}
        value={overrideTotal}
        onChange={onOverrideChange}
        decimals={decimals}
        suffix="t"
      />
    </div>
  );
}
