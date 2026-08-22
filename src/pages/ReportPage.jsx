import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSurveyLocal, getCompanyProfile, getSurveyorProfile } from "../lib/localStore.js";
import { computeInitial, computeFinal } from "../lib/calculations.js";

export default function ReportPage() {
  const { id } = useParams();
  const { surveys, settings } = useSurveys();
  const { user } = useAuth();
  const [survey, setSurvey] = useState(null);
  const [company, setCompany] = useState(null);
  const [surveyorDefaults, setSurveyorDefaults] = useState(null);
  const dp = settings.decimals ?? 3;

  useEffect(() => {
    (async () => {
      const found = surveys.find((s) => s.id === id) || (await getSurveyLocal(user?.uid, id));
      setSurvey(found);
      setCompany(await getCompanyProfile(user?.uid));
      setSurveyorDefaults(await getSurveyorProfile(user?.uid));
    })();
  }, [id, surveys, user?.uid]);

  const initialSurvey = useMemo(() => {
    if (!survey) return null;
    if (survey.type === "initial") return survey;
    return surveys.find((s) => s.id === survey.linkedInitialId) || null;
  }, [survey, surveys]);

  const finalSurvey = useMemo(() => {
    if (!survey) return null;
    if (survey.type === "final") return survey;
    return surveys.find((s) => s.type === "final" && s.linkedInitialId === survey.id) || null;
  }, [survey, surveys]);

  const initialResult = useMemo(
    () => (initialSurvey ? computeInitial(initialSurvey, initialSurvey.lightship, dp) : null),
    [initialSurvey, dp]
  );

  const finalResult = useMemo(() => {
    if (!finalSurvey) return null;
    return computeFinal(
      finalSurvey,
      finalSurvey.lightship,
      finalSurvey.constant,
      initialResult?.values?.netDisplacement,
      dp
    );
  }, [finalSurvey, initialResult, dp]);

  if (!survey) return <div className="page">Loading…</div>;

  const iv = initialResult?.values || {};
  const fv = finalResult?.values || {};
  const anyMissing = (initialResult?.missing?.length || 0) + (finalResult?.missing?.length || 0);

  // People/parties: prefer the Final survey's own entries once it's
  // complete (people can change between initial and final in rare cases),
  // otherwise fall back to the Initial survey's entries, then to the
  // surveyor's saved Settings defaults.
  const chiefOfficerName = finalSurvey?.chiefOfficerName || initialSurvey?.chiefOfficerName || "";
  const surveyorName = finalSurvey?.surveyorName || initialSurvey?.surveyorName || surveyorDefaults?.name || "";
  const surveyorContact =
    finalSurvey?.surveyorContact || initialSurvey?.surveyorContact || surveyorDefaults?.contact || "";
  const clientCompany = finalSurvey?.clientCompany || initialSurvey?.clientCompany || "";
  const clientContact = finalSurvey?.clientContact || initialSurvey?.clientContact || "";

  const rows = [
    { section: "Draft Readings (m)" },
    { label: "Fwd Draft — Port", i: initialSurvey?.drafts.fwdPort, f: finalSurvey?.drafts.fwdPort },
    { label: "Fwd Draft — Stbd", i: initialSurvey?.drafts.fwdStbd, f: finalSurvey?.drafts.fwdStbd },
    { label: "Mean Fwd Draft", i: iv.fwdMean, f: fv.fwdMean },
    { label: "Aft Draft — Port", i: initialSurvey?.drafts.aftPort, f: finalSurvey?.drafts.aftPort },
    { label: "Aft Draft — Stbd", i: initialSurvey?.drafts.aftStbd, f: finalSurvey?.drafts.aftStbd },
    { label: "Mean Aft Draft", i: iv.aftMean, f: fv.aftMean },
    { label: "M'ship Draft — Port", i: initialSurvey?.drafts.midPort, f: finalSurvey?.drafts.midPort },
    { label: "M'ship Draft — Stbd", i: initialSurvey?.drafts.midStbd, f: finalSurvey?.drafts.midStbd },
    { label: "Mean M'ship Draft", i: iv.midMean, f: fv.midMean },

    { section: "Trim & Quarter Mean" },
    { label: "Apparent Trim", i: iv.apparentTrim, f: fv.apparentTrim },
    { label: "True (Corrected) Trim", i: iv.trueTrim, f: fv.trueTrim },
    { label: "Quarter Mean (QM2)", i: iv.qm2, f: fv.qm2, unit: "" },

    { section: "Hydrostatic Values (at QM2)" },
    { label: "TPC", i: iv.qm2Tpc, f: fv.qm2Tpc, unit: "" },
    { label: "LCF", i: iv.qm2Lcf, f: fv.qm2Lcf },
    { label: "LBP", i: initialSurvey?.vessel.lbp, f: finalSurvey?.vessel.lbp },
    { label: "MTC⁺ (QM2 + 0.5)", i: iv.qm2MtcPlus, f: fv.qm2MtcPlus, unit: "" },
    { label: "MTC⁻ (QM2 − 0.5)", i: iv.qm2MtcMinus, f: fv.qm2MtcMinus, unit: "" },

    { section: "Displacement" },
    { label: "Displacement (QM2, interpolated)", i: iv.qm2Disp, f: fv.qm2Disp, unit: "t" },
    { label: "1st Trim Correction", i: iv.firstTrimCorr, f: fv.firstTrimCorr, unit: "t" },
    { label: "2nd Trim Correction", i: iv.secondTrimCorr, f: fv.secondTrimCorr, unit: "t" },
    { label: "Displacement (Trim)", i: iv.displTrim, f: fv.displTrim, unit: "t", strong: true },
    { label: "Dockwater Density", i: initialSurvey?.density.dockwater, f: finalSurvey?.density.dockwater, unit: "" },
    { label: "Density Correction", i: iv.densityCorr, f: fv.densityCorr, unit: "t" },
    { label: "Displacement (Density)", i: iv.displDensity, f: fv.displDensity, unit: "t", strong: true },

    { section: "Deductibles" },
    { label: "Ballast", i: iv.deductibles?.ballast, f: fv.deductibles?.ballast, unit: "t" },
    { label: "Fresh Water", i: iv.deductibles?.freshWater, f: fv.deductibles?.freshWater, unit: "t" },
    { label: "Bunkers (HFO/Diesel/Lube/Other)", i: iv.deductibles?.bunker, f: fv.deductibles?.bunker, unit: "t" },
    { label: "Total Deductibles", i: iv.totalDeductibles, f: fv.totalDeductibles, unit: "t", strong: true },

    { section: "Result", total: true },
    { label: "Net Displacement", i: iv.netDisplacement, f: fv.netDisplacement, unit: "t", strong: true },
    { label: "Light Ship", i: iv.lightship, f: fv.lightship, unit: "t" },
    { label: "Constant", i: iv.constant, f: fv.constant, unit: "t", strong: true },
    { label: "Cargo + Constant", i: null, f: fv.cargoPlusConstant, unit: "t" },
    { label: "Cargo on Board", i: null, f: fv.cargoOnBoard, unit: "t", strong: true },
    { label: "Cargo Loaded (Final − Initial)", i: null, f: fv.cargoLoaded, unit: "t", strong: true },
  ];

  const fmt = (v, unit) => {
    if (v === null || v === undefined) return "—";
    return `${Number(v).toFixed(dp)}${unit !== undefined ? (unit ? " " + unit : "") : " m"}`;
  };

  return (
    <div className="page report-page">
      <div className="no-print report-toolbar">
        <Link to="/" className="back-link" style={{ color: "var(--teal)" }}>
          ← Dashboard
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      <div className="report-sheet">
        <div className="report-header-top">
          {(company?.name || company?.logoDataUrl) && (
            <div className="report-brand">
              {company.logoDataUrl && <img src={company.logoDataUrl} alt={company.name || "Company logo"} />}
              <div>
                {company.name && <div className="report-brand-name">{company.name}</div>}
                <div className="report-brand-meta">
                  {[company.country, company.email].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          )}
          <h1 className="report-title-badge">Draft Survey Report</h1>
        </div>

        <div className="report-meta-grid">
          <div className="meta-item">
            <span>Vessel</span>
            <strong>{initialSurvey?.vesselName || finalSurvey?.vesselName || "—"}</strong>
          </div>
          <div className="meta-item">
            <span>Voyage No.</span>
            <strong>{initialSurvey?.voyageNo || finalSurvey?.voyageNo || "—"}</strong>
          </div>
          <div className="meta-item">
            <span>Port</span>
            <strong>{initialSurvey?.port || finalSurvey?.port || "—"}</strong>
          </div>
          {(clientCompany || clientContact) && (
            <div className="meta-item">
              <span>Client</span>
              <strong>{[clientCompany, clientContact].filter(Boolean).join(" · ")}</strong>
            </div>
          )}
          <div className="meta-item">
            <span>Initial Survey</span>
            <strong>{initialSurvey ? new Date(initialSurvey.updatedAt).toLocaleString() : "—"}</strong>
          </div>
          <div className="meta-item">
            <span>Final Survey</span>
            <strong>{finalSurvey ? new Date(finalSurvey.updatedAt).toLocaleString() : "Not yet recorded"}</strong>
          </div>
        </div>

        <div className="report-table-wrap">
          <table className="paired-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}></th>
              <th>Initial</th>
              <th>Final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) =>
              row.section ? (
                <tr className="section-row" key={`s-${idx}`}>
                  <td colSpan={3}>{row.section}</td>
                </tr>
              ) : (
                <tr key={row.label} className={row.strong ? "total-row" : ""}>
                  <td>{row.label}</td>
                  <td>
                    {row.i === null || row.i === undefined ? (
                      <span className="pending-col">—</span>
                    ) : (
                      fmt(row.i, row.unit)
                    )}
                  </td>
                  <td>
                    {row.f === null || row.f === undefined ? (
                      <span className="pending-col">Pending</span>
                    ) : (
                      fmt(row.f, row.unit)
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        </div>

        {anyMissing > 0 && (
          <p className="report-warning">
            ⚠ This report is incomplete — {anyMissing} figure(s) are still missing across the survey(s) shown.
          </p>
        )}

        <div className="signature-block">
          <div className="signature-line">
            ____________________________
            <div className="label">
              Master / Chief Officer{chiefOfficerName ? `: ${chiefOfficerName}` : ""}
            </div>
          </div>
          <div className="signature-line">
            ____________________________
            <div className="label">
              Surveyor{surveyorName ? `: ${surveyorName}` : ""}
              {surveyorContact ? ` · ${surveyorContact}` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}