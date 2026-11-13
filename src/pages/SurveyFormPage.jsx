import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSurveyLocal } from "../lib/localStore.js";
import { computeInitial, computeFinal, round } from "../lib/calculations.js";
import { newCargoHold } from "../lib/surveyModel.js";
import Section from "../components/Section.jsx";
import NumberField from "../components/NumberField.jsx";
import ResultRow from "../components/ResultRow.jsx";
import MissingFieldsBanner from "../components/MissingFieldsBanner.jsx";
import TankEditor from "../components/TankEditor.jsx";
import DraftPhotoCapture from "../components/DraftPhotoCapture.jsx";

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

  // Freeze the survey date the first time a survey is opened. `updatedAt`
  // changes on every save, so the report can't use it as the survey date
  // without it drifting forward each time something is edited. `surveyDate`
  // is set once here and then only changes if the surveyor edits it
  // themselves in the first step.
  useEffect(() => {
    if (survey && !survey.surveyDate) {
      setSurvey((prev) =>
        prev && !prev.surveyDate
          ? { ...prev, surveyDate: prev.createdAt ?? prev.updatedAt ?? Date.now() }
          : prev
      );
    }
  }, [survey]);

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
    // The vessel's actual CONDITION for this survey decides which
    // calculation runs - not which survey (first/second) it happens to
    // be. In the common loading scenario the two line up (initial=empty,
    // final=loaded); in a discharging scenario they're reversed (the
    // first survey done is loaded, the second is empty).
    const condition = survey.condition ?? (survey.type === "initial" ? "empty" : "loaded");
    if (condition === "empty") {
      return computeInitial(survey, survey.lightship, dp);
    }
    const initialNet = linkedInitial?.netDisplacementSnapshot;
    return computeFinal(survey, survey.lightship, survey.constant, initialNet, dp);
  }, [survey, dp, linkedInitial]);

  if (!survey) return <div className="page">Loading…</div>;
  const v = result.values;
  const missing = result.missing;
  const condition = survey.condition ?? (survey.type === "initial" ? "empty" : "loaded");
  // Which direction is this voyage going? Determined by whichever survey
  // was done FIRST (type === "initial"), regardless of which one we're
  // looking at right now - a Final survey looks at its own linkedInitial
  // to find out.
  const firstSurveyCondition = survey.type === "initial" ? condition : linkedInitial?.condition ?? "empty";
  const isDischarging = firstSurveyCondition === "loaded";

  const missingIn = (prefixes) => missing.filter((m) => prefixes.some((p) => m.path.startsWith(p)));

  const markComplete = async () => {
    const updated = {
      ...survey,
      status: "complete",
      netDisplacementSnapshot: v.netDisplacement,
    };
    // Save the RESOLVED Constant (manual entry if provided, otherwise the
    // calculated figure) so a linked "loaded"-condition survey always
    // inherits the correct number regardless of which path produced it -
    // see DashboardPage.startNew, which reads constantSnapshot in
    // preference to the raw (override-only) `constant` field. Only an
    // "empty"-condition survey produces an authoritative Constant this way.
    if (condition === "empty") {
      updated.constantSnapshot = v.constant;
    }
    await upsertSurvey(updated);
    await updateVesselProfile({
      vesselName: survey.vesselName,
      lbm: survey.vessel.lbm,
      lbp: survey.vessel.lbp,
      dFwd: survey.vessel.dFwd,
      dAft: survey.vessel.dAft,
      dMid: survey.vessel.dMid,
      imoNumber: survey.vessel.imoNumber,
      callSign: survey.vessel.callSign,
      flag: survey.vessel.flag,
      grt: survey.vessel.grt,
      nrt: survey.vessel.nrt,
      dwt: survey.vessel.dwt,
      lightship: survey.lightship,
      // Remembered per vessel: the hydrostatic table's LCF reference is a
      // fixed property of the ship's table, so new surveys start with it.
      lcfReference: survey.hydrostatic?.lcfReference || "midships",
      draftBasis: survey.hydrostatic?.draftBasis || "extreme",
      keelThickness: survey.hydrostatic?.keelThickness ?? null,
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
            <label className="field">
              <span className="field-label">Commodity</span>
              <input
                value={survey.commodity || ""}
                onChange={(e) => patch("commodity", e.target.value)}
                placeholder="e.g. Bagged Cement"
              />
            </label>
            <label className="field">
              <span className="field-label">Survey date</span>
              <input
                type="date"
                value={survey.surveyDate ? new Date(survey.surveyDate).toISOString().slice(0, 10) : ""}
                onChange={(e) =>
                  patch("surveyDate", e.target.value ? new Date(`${e.target.value}T12:00:00`).getTime() : null)
                }
              />
            </label>
            <label className="field">
              <span className="field-label">This survey's start time</span>
              <input type="time" value={survey.startTime || ""} onChange={(e) => patch("startTime", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">This survey's end time</span>
              <input type="time" value={survey.endTime || ""} onChange={(e) => patch("endTime", e.target.value)} />
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

          <h3 className="step-subheading">Vessel Condition</h3>
          <p className="muted small" style={{ marginTop: "-0.4rem" }}>
            Loading (arrive empty, depart loaded): Initial = Empty, Final = Loaded — the usual case.
            Discharging (arrive loaded, depart empty): Initial = Loaded, Final = Empty. This decides which
            calculation runs, regardless of which survey this happens to be.
          </p>
          <div className="condition-toggle">
            <button
              type="button"
              className={`condition-btn ${condition === "empty" ? "active" : ""}`}
              onClick={() => patch("condition", "empty")}
            >
              Empty (light / ballast)
            </button>
            <button
              type="button"
              className={`condition-btn ${condition === "loaded" ? "active" : ""}`}
              onClick={() => patch("condition", "loaded")}
            >
              Loaded (with cargo)
            </button>
          </div>

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
          <label className="field" style={{ marginTop: "0.6rem" }}>
            <span className="field-label">Client / receiving company logo (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => patch("clientLogoDataUrl", reader.result);
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {survey.clientLogoDataUrl && (
            <img src={survey.clientLogoDataUrl} alt="Client logo" style={{ height: 48, marginTop: "0.4rem" }} />
          )}
          <p className="muted small">
            Surveyor name/contact default from your Settings profile but can be changed for this
            survey specifically.
          </p>

          <h3 className="step-subheading">Certificate Particulars</h3>
          <p className="muted small" style={{ marginTop: "-0.4rem" }}>
            From the vessel's Certificate of Registry / Tonnage Certificate — fixed ship details,
            not calculated. Entered once and carried forward automatically.
          </p>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">IMO Number</span>
              <input value={survey.vessel.imoNumber || ""} onChange={(e) => patch("vessel.imoNumber", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Call Sign</span>
              <input value={survey.vessel.callSign || ""} onChange={(e) => patch("vessel.callSign", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Flag</span>
              <input value={survey.vessel.flag || ""} onChange={(e) => patch("vessel.flag", e.target.value)} />
            </label>
            <NumberField label="GRT" decimals={0} value={survey.vessel.grt} onChange={(x) => patch("vessel.grt", x)} allowNegative={false} />
            <NumberField label="NRT" decimals={0} value={survey.vessel.nrt} onChange={(x) => patch("vessel.nrt", x)} allowNegative={false} />
            <NumberField label="DWT" decimals={0} value={survey.vessel.dwt} onChange={(x) => patch("vessel.dwt", x)} suffix="t" allowNegative={false} />
          </div>
        </>
      ),
    },
    {
      key: "drafts",
      title: "1. Draft Readings",
      subtitle: "Forward, Midship, Aft — Port & Starboard",
      missing: missingIn(["drafts.", "hydrostatic.keelThickness"]),
      content: (
        <>
          <p className="muted small">Conditions at the time of reading — your own observation, affects reading accuracy.</p>
          <div className="grid-2" style={{ marginBottom: "1rem" }}>
            <label className="field">
              <span className="field-label">Sea state</span>
              <input value={survey.seaState || ""} onChange={(e) => patch("seaState", e.target.value)} placeholder="e.g. Calm / Slight" />
            </label>
            <label className="field">
              <span className="field-label">Wind</span>
              <input value={survey.windState || ""} onChange={(e) => patch("windState", e.target.value)} placeholder="e.g. Lt. Airs" />
            </label>
            <NumberField label="Temperature (°C)" decimals={0} value={survey.temperature} onChange={(x) => patch("temperature", x)} />
            <label className="field">
              <span className="field-label">Reading accuracy</span>
              <input value={survey.readingAccuracy || ""} onChange={(e) => patch("readingAccuracy", e.target.value)} placeholder="e.g. +/- 1cm" />
            </label>
          </div>
          <div className="grid-2">
            <div>
              <NumberField label="Fwd Draft — Port" decimals={dp} value={survey.drafts.fwdPort} onChange={(x) => patch("drafts.fwdPort", x)} required />
              <DraftPhotoCapture label="Fwd Port" onAccept={(x) => patch("drafts.fwdPort", x)} />
            </div>
            <div>
              <NumberField label="Fwd Draft — Stbd" decimals={dp} value={survey.drafts.fwdStbd} onChange={(x) => patch("drafts.fwdStbd", x)} required />
              <DraftPhotoCapture label="Fwd Stbd" onAccept={(x) => patch("drafts.fwdStbd", x)} />
            </div>
            <div>
              <NumberField label="Midship Draft — Port" decimals={dp} value={survey.drafts.midPort} onChange={(x) => patch("drafts.midPort", x)} required />
              <DraftPhotoCapture label="Midship Port" onAccept={(x) => patch("drafts.midPort", x)} />
            </div>
            <div>
              <NumberField label="Midship Draft — Stbd" decimals={dp} value={survey.drafts.midStbd} onChange={(x) => patch("drafts.midStbd", x)} required />
              <DraftPhotoCapture label="Midship Stbd" onAccept={(x) => patch("drafts.midStbd", x)} />
            </div>
            <div>
              <NumberField label="Aft Draft — Port" decimals={dp} value={survey.drafts.aftPort} onChange={(x) => patch("drafts.aftPort", x)} required />
              <DraftPhotoCapture label="Aft Port" onAccept={(x) => patch("drafts.aftPort", x)} />
            </div>
            <div>
              <NumberField label="Aft Draft — Stbd" decimals={dp} value={survey.drafts.aftStbd} onChange={(x) => patch("drafts.aftStbd", x)} required />
              <DraftPhotoCapture label="Aft Stbd" onAccept={(x) => patch("drafts.aftStbd", x)} />
            </div>
          </div>
          <div className="results-block">
            <ResultRow label="Fwd Mean Draft" value={v.fwdMean} decimals={dp} />
            <ResultRow label="Midship Mean Draft" value={v.midMean} decimals={dp} />
            <ResultRow label="Aft Mean Draft" value={v.aftMean} decimals={dp} />
          </div>

          <h3 className="step-subheading">Keel Plate (optional)</h3>
          <p className="muted small" style={{ marginTop: "-0.4rem" }}>
            Draft marks show the extreme draft, to the bottom of the keel plate. If you enter the hydrostatic
            table by the moulded draft (column T), the keel thickness is taken off the quarter mean behind the
            scenes. Your readings above are never changed.
          </p>
          <div className="grid-2">
            <NumberField
              label="Keel plate thickness"
              decimals={dp}
              value={survey.hydrostatic.keelThickness}
              onChange={(x) => patch("hydrostatic.keelThickness", x)}
              suffix="m"
              allowNegative={false}
              required={(survey.hydrostatic.draftBasis || "extreme") === "moulded"}
              hint="In metres: 25 mm = 0.025. Read it off the table: TK minus T."
            />
            <label className="field">
              <span className="field-label">I will enter the hydrostatic table by</span>
              <select
                value={survey.hydrostatic.draftBasis || "extreme"}
                onChange={(e) => patch("hydrostatic.draftBasis", e.target.value)}
              >
                <option value="extreme">TK: extreme draft as read (no keel subtraction)</option>
                <option value="moulded">T: moulded draft (subtract keel thickness)</option>
              </select>
            </label>
          </div>
          {(survey.hydrostatic.draftBasis || "extreme") === "moulded" && v.keelCorr > 0 && (
            <div className="results-block">
              <ResultRow label="Quarter Mean as read (QM2)" value={v.qm2} decimals={dp} unit="m" />
              <ResultRow label="Keel deducted" value={v.keelCorr} decimals={dp} unit="m" />
              <ResultRow label="QM2 to enter the table (T column)" value={v.qm2Table} decimals={dp} unit="m" highlight />
            </div>
          )}
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
            <ResultRow
              label={v.keelCorr > 0 ? "Quarter Mean (QM2 — as read)" : "Quarter Mean (QM2 — calculated)"}
              value={v.qm2}
              decimals={dp}
              highlight
            />
            {v.keelCorr > 0 && (
              <>
                <ResultRow label="Keel plate thickness deducted" value={v.keelCorr} decimals={dp} unit="m" />
                <ResultRow label="QM2 to enter the hydrostatic table (T column)" value={v.qm2Table} decimals={dp} unit="m" highlight />
              </>
            )}
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
          <div
            style={{
              background: "#f1f7f8",
              border: "1px solid #cfe3e6",
              borderLeft: "4px solid #1f7a8c",
              borderRadius: 8,
              padding: "0.85rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.86rem",
              lineHeight: 1.5,
              color: "#1e3a4c",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.5rem", color: "#14304f" }}>
              Which table column do I read?
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.6rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#14304f" }}>
                  <th style={{ padding: "4px 8px 4px 0", borderBottom: "1px solid #cfe3e6" }}>Draft you enter the table with</th>
                  <th style={{ padding: "4px 8px", borderBottom: "1px solid #cfe3e6" }}>Column</th>
                  <th style={{ padding: "4px 0 4px 8px", borderBottom: "1px solid #cfe3e6" }}>Keel plate</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 8px 5px 0" }}>As read from the hull marks (extreme draft)</td>
                  <td style={{ padding: "5px 8px" }}><strong>TK</strong> (m)</td>
                  <td style={{ padding: "5px 0 5px 8px" }}>Not subtracted</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 8px 5px 0" }}>Moulded draft (keel thickness taken off)</td>
                  <td style={{ padding: "5px 8px" }}><strong>T</strong> (m)</td>
                  <td style={{ padding: "5px 0 5px 8px" }}>Subtracted</td>
                </tr>
              </tbody>
            </table>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>
                <strong>TK = T + keel plate thickness.</strong> Read the thickness off your table: in each row
                subtract T from TK (for example 12.625 − 12.600 = 0.025 m).
              </li>
              <li>
                Both routes reach the <strong>same row</strong> and the same displacement. Take Displacement,
                TPC and LCF from the row you matched, in the same table.
              </li>
              <li>
                Never mix them. Entering an extreme draft in the <strong>T</strong> column overstates the
                displacement by about TPC × 100 × keel thickness (roughly 160 t on a 25 mm keel at TPC 65).
              </li>
              <li>
                If the table has both <strong>DISP</strong> and <strong>DISPM</strong> columns, DISPM is the moulded
                displacement and normally pairs with the moulded draft (T), while DISP pairs with the extreme
                draft (TK). Check the table's notes if unsure.
              </li>
              <li>
                Your raw draft readings are never changed. The keel is deducted only from the quarter mean used
                for the table lookups, including the MTC ±0.5 lookups. Trim and the perpendicular corrections are
                not affected.
              </li>
            </ul>
          </div>

          <div
            style={{
              background: (survey.hydrostatic.draftBasis || "extreme") === "moulded" ? "#fff7e6" : "#eaf6ee",
              border: "1px solid #d9c79a",
              borderRadius: 8,
              padding: "0.7rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.9rem",
              color: "#14304f",
            }}
          >
            {(survey.hydrostatic.draftBasis || "extreme") === "moulded" ? (
              <>
                <strong>Read the T column (moulded draft).</strong> Keel plate thickness of{" "}
                {survey.hydrostatic.keelThickness ?? "—"} m is deducted from your quarter mean
                {v.qm2Table != null && v.qm2 != null && (
                  <>
                    {" "}
                    ({round(v.qm2, dp)} → <strong>{round(v.qm2Table, dp)}</strong>)
                  </>
                )}
                . Look up QM2 {v.qm2Table != null ? <strong>{round(v.qm2Table, dp)}</strong> : ""} in the T column,
                and the MTC lookups at ±0.5 from it.
              </>
            ) : (
              <>
                <strong>Read the TK column (extreme draft).</strong> No keel subtraction: look up QM2{" "}
                {v.qm2 != null ? <strong>{round(v.qm2, dp)}</strong> : ""} in the TK column.
              </>
            )}{" "}
            <button
              type="button"
              className="btn-link"
              onClick={() => setStepIndex(Math.max(0, steps.findIndex((s) => s.key === "drafts")))}
            >
              Change keel setting (Step 1)
            </button>
          </div>

          <label className="field" style={{ marginBottom: "1rem" }}>
            <span className="field-label">LCF in this table is measured from</span>
            <select
              value={survey.hydrostatic.lcfReference || "midships"}
              onChange={(e) => patch("hydrostatic.lcfReference", e.target.value)}
            >
              <option value="midships">Midships, aft is positive (use as entered)</option>
              <option value="midships_fwd">Midships, forward is positive</option>
              <option value="ap">Aft Perpendicular (AP)</option>
              <option value="fp">Forward Perpendicular (FP)</option>
            </select>
            <span className="muted small">
              Check the table's heading or footnote. If LCF is about half of LBP or more (for example 84
              m on a 177 m ship), it is measured from the AP or FP and must not be used directly. It is
              converted to a distance from midships for the 1st trim correction.
            </span>
          </label>
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
            {v.keelCorr > 0 && (
              <>
                <ResultRow label="Keel plate thickness deducted" value={v.keelCorr} decimals={dp} unit="m" />
                <ResultRow label="QM2 used to enter the table (T column)" value={v.qm2Table} decimals={dp} unit="m" highlight />
              </>
            )}
            <ResultRow label="QM2 Displacement (interpolated)" value={v.qm2Disp} decimals={dp} unit="t" highlight />
            <ResultRow label="QM2 TPC (interpolated)" value={v.qm2Tpc} decimals={dp} unit="" highlight />
            <ResultRow label="QM2 LCF (interpolated, as in table)" value={v.qm2Lcf} decimals={dp} highlight />
            <ResultRow label="QM2 LCF aft of midships (used in 1st trim correction)" value={v.qm2LcfAft} decimals={dp} highlight />
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
    condition === "loaded"
      ? {
          key: "holds",
          title: "8. Cargo Hold Breakdown",
          subtitle: "Optional — quantity per hold, for the report only (doesn't affect calculations)",
          missing: [],
          content: (
            <>
              {(survey.deductibles ? survey.cargoHolds || [] : survey.cargoHolds || []).map((h, idx) => (
                <div className="grid-2" key={h.id} style={{ marginBottom: "0.5rem" }}>
                  <label className="field">
                    <span className="field-label">Hold name</span>
                    <input
                      value={h.name}
                      onChange={(e) => {
                        const next = [...survey.cargoHolds];
                        next[idx] = { ...next[idx], name: e.target.value };
                        patch("cargoHolds", next);
                      }}
                    />
                  </label>
                  <NumberField
                    label="Quantity"
                    decimals={dp}
                    value={h.quantity}
                    onChange={(x) => {
                      const next = [...survey.cargoHolds];
                      next[idx] = { ...next[idx], quantity: x };
                      patch("cargoHolds", next);
                    }}
                    suffix="t"
                    allowNegative={false}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => patch("cargoHolds", [...(survey.cargoHolds || []), newCargoHold(`Hold ${(survey.cargoHolds || []).length + 1}`)])}
                >
                  + Add hold
                </button>
                {(survey.cargoHolds || []).length > 0 && (
                  <button
                    type="button"
                    className="btn-link danger"
                    onClick={() => patch("cargoHolds", survey.cargoHolds.slice(0, -1))}
                  >
                    Remove last
                  </button>
                )}
              </div>
              {(survey.cargoHolds || []).length > 0 && (
                <div className="results-block">
                  <ResultRow
                    label="Holds total"
                    value={round((survey.cargoHolds || []).reduce((sum, h) => sum + (h.quantity || 0), 0), dp)}
                    decimals={dp}
                    unit="t"
                    highlight
                  />
                </div>
              )}
            </>
          ),
        }
      : null,
    condition === "empty"
      ? {
          key: "result",
          title: "9. Light Ship & Constant",
          subtitle: null,
          missing: missingIn(["lightship", "constant"]),
          content: (
            <>
              <NumberField label="Light Ship weight" decimals={dp} value={survey.lightship} onChange={(x) => patch("lightship", x)} suffix="t" required />
              <div className="results-block">
                <ResultRow label="Calculated Constant (Net Disp − Light Ship)" value={v.calculatedConstant} decimals={dp} unit="t" />
              </div>
              <NumberField
                label="Constant (optional — enter if known, e.g. from a Certificate of Constant)"
                decimals={dp}
                value={survey.constant}
                onChange={(x) => patch("constant", x)}
                suffix="t"
                hint="Leave blank to use the calculated value above. Entering a figure here overrides it everywhere downstream."
              />
              {survey.constant != null && v.calculatedConstant != null && (
                <div className="results-block">
                  <ResultRow
                    label="Difference (entered − calculated)"
                    value={round(survey.constant - v.calculatedConstant, dp)}
                    decimals={dp}
                    unit="t"
                  />
                </div>
              )}
              <div className="results-block">
                <ResultRow label="Constant used (a linked Loaded survey will inherit this)" value={v.constant} decimals={dp} unit="t" highlight />
              </div>

              {isDischarging && (
                <>
                  <div className="results-block">
                    <ResultRow label="Cargo + Constant" value={v.constant} decimals={dp} unit="t" />
                    <ResultRow label="Cargo on Board" value={0} decimals={dp} unit="t" highlight />
                  </div>
                  {(survey.cargoHolds || []).length > 0 && (
                    <div className="results-block">
                      <ResultRow
                        label="Cargo Discharged (sum of holds, from the Cargo Hold Breakdown step)"
                        value={round((survey.cargoHolds || []).reduce((sum, h) => sum + (h.quantity || 0), 0), dp)}
                        decimals={dp}
                        unit="t"
                      />
                    </div>
                  )}
                  <NumberField
                    label="Cargo Discharged — manual override (optional)"
                    decimals={dp}
                    value={survey.cargoTally}
                    onChange={(x) => patch("cargoTally", x)}
                    suffix="t"
                    hint={
                      (survey.cargoHolds || []).length > 0
                        ? "Leave blank to use the hold total above (the standard, most rigorous method). Only fill this in if you have one overall tally figure instead of a hold-by-hold breakdown."
                        : "No holds entered on this survey — enter the receiver's overall tally figure here directly, or go back and use the Cargo Hold Breakdown step instead."
                    }
                  />
                </>
              )}
            </>
          ),
        }
      : {
          key: "result",
          title: "9. Cargo Result",
          subtitle: null,
          missing: missingIn(["lightship", "constant"]),
          content: (
            <>
              <div className="grid-2">
                <NumberField label="Light Ship" decimals={dp} value={survey.lightship} onChange={(x) => patch("lightship", x)} suffix="t" required />
                <NumberField
                  label="Constant"
                  decimals={dp}
                  value={survey.constant}
                  onChange={(x) => patch("constant", x)}
                  suffix="t"
                  required
                  hint={
                    linkedInitial
                      ? "Pre-filled from the linked survey — edit if you need to override it."
                      : "Enter the vessel's known Constant (e.g. from a Certificate of Constant)."
                  }
                />
              </div>
              {v.cargoOnBoard != null && v.cargoOnBoard >= 0 && (
                <div className="results-block">
                  <ResultRow label="Cargo + Constant" value={v.cargoPlusConstant} decimals={dp} unit="t" />
                  <ResultRow label="Cargo on Board" value={v.cargoOnBoard} decimals={dp} unit="t" highlight />
                  {!isDischarging && (
                    <ResultRow label="Cargo Loaded (vs. linked survey)" value={v.cargoLoaded} decimals={dp} unit="t" highlight />
                  )}
                </div>
              )}
              {v.cargoOnBoard != null && v.cargoOnBoard < 0 && (
                <p className="muted small" style={{ marginTop: "0.6rem" }}>
                  Cargo on Board came out negative with the current Light Ship/Constant figures, so it
                  isn't shown here — double-check those two values above.
                </p>
              )}
              {isDischarging && (
                <NumberField
                  label="Cargo Manifested — Declared by Chief Officer"
                  decimals={dp}
                  value={survey.cargoManifested}
                  onChange={(x) => patch("cargoManifested", x)}
                  suffix="t"
                  hint="From the Bill of Lading / mate's receipt — compared against the receiver's Tally figure on the report."
                />
              )}
            </>
          ),
        },
  ].filter(Boolean);

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