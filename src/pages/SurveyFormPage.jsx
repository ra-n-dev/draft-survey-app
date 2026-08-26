import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSurveyLocal } from "../lib/localStore.js";
import { computeInitial, computeFinal } from "../lib/calculations.js";
import Section from "../components/Section.jsx";
import NumberField from "../components/NumberField.jsx";
import ResultRow from "../components/ResultRow.jsx";
import MissingFieldsBanner from "../components/MissingFieldsBanner.jsx";
import TankEditor from "../components/TankEditor.jsx";

export default function SurveyFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { surveys, upsertSurvey, settings, updateVesselProfile } = useSurveys();
  const { user } = useAuth();
  const [survey, setSurvey] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const dp = settings.decimals ?? 3;
  const isWizard = (settings.formMode ?? "wizard") === "wizard";

  // Load the survey ONCE when navigating to this id. We deliberately do NOT
  // depend on `surveys` here: that array's reference changes every time any
  // autosave completes (including this survey's own save), and re-running
  // this effect would overwrite whatever the person has typed since that
  // save was kicked off — a race that could silently revert a field
  // mid-keystroke. The local `survey` state below is the single source of
  // truth while this page is open; saves flow OUT to storage/cloud, never
  // back IN, until you navigate to a different survey.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = surveys.find((s) => s.id === id) || (await getSurveyLocal(user?.uid, id));
      if (!cancelled) setSurvey(found);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Always land on step 1 when opening a (different) survey.
  useEffect(() => {
    setStepIndex(0);
  }, [id]);

  const patch = useCallback((path, value) => {
    setSurvey((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  // Debounced autosave to local storage (+ background cloud push)
  useEffect(() => {
    if (!survey) return;
    const t = setTimeout(() => upsertSurvey(survey), 400);
    return () => clearTimeout(t);
  }, [survey]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedInitial = useMemo(
    () => (survey?.linkedInitialId ? surveys.find((s) => s.id === survey.linkedInitialId) : null),
    [survey, surveys]
  );

  const result = useMemo(() => {
    if (!survey) return null;
    if (survey.type === "initial") {
      return computeInitial(survey, survey.lightship, dp);
    }
    const initialNet = linkedInitial?.__netDisplacementCache ?? linkedInitial?.netDisplacementSnapshot;
    return computeFinal(survey, survey.lightship, survey.constant, initialNet, dp);
  }, [survey, dp, linkedInitial]);

  if (!survey) return <div className="page">Loading…</div>;
  const v = result.values;
  const missing = result.missing;

  const missingIn = (prefixes) => missing.filter((m) => prefixes.some((p) => m.path.startsWith(p)));

  const markComplete = async () => {
    const updated = {
      ...survey,
      status: "complete",
      netDisplacementSnapshot: v.netDisplacement,
    };
    await upsertSurvey(updated);
    await updateVesselProfile({
      vesselName: survey.vesselName,
      lbm: survey.vessel.lbm,
      lbp: survey.vessel.lbp,
      dFwd: survey.vessel.dFwd,
      dAft: survey.vessel.dAft,
      dMid: survey.vessel.dMid,
      lightship: survey.lightship,
    });
    nav(`/report/${survey.id}`);
  };

  // ---------------------------------------------------------------------
  // Each "step" below doubles as: (a) one page of the step-by-step wizard,
  // and (b) one collapsible section in the all-in-one "unfolded" view. The
  // content is defined once and rendered either way depending on the
  // Dashboard's view-mode toggle.
  // ---------------------------------------------------------------------
  const steps = [
    {
      key: "identity",
      title: "Vessel, Voyage & Personnel",
      subtitle: "General identification and report signatories",
      missing: [],
      content: (
        <>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Vessel name</span>
              <input value={survey.vesselName} onChange={(e) => patch("vesselName", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Voyage No.</span>
              <input value={survey.voyageNo} onChange={(e) => patch("voyageNo", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Port</span>
              <input value={survey.port} onChange={(e) => patch("port", e.target.value)} />
            </label>
          </div>

          {survey.type === "final" && (
            <div className="linked-initial-note">
              {linkedInitial ? (
                <p>
                  Linked to Initial Survey: <strong>{linkedInitial.vesselName || "Unnamed"}</strong> (
                  {new Date(linkedInitial.updatedAt).toLocaleDateString()})
                </p>
              ) : (
                <p className="muted">
                  No Initial Survey linked. Enter Light Ship and Constant manually in the last step, or
                  complete an Initial Survey first.
                </p>
              )}
            </div>
          )}

          <h3 className="step-subheading">Client & Personnel</h3>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Client / Company being surveyed for</span>
              <input value={survey.clientCompany || ""} onChange={(e) => patch("clientCompany", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Client contact (email or phone)</span>
              <input value={survey.clientContact || ""} onChange={(e) => patch("clientContact", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Chief Officer name</span>
              <input value={survey.chiefOfficerName || ""} onChange={(e) => patch("chiefOfficerName", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Surveyor name</span>
              <input value={survey.surveyorName || ""} onChange={(e) => patch("surveyorName", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Surveyor contact</span>
              <input value={survey.surveyorContact || ""} onChange={(e) => patch("surveyorContact", e.target.value)} />
            </label>
          </div>
          <p className="muted small">
            Surveyor name/contact default from your Settings profile but can be changed for this
            survey specifically.
          </p>
        </>
      ),
    },
    {
      key: "drafts",
      title: "1. Draft Readings",
      subtitle: "Forward, Midship, Aft — Port & Starboard",
      missing: missingIn(["drafts."]),
      content: (
        <>
          <div className="grid-2">
            <NumberField label="Fwd Draft — Port" decimals={dp} value={survey.drafts.fwdPort} onChange={(x) => patch("drafts.fwdPort", x)} required />
            <NumberField label="Fwd Draft — Stbd" decimals={dp} value={survey.drafts.fwdStbd} onChange={(x) => patch("drafts.fwdStbd", x)} required />
            <NumberField label="Midship Draft — Port" decimals={dp} value={survey.drafts.midPort} onChange={(x) => patch("drafts.midPort", x)} required />
            <NumberField label="Midship Draft — Stbd" decimals={dp} value={survey.drafts.midStbd} onChange={(x) => patch("drafts.midStbd", x)} required />
            <NumberField label="Aft Draft — Port" decimals={dp} value={survey.drafts.aftPort} onChange={(x) => patch("drafts.aftPort", x)} required />
            <NumberField label="Aft Draft — Stbd" decimals={dp} value={survey.drafts.aftStbd} onChange={(x) => patch("drafts.aftStbd", x)} required />
          </div>
          <div className="results-block">
            <ResultRow label="Fwd Mean Draft" value={v.fwdMean} decimals={dp} />
            <ResultRow label="Midship Mean Draft" value={v.midMean} decimals={dp} />
            <ResultRow label="Aft Mean Draft" value={v.aftMean} decimals={dp} />
          </div>
        </>
      ),
    },
    {
      key: "geometry",
      title: "2. Vessel Geometry",
      subtitle: "Used for perpendicular corrections & moment calcs",
      missing: missingIn(["vessel."]),
      content: (
        <>
          <div className="grid-2">
            <NumberField label="Length Between Marks (LBM)" decimals={dp} value={survey.vessel.lbm} onChange={(x) => patch("vessel.lbm", x)} suffix="m" required />
            <NumberField label="Length Between Perpendiculars (LBP)" decimals={dp} value={survey.vessel.lbp} onChange={(x) => patch("vessel.lbp", x)} suffix="m" required />
            <NumberField
              label="Distance: Fwd perpendicular → Fwd mark"
              decimals={dp}
              value={survey.vessel.dFwd}
              onChange={(x) => patch("vessel.dFwd", x)}
              suffix="m"
              required
              hint="Use a negative value if the mark is aft of the perpendicular"
            />
            <NumberField
              label="Distance: Aft mark → Aft perpendicular"
              decimals={dp}
              value={survey.vessel.dAft}
              onChange={(x) => patch("vessel.dAft", x)}
              suffix="m"
              required
            />
            <NumberField
              label="Distance: Midship mark → Midship perpendicular"
              decimals={dp}
              value={survey.vessel.dMid}
              onChange={(x) => patch("vessel.dMid", x)}
              suffix="m"
              hint="Usually 0"
            />
          </div>
          <div className="results-block">
            <ResultRow label="Apparent Trim" value={v.apparentTrim} decimals={dp} />
            <ResultRow label="Fwd Correction" value={v.fwdCorr} decimals={dp} />
            <ResultRow label="Aft Correction" value={v.aftCorr} decimals={dp} />
            <ResultRow label="True Fwd Draft" value={v.trueFwd} decimals={dp} highlight />
            <ResultRow label="True Midship Draft" value={v.trueMid} decimals={dp} highlight />
            <ResultRow label="True Aft Draft" value={v.trueAft} decimals={dp} highlight />
            <ResultRow label="True Trim" value={v.trueTrim} decimals={dp} highlight />
            <ResultRow label="Quarter Mean (QM2 — calculated)" value={v.qm2} decimals={dp} highlight />
          </div>
        </>
      ),
    },
    {
      key: "hydrostatic",
      title: "3. Hydrostatic Table — Displacement / TPC / LCF",
      subtitle: "Enter the two bracketing rows from the ship's hydrostatic table (QM1 = lower, QM3 = upper)",
      missing: missingIn(["hydrostatic.qm1.", "hydrostatic.qm3."]),
      content: (
        <>
          <div className="grid-2">
            <fieldset className="fieldset">
              <legend>QM1 (lower bracket, from table)</legend>
              <NumberField label="Quarter Mean" decimals={dp} value={survey.hydrostatic.qm1.qm} onChange={(x) => patch("hydrostatic.qm1.qm", x)} required />
              <NumberField label="Displacement" decimals={dp} value={survey.hydrostatic.qm1.disp} onChange={(x) => patch("hydrostatic.qm1.disp", x)} suffix="t" required />
              <NumberField label="TPC" decimals={dp} value={survey.hydrostatic.qm1.tpc} onChange={(x) => patch("hydrostatic.qm1.tpc", x)} required />
              <NumberField label="LCF" decimals={dp} value={survey.hydrostatic.qm1.lcf} onChange={(x) => patch("hydrostatic.qm1.lcf", x)} suffix="m" required />
            </fieldset>
            <fieldset className="fieldset">
              <legend>QM3 (upper bracket, from table)</legend>
              <NumberField label="Quarter Mean" decimals={dp} value={survey.hydrostatic.qm3.qm} onChange={(x) => patch("hydrostatic.qm3.qm", x)} required />
              <NumberField label="Displacement" decimals={dp} value={survey.hydrostatic.qm3.disp} onChange={(x) => patch("hydrostatic.qm3.disp", x)} suffix="t" required />
              <NumberField label="TPC" decimals={dp} value={survey.hydrostatic.qm3.tpc} onChange={(x) => patch("hydrostatic.qm3.tpc", x)} required />
              <NumberField label="LCF" decimals={dp} value={survey.hydrostatic.qm3.lcf} onChange={(x) => patch("hydrostatic.qm3.lcf", x)} suffix="m" required />
            </fieldset>
          </div>
          <div className="results-block">
            <ResultRow label="QM2 Displacement (interpolated)" value={v.qm2Disp} decimals={dp} unit="t" highlight />
            <ResultRow label="QM2 TPC (interpolated)" value={v.qm2Tpc} decimals={dp} unit="" highlight />
            <ResultRow label="QM2 LCF (interpolated)" value={v.qm2Lcf} decimals={dp} highlight />
          </div>
        </>
      ),
    },
    {
      key: "mtc",
      title: "4. MTC (Moment to Change Trim)",
      subtitle: "Table is read at QM2 ± 0.5 — enter the bracketing rows for each",
      missing: missingIn(["hydrostatic.mtcPlus.", "hydrostatic.mtcMinus."]),
      content: (
        <>
          <div className="grid-2">
            <fieldset className="fieldset">
              <legend>MTC⁺ bracket (lookup at QM2 + 0.5 = {v.mtcPlusQm ?? "—"})</legend>
              <NumberField label="QM1 (lower)" decimals={dp} value={survey.hydrostatic.mtcPlus.qm1.qm} onChange={(x) => patch("hydrostatic.mtcPlus.qm1.qm", x)} required />
              <NumberField label="MTC value at QM1" decimals={dp} value={survey.hydrostatic.mtcPlus.qm1.mtc} onChange={(x) => patch("hydrostatic.mtcPlus.qm1.mtc", x)} required />
              <NumberField label="QM3 (upper)" decimals={dp} value={survey.hydrostatic.mtcPlus.qm3.qm} onChange={(x) => patch("hydrostatic.mtcPlus.qm3.qm", x)} required />
              <NumberField label="MTC value at QM3" decimals={dp} value={survey.hydrostatic.mtcPlus.qm3.mtc} onChange={(x) => patch("hydrostatic.mtcPlus.qm3.mtc", x)} required />
            </fieldset>
            <fieldset className="fieldset">
              <legend>MTC⁻ bracket (lookup at QM2 − 0.5 = {v.mtcMinusQm ?? "—"})</legend>
              <NumberField label="QM1 (lower)" decimals={dp} value={survey.hydrostatic.mtcMinus.qm1.qm} onChange={(x) => patch("hydrostatic.mtcMinus.qm1.qm", x)} required />
              <NumberField label="MTC value at QM1" decimals={dp} value={survey.hydrostatic.mtcMinus.qm1.mtc} onChange={(x) => patch("hydrostatic.mtcMinus.qm1.mtc", x)} required />
              <NumberField label="QM3 (upper)" decimals={dp} value={survey.hydrostatic.mtcMinus.qm3.qm} onChange={(x) => patch("hydrostatic.mtcMinus.qm3.qm", x)} required />
              <NumberField label="MTC value at QM3" decimals={dp} value={survey.hydrostatic.mtcMinus.qm3.mtc} onChange={(x) => patch("hydrostatic.mtcMinus.qm3.mtc", x)} required />
            </fieldset>
          </div>
          <div className="results-block">
            <ResultRow label="QM2 MTC⁺" value={v.qm2MtcPlus} decimals={dp} highlight />
            <ResultRow label="QM2 MTC⁻" value={v.qm2MtcMinus} decimals={dp} highlight />
            <ResultRow label="QM2 MTC (⁺ − ⁻)" value={v.qm2Mtc} decimals={dp} highlight />
          </div>
        </>
      ),
    },
    {
      key: "trim-displacement",
      title: "5. Trim Corrections & Displacement",
      subtitle: "Calculated automatically",
      missing: [],
      content: (
        <div className="results-block">
          <ResultRow label="1st Trim Correction" value={v.firstTrimCorr} decimals={dp} unit="t" />
          <ResultRow label="2nd Trim Correction" value={v.secondTrimCorr} decimals={dp} unit="t" />
          <ResultRow label="Sum of Trim Corrections" value={v.sumTrimCorr} decimals={dp} unit="t" />
          <ResultRow label="Displacement (Trim)" value={v.displTrim} decimals={dp} unit="t" highlight />
        </div>
      ),
    },
    {
      key: "density",
      title: "6. Dock Water Density",
      subtitle: "Standard density is 1.025 unless changed in Settings",
      missing: missingIn(["density."]),
      content: (
        <>
          <div className="grid-2">
            <NumberField label="Measured dock water density" decimals={3} value={survey.density.dockwater} onChange={(x) => patch("density.dockwater", x)} required />
            <NumberField label="Standard density" decimals={3} value={survey.density.standard} onChange={(x) => patch("density.standard", x)} />
          </div>
          <div className="results-block">
            <ResultRow label="Density Correction" value={v.densityCorr} decimals={dp} unit="t" />
            <ResultRow label="Displacement (Density)" value={v.displDensity} decimals={dp} unit="t" highlight />
          </div>
        </>
      ),
    },
    {
      key: "deductibles",
      title: "7. Deductibles / Consumables",
      subtitle: "Ballast, fresh water, bunkers — sum automatically or enter totals directly",
      missing: missingIn(["deductibles."]),
      content: (
        <>
          <TankEditor
            title="Ballast Tanks"
            tanks={survey.deductibles.ballastTanks}
            onChange={(t) => patch("deductibles.ballastTanks", t)}
            decimals={dp}
            overrideTotal={survey.deductibles.ballastTotal}
            onOverrideChange={(x) => patch("deductibles.ballastTotal", x)}
          />
          <TankEditor
            title="Fresh Water Tanks"
            tanks={survey.deductibles.freshWaterTanks}
            onChange={(t) => patch("deductibles.freshWaterTanks", t)}
            decimals={dp}
            overrideTotal={survey.deductibles.freshWaterTotal}
            onOverrideChange={(x) => patch("deductibles.freshWaterTotal", x)}
          />
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <NumberField label="HFO / VLSFO (bunker fuel)" decimals={dp} value={survey.deductibles.fuel.hfo} onChange={(x) => patch("deductibles.fuel.hfo", x)} suffix="t" />
            <NumberField label="Diesel / MGO" decimals={dp} value={survey.deductibles.fuel.diesel} onChange={(x) => patch("deductibles.fuel.diesel", x)} suffix="t" />
            <NumberField label="Lubricating Oil" decimals={dp} value={survey.deductibles.fuel.lube} onChange={(x) => patch("deductibles.fuel.lube", x)} suffix="t" />
            <NumberField label="Other liquids / stores" decimals={dp} value={survey.deductibles.fuel.others} onChange={(x) => patch("deductibles.fuel.others", x)} suffix="t" />
            <NumberField
              label="Or enter total bunkers directly (overrides above)"
              decimals={dp}
              value={survey.deductibles.fuel.totalOverride}
              onChange={(x) => patch("deductibles.fuel.totalOverride", x)}
              suffix="t"
            />
          </div>
          <div className="results-block">
            <ResultRow label="Ballast total" value={v.deductibles?.ballast} decimals={dp} unit="t" />
            <ResultRow label="Fresh water total" value={v.deductibles?.freshWater} decimals={dp} unit="t" />
            <ResultRow label="Bunker total" value={v.deductibles?.bunker} decimals={dp} unit="t" />
            <ResultRow label="Total Deductibles" value={v.totalDeductibles} decimals={dp} unit="t" highlight />
            <ResultRow label="Net Displacement" value={v.netDisplacement} decimals={dp} unit="t" highlight />
          </div>
        </>
      ),
    },
    survey.type === "initial"
      ? {
          key: "result",
          title: "8. Light Ship & Constant",
          subtitle: null,
          missing: missingIn(["lightship", "constant"]),
          content: (
            <>
              <NumberField label="Light Ship weight" decimals={dp} value={survey.lightship} onChange={(x) => patch("lightship", x)} suffix="t" required />
              <div className="results-block">
                <ResultRow label="Constant (Net Disp − Light Ship)" value={v.constant} decimals={dp} unit="t" highlight />
              </div>
            </>
          ),
        }
      : {
          key: "result",
          title: "8. Cargo Result",
          subtitle: null,
          missing: missingIn(["lightship", "constant"]),
          content: (
            <>
              <div className="grid-2">
                <NumberField label="Light Ship (from Initial survey)" decimals={dp} value={survey.lightship} onChange={(x) => patch("lightship", x)} suffix="t" required />
                <NumberField label="Constant (from Initial survey)" decimals={dp} value={survey.constant} onChange={(x) => patch("constant", x)} suffix="t" required />
              </div>
              <div className="results-block">
                <ResultRow label="Cargo + Constant" value={v.cargoPlusConstant} decimals={dp} unit="t" />
                <ResultRow label="Cargo on Board" value={v.cargoOnBoard} decimals={dp} unit="t" highlight />
                <ResultRow label="Cargo Loaded (vs. Initial)" value={v.cargoLoaded} decimals={dp} unit="t" highlight />
              </div>
            </>
          ),
        },
  ];

  const totalSteps = steps.length;
  const safeIndex = Math.min(stepIndex, totalSteps - 1);
  const current = steps[safeIndex];
  const isLastStep = safeIndex === totalSteps - 1;
  const goNext = () => setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <Link to="/" className="back-link">
              ← Dashboard
            </Link>
            <h1>
              {survey.type === "initial" ? "Initial Survey" : "Final Survey"}
              {survey.status === "complete" && <span className="badge badge-complete">Complete</span>}
            </h1>
          </div>
        </div>
      </header>

      {isWizard ? (
        <>
          <div className="wizard-progress">
            <span>
              Step {safeIndex + 1} of {totalSteps}
            </span>
            <div className="wizard-progress-track">
              <div
                className="wizard-progress-fill"
                style={{ width: `${((safeIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {current.missing.length > 0 ? (
            <div className="banner banner-warning">
              <div className="banner-title">
                {current.missing.length} figure{current.missing.length > 1 ? "s" : ""} still needed in this
                section:
              </div>
              <ul>
                {current.missing.map((m) => (
                  <li key={m.path}>{m.label}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="banner banner-success">✓ This section is complete.</div>
          )}

          <div className="section wizard-step">
            <div className="wizard-step-header">
              <div className="section-title">{current.title}</div>
              {current.subtitle && <div className="section-subtitle">{current.subtitle}</div>}
            </div>
            <div className="section-body">{current.content}</div>
          </div>

          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={goBack} disabled={safeIndex === 0}>
              ← Back
            </button>
            {isLastStep ? (
              <button className="btn btn-primary" onClick={markComplete} disabled={missing.length > 0}>
                {missing.length > 0 ? `Complete ${missing.length} more field(s)` : "Mark Complete & View Report"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={goNext}>
                Next →
              </button>
            )}
          </div>

          {isLastStep && missing.length > 0 && (
            <>
              <h3 className="step-subheading">Everything still needed across the whole survey</h3>
              <MissingFieldsBanner missing={missing} />
            </>
          )}

          <p className="muted small wizard-footer-note">
            Your entries are saved automatically on this device as you type. Prefer everything on one
            page? Toggle "All-in-one view" from the Dashboard.
          </p>
        </>
      ) : (
        <>
          <MissingFieldsBanner missing={missing} />

          {steps.map((s) => (
            <Section key={s.key} title={s.title} subtitle={s.subtitle}>
              {s.content}
            </Section>
          ))}

          <div className="form-footer">
            <button className="btn btn-primary btn-lg" onClick={markComplete} disabled={missing.length > 0}>
              {missing.length > 0 ? `Complete ${missing.length} more field(s)` : "Mark Complete & View Report"}
            </button>
            <p className="muted small">Your entries are saved automatically on this device as you type.</p>
          </div>
        </>
      )}
    </div>
  );
}