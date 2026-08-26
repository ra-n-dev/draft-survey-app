import { newTank } from "../lib/surveyModel.js";
import { interpolate } from "../lib/calculations.js";
import NumberField from "./NumberField.jsx";

// Computes the interpolated volume for a single tank, honoring the legacy
// "plain volume, no sounding table" shape for tanks saved before this
// feature existed.
function tankVolume(t) {
  const isLegacy = t.volume != null && t.soundingD2 == null && t.d1 == null && t.d3 == null;
  if (isLegacy) return t.volume;
  return interpolate(t.d1, t.soundingD2, t.d3, t.vol1, t.vol3);
}

function tankWeight(t) {
  const vol = tankVolume(t);
  return vol != null && t.density != null ? vol * t.density : null;
}

export default function TankEditor({ title, tanks, onChange, decimals, overrideTotal, onOverrideChange }) {
  const addTank = () => onChange([...(tanks || []), newTank(`Tank ${(tanks?.length || 0) + 1}`)]);
  const removeTank = (id) => onChange(tanks.filter((t) => t.id !== id));
  const updateTank = (id, patch) =>
    onChange(tanks.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const numOrNull = (v) => (v === "" || v === undefined ? null : Number(v));

  const computedTotal = (tanks || []).reduce((sum, t) => {
    const w = tankWeight(t);
    return sum + (w || 0);
  }, 0);

  return (
    <div className="tank-editor">
      <div className="tank-editor-head">
        <strong>{title}</strong>
        <button type="button" className="btn-link" onClick={addTank}>
          + Add tank
        </button>
      </div>

      {tanks && tanks.length > 0 ? (
        <div className="tank-block-list">
          {tanks.map((t) => {
            const volume = tankVolume(t);
            const weight = tankWeight(t);
            return (
              <div className="tank-block" key={t.id}>
                <div className="tank-block-head">
                  <input
                    className="tank-name"
                    value={t.name}
                    placeholder="Tank name"
                    onChange={(e) => updateTank(t.id, { name: e.target.value })}
                  />
                  <button type="button" className="btn-icon" onClick={() => removeTank(t.id)} aria-label="Remove tank">
                    ✕
                  </button>
                </div>

                <div className="grid-2">
                  <NumberField
                    label="Sounding / ullage reading (D2)"
                    value={t.soundingD2}
                    onChange={(x) => updateTank(t.id, { soundingD2: x })}
                    decimals={decimals}
                  />
                  <NumberField
                    label="Density"
                    value={t.density}
                    onChange={(x) => updateTank(t.id, { density: x })}
                    decimals={3}
                    allowNegative={false}
                  />
                </div>

                <p className="muted small" style={{ margin: "0.5rem 0 0.3rem" }}>
                  Sounding table — the two bracketing rows either side of the reading above:
                </p>
                <div className="grid-2">
                  <fieldset className="fieldset">
                    <legend>Lower bracket</legend>
                    <NumberField
                      label="Sounding (D1)"
                      value={t.d1}
                      onChange={(x) => updateTank(t.id, { d1: x })}
                      decimals={decimals}
                    />
                    <NumberField
                      label="Volume at D1"
                      value={t.vol1}
                      onChange={(x) => updateTank(t.id, { vol1: x })}
                      decimals={decimals}
                      allowNegative={false}
                    />
                  </fieldset>
                  <fieldset className="fieldset">
                    <legend>Upper bracket</legend>
                    <NumberField
                      label="Sounding (D3)"
                      value={t.d3}
                      onChange={(x) => updateTank(t.id, { d3: x })}
                      decimals={decimals}
                    />
                    <NumberField
                      label="Volume at D3"
                      value={t.vol3}
                      onChange={(x) => updateTank(t.id, { vol3: x })}
                      decimals={decimals}
                      allowNegative={false}
                    />
                  </fieldset>
                </div>

                <div className="tank-result-row">
                  <span>
                    Interpolated volume: <strong>{volume != null ? volume.toFixed(decimals) : "—"}</strong>
                  </span>
                  <span>
                    Weight: <strong>{weight != null ? weight.toFixed(decimals) : "—"} t</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted small">No tanks added yet - add them individually, or enter a known total below.</p>
      )}

      <div className="tank-total-row">
        <span>
          Computed from tanks: <strong>{computedTotal.toFixed(decimals)} t</strong>
        </span>
      </div>

      <NumberField
        label={`Or enter a known ${title.toLowerCase()} total directly (overrides tank sum)`}
        value={overrideTotal}
        onChange={onOverrideChange}
        decimals={decimals}
        suffix="t"
        allowNegative={false}
      />
    </div>
  );
}