import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSurveyLocal, getCompanyProfile } from "../lib/localStore.js";
import { computeInitial, computeFinal, round } from "../lib/calculations.js";

function fmt(value, decimals) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Pending";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

// Runs the correct calculation for a survey based on its CONDITION (empty
// vs loaded), not its type (initial vs final). See SurveyFormPage.jsx for
// the same logic on the entry side.
function computeForCondition(survey, linkedInitial, dp) {
  const condition = survey.condition ?? (survey.type === "initial" ? "empty" : "loaded");
  if (condition === "empty") {
    return computeInitial(survey, survey.lightship, dp);
  }
  const initialNet = linkedInitial?.netDisplacementSnapshot;
  return computeFinal(survey, survey.lightship, survey.constant, initialNet, dp);
}

// One label/value line inside the right-hand (4th) column.
function SideRow({ label, value, unit, emphasis }) {
  return (
    <div className={`rpt-side-row${emphasis ? " is-emphasis" : ""}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit && value !== "—" && value !== "Pending" ? ` ${unit}` : ""}
      </strong>
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const { surveys, settings } = useSurveys();
  const { user } = useAuth();
  const [survey, setSurvey] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const dp = settings.decimals ?? 3;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = surveys.find((s) => s.id === id) || (await getSurveyLocal(user?.uid, id));
      const profile = await getCompanyProfile(user?.uid);
      if (!cancelled) {
        setSurvey(found);
        setCompanyProfile(profile);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, surveys]);

  // Both sides of the pair, regardless of which one the URL points at.
  const { initialSurvey, finalSurvey } = useMemo(() => {
    if (!survey) return { initialSurvey: null, finalSurvey: null };
    if (survey.type === "initial") {
      const linkedFinal = surveys.find((s) => s.linkedInitialId === survey.id) || null;
      return { initialSurvey: survey, finalSurvey: linkedFinal };
    }
    const linked = survey.linkedInitialId ? surveys.find((s) => s.id === survey.linkedInitialId) : null;
    return { initialSurvey: linked, finalSurvey: survey };
  }, [survey, surveys]);

  if (!survey || !companyProfile) return <div className="page">Loading…</div>;

  const iv = initialSurvey ? computeForCondition(initialSurvey, null, dp).values : null;
  const fv = finalSurvey ? computeForCondition(finalSurvey, initialSurvey, dp).values : null;

  const initialCondition = initialSurvey
    ? initialSurvey.condition ?? "empty"
    : finalSurvey?.condition === "empty"
      ? "loaded"
      : "empty";
  const isDischarging = initialCondition === "loaded";
  const surveyTypeLabel = isDischarging ? "Discharge Survey" : "Loading Survey";

  const displaySurvey = initialSurvey || finalSurvey;
  const clientLogo = initialSurvey?.clientLogoDataUrl || finalSurvey?.clientLogoDataUrl;

  // ---------- table helpers ----------
  const cell = (val, unit) => {
    if (val === "Pending") return <td className="rpt-pending">Pending</td>;
    if (val === undefined || val === "—") return <td className="rpt-dash">—</td>;
    return (
      <td>
        {val}
        {unit ? <span className="rpt-unit"> {unit}</span> : null}
      </td>
    );
  };

  const row = (label, initVal, finalVal, unit = "t", opts = {}) => (
    <tr className={opts.total ? "rpt-total" : opts.highlight ? "rpt-key" : undefined}>
      <th scope="row">{label}</th>
      {cell(initVal, unit)}
      {cell(finalVal, unit)}
    </tr>
  );

  const section = (title) => (
    <tr className="rpt-section">
      <th colSpan={3} scope="colgroup">
        {title}
      </th>
    </tr>
  );

  const RD = (label, path, unit = "m") => {
    const get = (s) => (s ? path.split(".").reduce((o, k) => (o ? o[k] : undefined), s) : undefined);
    const iRaw = get(initialSurvey);
    const fRaw = get(finalSurvey);
    return row(
      label,
      initialSurvey ? (iRaw != null ? fmt(iRaw, dp) : "Pending") : "—",
      finalSurvey ? (fRaw != null ? fmt(fRaw, dp) : "Pending") : "—",
      unit
    );
  };

  const R = (label, ivKey, fvKey, unit = "t", opts = {}) =>
    row(
      label,
      initialSurvey ? (iv && iv[ivKey] != null ? fmt(iv[ivKey], dp) : "Pending") : "—",
      finalSurvey ? (fv && fv[fvKey] != null ? fmt(fv[fvKey], dp) : "Pending") : "—",
      unit,
      opts
    );

  // ---------- cargo figures ----------
  // The hold-by-hold MANIFEST breakdown belongs to whichever survey is
  // the LOADED one - the Chief Officer declares it when cargo goes on.
  // In a discharging voyage that's the Initial survey; in a loading
  // voyage it's the Final survey. This is NOT the same thing as the
  // discharge tally, so it must never be sourced from the empty side.
  const manifestHoldsSurvey = isDischarging ? initialSurvey : finalSurvey;
  const cargoHolds = manifestHoldsSurvey?.cargoHolds || [];
  const cargoHoldsTotal =
    cargoHolds.length > 0 ? round(cargoHolds.reduce((sum, h) => sum + (h.quantity || 0), 0), dp) : null;
  const manifested = manifestHoldsSurvey?.cargoManifested ?? cargoHoldsTotal;

  // Tally (Disch.) only exists once the EMPTY/Final survey of a
  // discharging voyage has actually been recorded - it's the receiver's
  // own hold-by-hold tally taken at discharge, entered on THAT survey.
  // Before the Final survey exists there is no tally yet, by definition.
  const tallyHolds = isDischarging ? finalSurvey?.cargoHolds || [] : [];
  const tallyHoldsTotal =
    tallyHolds.length > 0 ? round(tallyHolds.reduce((sum, h) => sum + (h.quantity || 0), 0), dp) : null;
  const manualTally = isDischarging ? finalSurvey?.cargoTally : null;
  const tally = isDischarging ? manualTally ?? tallyHoldsTotal : null;

  // Survey (Cargo on Board) vs Tally. Positive = Excess, negative = Shortage.
  const cargoOnBoardComputed = iv?.cargoOnBoard;
  // Before discharge: show only what's on board (no tally exists yet).
  const showCargoOnBoardOnly = isDischarging && !finalSurvey && cargoOnBoardComputed != null;
  // After discharge: the full comparison, now that a tally actually exists.
  const showCargoComparison =
    isDischarging && !!finalSurvey && (cargoOnBoardComputed != null || tally != null);
  const cargoDiff =
    cargoOnBoardComputed != null && tally != null ? round(cargoOnBoardComputed - tally, dp) : null;

  // Before discharge: Draft Survey (what's physically on board) vs
  // Manifest (what was declared at loading). Catches a discrepancy early,
  // even before the Final/discharge survey and its Tally exist.
  const onBoardDiff =
    showCargoOnBoardOnly && cargoOnBoardComputed != null && manifested != null
      ? round(cargoOnBoardComputed - manifested, dp)
      : null;

  const showLoadingResult = !isDischarging && fv && (fv.cargoOnBoard != null || fv.cargoLoaded != null);
  // Loading side: compare what was actually loaded (survey-computed)
  // against what the Chief Officer declared (Manifest) - same
  // bigger-one-wins Excess/Shortage logic as the discharge comparison.
  const loadingDiff =
    showLoadingResult && fv?.cargoLoaded != null && manifested != null
      ? round(fv.cargoLoaded - manifested, dp)
      : null;

  // ---------- 4th column content ----------
  // These fields may have been typed on EITHER survey (initial or final),
  // so take the first one that actually has a value instead of only
  // looking at the initial survey. Display only - no calculation uses them.
  const pick = (...paths) => {
    for (const path of paths) {
      for (const s of [initialSurvey, finalSurvey]) {
        const v = s ? path.split(".").reduce((o, k) => (o ? o[k] : undefined), s) : undefined;
        if (v !== undefined && v !== null && v !== "") return v;
      }
    }
    return null;
  };
  const positive = (n) => (n != null && Number(n) > 0 ? n : null);

  // Berth / sea / wind / temp / accuracy are entered in Settings. Values
  // typed on a survey itself (older data) are still used as a fallback.
  const fromSettings = (key) => {
    const v = settings?.[key];
    return v !== undefined && v !== null && String(v).trim() !== "" ? v : null;
  };
  const berth = fromSettings("berthNo") ?? pick("berthNo", "berthNumber", "berth");
  const temperature = fromSettings("temperature") ?? pick("temperature");
  const tempText =
    temperature == null ? null : /c$/i.test(String(temperature).trim()) ? String(temperature) : `${temperature}°C`;
  const conditionRows = [
    ["Berth No.", berth],
    ["Sea", fromSettings("seaState") ?? pick("seaState", "sea")],
    ["Wind", fromSettings("windState") ?? pick("windState", "wind")],
    ["Temp", tempText],
    ["Accuracy", fromSettings("readingAccuracy") ?? pick("readingAccuracy", "accuracy")],
  ].filter(([, v]) => v != null && v !== "");

  const dwt = positive(pick("vessel.dwt"));
  const grt = positive(pick("vessel.grt"));
  const nrt = positive(pick("vessel.nrt"));
  const vesselRows = [
    ["IMO No.", pick("vessel.imoNumber")],
    ["Call Sign", pick("vessel.callSign")],
    ["Flag", pick("vessel.flag")],
    ["DWT", dwt != null ? `${fmt(dwt, 0)} t` : null],
    ["GRT", grt != null ? fmt(grt, 0) : null],
    ["NRT", nrt != null ? fmt(nrt, 0) : null],
  ].filter(([, v]) => v);

  const hasAside =
    conditionRows.length > 0 ||
    vesselRows.length > 0 ||
    cargoHolds.length > 0 ||
    showCargoOnBoardOnly ||
    showCargoComparison ||
    showLoadingResult;

  // Shared Excess/Shortage labeling - whichever side is bigger wins the
  // label, reused for both the discharge comparison and the loading one.
  const diffLabelFor = (d) => (d == null ? null : d < 0 ? "Shortage" : d > 0 ? "Excess" : "Difference");
  const diffClassFor = (d) => (d == null ? "" : d < 0 ? "shortage" : d > 0 ? "excess" : "");

  const diffLabel = diffLabelFor(cargoDiff);
  const diffClass = diffClassFor(cargoDiff);
  const loadingDiffLabel = diffLabelFor(loadingDiff);
  const loadingDiffClass = diffClassFor(loadingDiff);
  const onBoardDiffLabel =
    onBoardDiff == null ? null : onBoardDiff < 0 ? "Cargo Short" : onBoardDiff > 0 ? "Excess Cargo on Board" : "No Discrepancy";
  const onBoardDiffClass = diffClassFor(onBoardDiff);

  // Prefer a frozen survey-completion date (set once, on first save) over
  // the live "updatedAt" timestamp, which changes on every later edit and
  // would otherwise make the printed survey date drift forward each time
  // the surveyor comes back to fix a figure. Falls back gracefully for
  // older records that predate this field.
  const surveyWindow = (s) =>
    s
      ? `${fmtDate(s.surveyDate ?? s.completedAt ?? s.createdAt ?? s.updatedAt)}${
          s.startTime ? `, ${s.startTime}–${s.endTime || "…"}` : ""
        }`
      : "Not yet recorded";

  return (
    <div className="page rpt-page">
      <div className="no-print rpt-toolbar">
        <Link to="/" className="back-link">
          ← Dashboard
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      <div className="rpt-sheet">
        {/* ---------- Letterhead ---------- */}
        <header className="rpt-letterhead">
          <div className="rpt-brand">
            {companyProfile.logoDataUrl && <img src={companyProfile.logoDataUrl} alt="Surveying company logo" />}
            <div className="rpt-brand-text">
              {companyProfile.name && <div className="rpt-brand-name">{companyProfile.name}</div>}
              {companyProfile.tagline && <div className="rpt-brand-tagline">{companyProfile.tagline}</div>}
              {(companyProfile.address || companyProfile.country || companyProfile.phone || companyProfile.email) && (
                <div className="rpt-brand-meta">
                  {(companyProfile.address || companyProfile.country) && (
                    <span>{[companyProfile.address, companyProfile.country].filter(Boolean).join(", ")}</span>
                  )}
                  {companyProfile.phone && <span>{companyProfile.phone}</span>}
                  {companyProfile.email && <span>{companyProfile.email}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="rpt-title">
            <div className="rpt-title-badge">Draft Survey Report</div>
            <div className="rpt-subtitle">Official Cargo Weight Certificate</div>
          </div>

          <div className="rpt-brand rpt-brand--client">
            {clientLogo && <img src={clientLogo} alt={`${displaySurvey?.clientCompany || "Client"} logo`} />}
          </div>
        </header>

        {/* ---------- Survey identity ---------- */}
        <div className="rpt-info">
          <div className="rpt-info-item"><span>Vessel</span><strong>{displaySurvey?.vesselName || "—"}</strong></div>
          <div className="rpt-info-item"><span>Voyage No.</span><strong>{displaySurvey?.voyageNo || "—"}</strong></div>
          <div className="rpt-info-item"><span>Port</span><strong>{displaySurvey?.port || "—"}</strong></div>
          <div className="rpt-info-item"><span>Survey Type</span><strong>{surveyTypeLabel}</strong></div>
          <div className="rpt-info-item"><span>Client</span><strong>{displaySurvey?.clientCompany || "—"}</strong></div>
          <div className="rpt-info-item"><span>Commodity</span><strong>{displaySurvey?.commodity || "—"}</strong></div>
          <div className="rpt-info-item"><span>Client Contact</span><strong>{displaySurvey?.clientContact || "—"}</strong></div>
          <div className="rpt-info-item"><span>Initial Survey</span><strong>{surveyWindow(initialSurvey)}</strong></div>
          <div className="rpt-info-item"><span>Surveyor</span><strong>{displaySurvey?.surveyorName || "—"}</strong></div>
          <div className="rpt-info-item"><span>Final Survey</span><strong>{surveyWindow(finalSurvey)}</strong></div>
        </div>

        {/* ---------- Main body: Label | Initial | Final | Particulars & Cargo ---------- */}
        <div className={`rpt-body${hasAside ? "" : " no-aside"}`}>
          <div className="rpt-main">
            <table className="rpt-table">
              <colgroup>
                <col className="c-label" />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Initial</th>
                  <th scope="col">Final</th>
                </tr>
              </thead>
              <tbody>
                {section("Draft Readings (m)")}
                {RD("Fwd Draft — Port", "drafts.fwdPort")}
                {RD("Fwd Draft — Stbd", "drafts.fwdStbd")}
                {R("Mean Fwd Draft", "fwdMean", "fwdMean", "m", { highlight: true })}
                {RD("Aft Draft — Port", "drafts.aftPort")}
                {RD("Aft Draft — Stbd", "drafts.aftStbd")}
                {R("Mean Aft Draft", "aftMean", "aftMean", "m", { highlight: true })}
                {RD("M'ship Draft — Port", "drafts.midPort")}
                {RD("M'ship Draft — Stbd", "drafts.midStbd")}
                {R("Mean M'ship Draft", "midMean", "midMean", "m", { highlight: true })}

                {section("Trim & Quarter Mean")}
                {R("Apparent Trim", "apparentTrim", "apparentTrim", "m")}
                {R("True (Corrected) Trim", "trueTrim", "trueTrim", "m")}
                {R("Quarter Mean (QM2)", "qm2", "qm2", "m", { highlight: true })}

                {section("Hydrostatic Values (at QM2)")}
                {R("TPC", "qm2Tpc", "qm2Tpc", "")}
                {R("LCF", "qm2Lcf", "qm2Lcf", "m")}
                {RD("LBP", "vessel.lbp")}
                {R("MTC (+0.5)", "qm2MtcPlus", "qm2MtcPlus", "")}
                {R("MTC (−0.5)", "qm2MtcMinus", "qm2MtcMinus", "")}

                {section("Displacement")}
                {R("Displacement (QM2)", "qm2Disp", "qm2Disp")}
                {R("1st Trim Correction", "firstTrimCorr", "firstTrimCorr")}
                {R("2nd Trim Correction", "secondTrimCorr", "secondTrimCorr")}
                {R("Displacement (Trim)", "displTrim", "displTrim")}
                {RD("Dockwater Density", "density.dockwater", "")}
                {R("Density Correction", "densityCorr", "densityCorr")}
                {R("Displacement (Density)", "displDensity", "displDensity", "t", { highlight: true })}

                {section("Deductibles")}
                {row("Ballast", iv ? fmt(iv.deductibles?.ballast, dp) : "—", fv ? fmt(fv.deductibles?.ballast, dp) : "—")}
                {row("Fresh Water", iv ? fmt(iv.deductibles?.freshWater, dp) : "—", fv ? fmt(fv.deductibles?.freshWater, dp) : "—")}
                {row("Bunkers (HFO/DO/LO/Other)", iv ? fmt(iv.deductibles?.bunker, dp) : "—", fv ? fmt(fv.deductibles?.bunker, dp) : "—")}
                {row("Total Deductibles", iv ? fmt(iv.totalDeductibles, dp) : "—", fv ? fmt(fv.totalDeductibles, dp) : "—", "t", { highlight: true })}

                {section("Result")}
                {R("Net Displacement", "netDisplacement", "netDisplacement", "t", { highlight: true })}
                {R("Light Ship", "lightship", "lightship")}
                {R("Constant", "constant", "constant")}

                {!isDischarging && fv && (fv.cargoOnBoard == null || fv.cargoOnBoard >= 0) && (
                  <>
                    {row("Cargo + Constant", "—", fmt(fv.cargoPlusConstant, dp))}
                    {row("Cargo on Board", "—", fmt(fv.cargoOnBoard, dp), "t", { total: true })}
                    {row("Cargo Loaded (Final − Initial)", "—", fmt(fv.cargoLoaded, dp), "t", { total: true })}
                  </>
                )}

                {isDischarging && iv && (iv.cargoOnBoard == null || iv.cargoOnBoard >= 0) && (
                  <>
                    {row("Cargo + Constant", fmt(iv.cargoPlusConstant, dp), finalSurvey ? fmt(fv?.constant, dp) : "—")}
                    {row("Cargo on Board", fmt(iv.cargoOnBoard, dp), finalSurvey ? fmt(0, dp) : "—", "t", { total: true })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {hasAside && (
            <aside className="rpt-aside" aria-label="Particulars and cargo">
              <div className="rpt-aside-head">Particulars &amp; Cargo</div>

              {conditionRows.length > 0 && (
                <section className="rpt-block">
                  <h4>Berth &amp; Conditions</h4>
                  {conditionRows.map(([label, value]) => (
                    <SideRow key={label} label={label} value={value} />
                  ))}
                </section>
              )}

              {vesselRows.length > 0 && (
                <section className="rpt-block">
                  <h4>Vessel Particulars</h4>
                  {vesselRows.map(([label, value]) => (
                    <SideRow key={label} label={label} value={value} />
                  ))}
                </section>
              )}

              {cargoHolds.length > 0 && (
                <section className="rpt-block">
                  <h4>Cargo Hold Breakdown</h4>
                  {displaySurvey?.commodity && <div className="rpt-block-sub">{displaySurvey.commodity}</div>}
                  {cargoHolds.map((h) => (
                    <SideRow
                      key={h.id}
                      label={h.name}
                      value={h.quantity != null ? fmt(h.quantity, dp) : "—"}
                      unit="t"
                    />
                  ))}
                  <SideRow label="Total" value={fmt(cargoHoldsTotal, dp)} unit="t" emphasis />
                </section>
              )}

              {showCargoOnBoardOnly && (
                <section className="rpt-block rpt-block--cargo">
                  <h4>Cargo on Board</h4>
                  <SideRow label="Draft Survey" value={fmt(cargoOnBoardComputed, dp)} unit="t" />
                  {manifested != null && <SideRow label="Manifest" value={fmt(manifested, dp)} unit="t" />}
                  {onBoardDiff != null && (
                    <div className={`rpt-diff ${onBoardDiffClass}`}>
                      <span>{onBoardDiff === 0 ? "No discrepancy" : onBoardDiffLabel}</span>
                      <strong>{fmt(Math.abs(onBoardDiff), dp)} t</strong>
                    </div>
                  )}
                  <p style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 6, fontStyle: "italic" }}>
                    Not yet discharged — awaiting Final survey.
                  </p>
                </section>
              )}

              {showCargoComparison && (
                <section className="rpt-block rpt-block--cargo">
                  <h4>Cargo Discharged</h4>
                  <SideRow
                    label="Draft Survey"
                    value={cargoOnBoardComputed != null ? fmt(cargoOnBoardComputed, dp) : "—"}
                    unit="t"
                  />
                  <SideRow label="Tally (Disch.)" value={tally != null ? fmt(tally, dp) : "—"} unit="t" />
                  {manifested != null && <SideRow label="Manifest" value={fmt(manifested, dp)} unit="t" />}
                  {cargoDiff != null && (
                    <div className={`rpt-diff ${diffClass}`}>
                      <span>{cargoDiff === 0 ? "No discrepancy" : diffLabel}</span>
                      <strong>{fmt(Math.abs(cargoDiff), dp)} t</strong>
                    </div>
                  )}
                </section>
              )}

              {showLoadingResult && (
                <section className="rpt-block rpt-block--cargo">
                  <h4>Cargo Loaded</h4>
                  <SideRow label="Cargo on Board" value={fmt(fv.cargoOnBoard, dp)} unit="t" />
                  {manifested != null && <SideRow label="Manifest" value={fmt(manifested, dp)} unit="t" />}
                  <SideRow label="Loaded" value={fmt(fv.cargoLoaded, dp)} unit="t" emphasis />
                  {loadingDiff != null && (
                    <div className={`rpt-diff ${loadingDiffClass}`}>
                      <span>{loadingDiff === 0 ? "No discrepancy" : loadingDiffLabel}</span>
                      <strong>{fmt(Math.abs(loadingDiff), dp)} t</strong>
                    </div>
                  )}
                </section>
              )}
            </aside>
          )}
        </div>

        {iv?.constant == null && fv?.constant == null && (
          <p className="rpt-warning">⚠ This report is incomplete — one or both surveys are still missing figures.</p>
        )}

        {/* ---------- Signatures ---------- */}
        <div className="rpt-signatures">
          <div className="rpt-sig">
            <div className="rpt-sig-line" />
            <div className="rpt-sig-name">{displaySurvey?.chiefOfficerName || "—"}</div>
            <div className="rpt-sig-role">Master / Chief Officer{displaySurvey?.vesselName ? `, ${displaySurvey.vesselName}` : ""}</div>
          </div>
          <div className="rpt-sig">
            <div className="rpt-sig-line" />
            <div className="rpt-sig-name">{displaySurvey?.surveyorName || "—"}</div>
            <div className="rpt-sig-role">Surveyor</div>
            {displaySurvey?.surveyorContact && <div className="rpt-sig-contact">{displaySurvey.surveyorContact}</div>}
          </div>
          <div className="rpt-sig">
            <div className="rpt-sig-line" />
            <div className="rpt-sig-name">{displaySurvey?.clientCompany || "Receiving Company"}</div>
            <div className="rpt-sig-role">Receiver</div>
            {displaySurvey?.clientContact && <div className="rpt-sig-contact">{displaySurvey.clientContact}</div>}
          </div>
        </div>

        <footer className="rpt-footer">
          {companyProfile.name ? `${companyProfile.name}${companyProfile.country ? `, ${companyProfile.country}` : ""}. ` : ""}
          This document is an official cargo weight certificate generated by draft survey.
        </footer>
      </div>
    </div>
  );
}