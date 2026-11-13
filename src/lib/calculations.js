// ============================================================================
// DRAFT SURVEY CALCULATION ENGINE
// Implements the exact sequence from the reference workings:
// mean drafts -> apparent trim -> perpendicular corrections -> true drafts ->
// true trim -> quarter mean -> hydrostatic interpolation (Disp/TPC/LCF) ->
// MTC+/MTC- interpolation -> trim corrections -> displacement (trim) ->
// density correction -> displacement (density) -> deductibles -> net
// displacement -> (initial) constant, or (final) cargo figures.
// ============================================================================

export const round = (value, decimals = 3) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const need = (val, path, missing, label) => {
  if (!isNum(val)) missing.push({ path, label });
  return val;
};

/**
 * Linear interpolation used throughout for hydrostatic-table lookups.
 * value2 = (x2 - x1) / (x3 - x1) * (y3 - y1) + y1
 */
export function interpolate(x1, x2, x3, y1, y3) {
  if (![x1, x2, x3, y1, y3].every(isNum)) return null;
  if (x3 === x1) return y1;
  return ((x2 - x1) * (y3 - y1)) / (x3 - x1) + y1;
}

/**
 * Runs the full draft-survey calculation for ONE observation (initial or final).
 *
 * @param {object} d - survey input data (see DEFAULT_SURVEY shape in surveyModel.js)
 * @param {number} dp - decimal places to round displayed/stored results to
 * @returns {{ values: object, missing: Array<{path:string,label:string}> }}
 */
export function computeSurvey(d, dp = 3) {
  const missing = [];
  const v = {}; // computed values live here

  const g = (obj, key) => (obj ? obj[key] : undefined);

  // ---------- 1. Mean drafts (port/stbd average) ----------
  const fwdPort = need(g(d.drafts, "fwdPort"), "drafts.fwdPort", missing, "Forward draft (Port)");
  const fwdStbd = need(g(d.drafts, "fwdStbd"), "drafts.fwdStbd", missing, "Forward draft (Stbd)");
  const midPort = need(g(d.drafts, "midPort"), "drafts.midPort", missing, "Midship draft (Port)");
  const midStbd = need(g(d.drafts, "midStbd"), "drafts.midStbd", missing, "Midship draft (Stbd)");
  const aftPort = need(g(d.drafts, "aftPort"), "drafts.aftPort", missing, "Aft draft (Port)");
  const aftStbd = need(g(d.drafts, "aftStbd"), "drafts.aftStbd", missing, "Aft draft (Stbd)");

  v.fwdMean = isNum(fwdPort) && isNum(fwdStbd) ? (fwdPort + fwdStbd) / 2 : null;
  v.midMean = isNum(midPort) && isNum(midStbd) ? (midPort + midStbd) / 2 : null;
  v.aftMean = isNum(aftPort) && isNum(aftStbd) ? (aftPort + aftStbd) / 2 : null;

  // ---------- 2. Apparent trim ----------
  v.apparentTrim =
    isNum(v.aftMean) && isNum(v.fwdMean) ? v.aftMean - v.fwdMean : null;

  // ---------- 3. Perpendicular corrections ----------
  const lbm = need(g(d.vessel, "lbm"), "vessel.lbm", missing, "Length Between Marks (LBM)");
  const lbp = need(g(d.vessel, "lbp"), "vessel.lbp", missing, "Length Between Perpendiculars (LBP)");
  const dFwd = need(
    g(d.vessel, "dFwd"),
    "vessel.dFwd",
    missing,
    "Distance: Fwd perpendicular to Fwd draft mark"
  );
  const dAft = need(
    g(d.vessel, "dAft"),
    "vessel.dAft",
    missing,
    "Distance: Aft draft mark to Aft perpendicular"
  );
  const dMid = g(d.vessel, "dMid") ?? 0; // usually 0 - no correction needed

  v.fwdCorr =
    isNum(v.apparentTrim) && isNum(dFwd) && isNum(lbm) && lbm !== 0
      ? (v.apparentTrim * dFwd) / lbm
      : null;
  v.aftCorr =
    isNum(v.apparentTrim) && isNum(dAft) && isNum(lbm) && lbm !== 0
      ? (v.apparentTrim * dAft) / lbm
      : null;
  v.midCorr =
    isNum(v.apparentTrim) && isNum(dMid) && isNum(lbm) && lbm !== 0
      ? (v.apparentTrim * dMid) / lbm
      : 0;

  // ---------- 4. True drafts ----------
  v.trueFwd = isNum(v.fwdMean) && isNum(v.fwdCorr) ? v.fwdMean + v.fwdCorr : null;
  v.trueMid = isNum(v.midMean) ? v.midMean + (v.midCorr || 0) : null;
  v.trueAft = isNum(v.aftMean) && isNum(v.aftCorr) ? v.aftMean + v.aftCorr : null;

  // ---------- 5. True trim ----------
  v.trueTrim = isNum(v.trueAft) && isNum(v.trueFwd) ? v.trueAft - v.trueFwd : null;

  // ---------- 6. Quarter Mean (QM2, i.e. the calculated one) ----------
  v.qm2 =
    isNum(v.trueFwd) && isNum(v.trueAft) && isNum(v.trueMid)
      ? (v.trueFwd * 1 + v.trueAft * 1 + v.trueMid * 6) / 8
      : null;

  // ---------- 7. Hydrostatic table interpolation: Disp / TPC / LCF ----------
  const h = d.hydrostatic || {};
  const qm1 = need(g(h.qm1, "qm"), "hydrostatic.qm1.qm", missing, "QM1 (hydrostatic table, lower bracket)");
  const qm1Disp = need(g(h.qm1, "disp"), "hydrostatic.qm1.disp", missing, "QM1 Displacement (table)");
  const qm1Tpc = need(g(h.qm1, "tpc"), "hydrostatic.qm1.tpc", missing, "QM1 TPC (table)");
  const qm1Lcf = need(g(h.qm1, "lcf"), "hydrostatic.qm1.lcf", missing, "QM1 LCF (table)");

  const qm3 = need(g(h.qm3, "qm"), "hydrostatic.qm3.qm", missing, "QM3 (hydrostatic table, upper bracket)");
  const qm3Disp = need(g(h.qm3, "disp"), "hydrostatic.qm3.disp", missing, "QM3 Displacement (table)");
  const qm3Tpc = need(g(h.qm3, "tpc"), "hydrostatic.qm3.tpc", missing, "QM3 TPC (table)");
  const qm3Lcf = need(g(h.qm3, "lcf"), "hydrostatic.qm3.lcf", missing, "QM3 LCF (table)");

  // Keel plate thickness. Draft marks read the EXTREME draft (to the bottom
  // of the keel plate). Many tables are built on the MOULDED draft (to the
  // top of the keel plate), shown as column T, with the extreme draft in
  // column TK = T + keel thickness. The surveyor says which column they are
  // entering the table by:
  //   "extreme" (default) - table entered by TK / extreme draft: no change
  //   "moulded"           - table entered by T: keel thickness is deducted
  // The deduction is applied ONLY to the quarter mean used for the table
  // lookups (and the MTC +/- 0.5 lookups). The raw readings, the true
  // drafts and the trim are left exactly as measured - a uniform offset
  // doesn't change trim or the perpendicular corrections.
  const draftBasis = h.draftBasis || "extreme";
  const keelThickness =
    draftBasis === "moulded"
      ? need(h.keelThickness, "hydrostatic.keelThickness", missing, "Keel plate thickness (m)")
      : null;
  v.keelCorr = draftBasis === "moulded" && isNum(keelThickness) && keelThickness > 0 ? keelThickness : 0;
  v.qm2Table = isNum(v.qm2) ? v.qm2 - v.keelCorr : null;

  v.qm2Disp = interpolate(qm1, v.qm2Table, qm3, qm1Disp, qm3Disp);
  v.qm2Lcf = interpolate(qm1, v.qm2Table, qm3, qm1Lcf, qm3Lcf);
  // TPC is typically constant across the bracket / read directly - interpolate too, in case it varies
  v.qm2Tpc = isNum(qm1Tpc) && isNum(qm3Tpc) ? interpolate(qm1, v.qm2Table, qm3, qm1Tpc, qm3Tpc) : qm1Tpc ?? qm3Tpc ?? null;

  // ---------- 8. MTC+ / MTC- brackets (special: uses QM2 +/- 0.5 as the lookup value) ----------
  // Same table column as the lookup above, so the same keel adjustment.
  v.mtcPlusQm = isNum(v.qm2Table) ? v.qm2Table + 0.5 : null;
  v.mtcMinusQm = isNum(v.qm2Table) ? v.qm2Table - 0.5 : null;

  const mp = h.mtcPlus || {};
  const mn = h.mtcMinus || {};

  const mp1Qm = need(g(mp.qm1, "qm"), "hydrostatic.mtcPlus.qm1.qm", missing, "MTC+ bracket QM1 (table)");
  const mp1Val = need(g(mp.qm1, "mtc"), "hydrostatic.mtcPlus.qm1.mtc", missing, "MTC+ bracket QM1 value (table)");
  const mp3Qm = need(g(mp.qm3, "qm"), "hydrostatic.mtcPlus.qm3.qm", missing, "MTC+ bracket QM3 (table)");
  const mp3Val = need(g(mp.qm3, "mtc"), "hydrostatic.mtcPlus.qm3.mtc", missing, "MTC+ bracket QM3 value (table)");

  const mn1Qm = need(g(mn.qm1, "qm"), "hydrostatic.mtcMinus.qm1.qm", missing, "MTC- bracket QM1 (table)");
  const mn1Val = need(g(mn.qm1, "mtc"), "hydrostatic.mtcMinus.qm1.mtc", missing, "MTC- bracket QM1 value (table)");
  const mn3Qm = need(g(mn.qm3, "qm"), "hydrostatic.mtcMinus.qm3.qm", missing, "MTC- bracket QM3 (table)");
  const mn3Val = need(g(mn.qm3, "mtc"), "hydrostatic.mtcMinus.qm3.mtc", missing, "MTC- bracket QM3 value (table)");

  v.qm2MtcPlus = interpolate(mp1Qm, v.mtcPlusQm, mp3Qm, mp1Val, mp3Val);
  v.qm2MtcMinus = interpolate(mn1Qm, v.mtcMinusQm, mn3Qm, mn1Val, mn3Val);
  v.qm2Mtc =
    isNum(v.qm2MtcPlus) && isNum(v.qm2MtcMinus) ? v.qm2MtcPlus - v.qm2MtcMinus : null;

  // ---------- 9. Trim corrections ----------
  // The 1st trim correction needs the LCF as a distance from MIDSHIPS
  // (positive = aft of midships, matching trueTrim = aft - fwd, so that
  // trim by stern + LCF aft = add). Hydrostatic tables publish LCF in
  // different ways, so the surveyor says which one their table uses:
  //   "midships"     - table value already positive-aft from midships
  //                    (used as-is; the original behaviour / default)
  //   "midships_fwd" - from midships, positive FORWARD (sign is flipped)
  //   "ap"           - from the Aft Perpendicular:  LBP/2 - LCF
  //   "fp"           - from the Fwd Perpendicular:  LCF - LBP/2
  const lcfReference = h.lcfReference || "midships";
  const halfLbp = isNum(lbp) ? lbp / 2 : null;
  const toLcfAft = (lcf) => {
    if (!isNum(lcf)) return null;
    switch (lcfReference) {
      case "ap":
        return isNum(halfLbp) ? halfLbp - lcf : null;
      case "fp":
        return isNum(halfLbp) ? lcf - halfLbp : null;
      case "midships_fwd":
        return -lcf;
      default:
        return lcf;
    }
  };
  // Interpolated table LCF stays available as v.qm2Lcf; this is the
  // converted figure that actually goes into the correction.
  v.qm2LcfAft = toLcfAft(v.qm2Lcf);

  v.firstTrimCorr =
    isNum(v.trueTrim) && isNum(v.qm2Tpc) && isNum(v.qm2LcfAft) && isNum(lbp) && lbp !== 0
      ? (v.trueTrim * v.qm2Tpc * v.qm2LcfAft * 100) / lbp
      : null;

  v.secondTrimCorr =
    isNum(v.trueTrim) && isNum(v.qm2Mtc) && isNum(lbp) && lbp !== 0
      ? (v.trueTrim * v.trueTrim * v.qm2Mtc * 50) / lbp
      : null;

  v.sumTrimCorr =
    isNum(v.firstTrimCorr) && isNum(v.secondTrimCorr)
      ? v.firstTrimCorr + v.secondTrimCorr
      : null;

  // ---------- 10. Displacement (Trim) ----------
  v.displTrim =
    isNum(v.qm2Disp) && isNum(v.sumTrimCorr) ? v.qm2Disp + v.sumTrimCorr : null;

  // ---------- 11. Density correction ----------
  const dens = d.density || {};
  const dockDensity = need(g(dens, "dockwater"), "density.dockwater", missing, "Dock water density");
  const stdDensity = g(dens, "standard") ?? 1.025;

  v.densityCorr =
    isNum(dockDensity) && isNum(v.displTrim)
      ? ((dockDensity - stdDensity) / stdDensity) * v.displTrim
      : null;

  // ---------- 12. Displacement (Density) ----------
  v.displDensity =
    isNum(v.displTrim) && isNum(v.densityCorr) ? v.displTrim + v.densityCorr : null;

  // ---------- 13. Deductibles / consumables ----------
  const ded = d.deductibles || {};

  // Each ballast/fresh-water tank is read the same way as the
  // Displacement/TPC/LCF hydrostatic lookups: you take a sounding/ullage
  // reading (D2) in the tank, and the tank's own sounding/calibration
  // table gives two bracketing rows - a lower sounding D1 with volume
  // Vol1, and an upper sounding D3 with volume Vol3. The true volume is
  // interpolated between them, then multiplied by density for the tank's
  // weight. Tanks are still summed together for the deductible total.
  //
  // Backward compatibility: a tank saved before this feature existed may
  // only have a plain `volume` figure with no sounding/table fields at
  // all - that is honored directly (volume x density) rather than forcing
  // re-entry of old data.
  const sumTanks = (tanks, pathPrefix, label) => {
    if (!tanks || tanks.length === 0) return 0;
    let total = 0;

    tanks.forEach((t, i) => {
      const hasLegacyVolumeOnly =
        isNum(t.volume) && !isNum(t.soundingD2) && !isNum(t.d1) && !isNum(t.d3);

      if (hasLegacyVolumeOnly) {
        if (isNum(t.density)) {
          total += t.volume * t.density;
        } else {
          missing.push({ path: `${pathPrefix}[${i}].density`, label: `${label} #${i + 1} density` });
        }
        return;
      }

      const hasAnyInput =
        isNum(t.soundingD2) ||
        isNum(t.d1) ||
        isNum(t.vol1) ||
        isNum(t.d3) ||
        isNum(t.vol3) ||
        isNum(t.density) ||
        isNum(t.volume);

      const allFilled =
        isNum(t.soundingD2) &&
        isNum(t.d1) &&
        isNum(t.vol1) &&
        isNum(t.d3) &&
        isNum(t.vol3) &&
        isNum(t.density);

      if (allFilled) {
        const interpolatedVolume = interpolate(t.d1, t.soundingD2, t.d3, t.vol1, t.vol3);
        if (isNum(interpolatedVolume)) {
          total += interpolatedVolume * t.density;
        }
      } else if (hasAnyInput) {
        missing.push({
          path: `${pathPrefix}[${i}]`,
          label: `${label} #${i + 1}: sounding (D2), table brackets (D1/Vol1, D3/Vol3) & density`,
        });
      }
    });

    return total;
  };

  const ballastTotal =
    isNum(ded.ballastTotal) ? ded.ballastTotal : sumTanks(ded.ballastTanks, "deductibles.ballastTanks", "Ballast tank");
  const freshWaterTotal =
    isNum(ded.freshWaterTotal)
      ? ded.freshWaterTotal
      : sumTanks(ded.freshWaterTanks, "deductibles.freshWaterTanks", "Fresh water tank");

  const fuel = ded.fuel || {};
  const hfo = fuel.hfo ?? 0;
  const doil = fuel.diesel ?? 0;
  const lube = fuel.lube ?? 0;
  const others = fuel.others ?? 0;
  const bunkerTotal = isNum(fuel.totalOverride) ? fuel.totalOverride : hfo + doil + lube + others;

  v.deductibles = {
    ballast: round(ballastTotal, dp),
    freshWater: round(freshWaterTotal, dp),
    bunker: round(bunkerTotal, dp),
    hfo: round(hfo, dp),
    diesel: round(doil, dp),
    lube: round(lube, dp),
    others: round(others, dp),
  };
  v.totalDeductibles = ballastTotal + freshWaterTotal + bunkerTotal;

  // ---------- 14. Net Displacement ----------
  v.netDisplacement =
    isNum(v.displDensity) ? v.displDensity - v.totalDeductibles : null;

  // ---------- Round everything for display/storage ----------
  const rounded = {};
  Object.keys(v).forEach((k) => {
    if (k === "deductibles") {
      rounded[k] = v[k];
    } else if (typeof v[k] === "number") {
      rounded[k] = round(v[k], dp);
    } else {
      rounded[k] = v[k];
    }
  });

  return { values: rounded, missing };
}

/**
 * Combines an Initial (empty/light) survey with a Light Ship figure to
 * derive the vessel Constant.
 *
 * A surveyor can now ALSO enter a known Constant directly (e.g. from a
 * Certificate of Constant) instead of relying purely on the calculated
 * figure. `values.calculatedConstant` always holds the auto-calculated
 * reference value (Net Displacement - Light Ship); `values.constant` is
 * the EFFECTIVE value used everywhere downstream (the linked Final
 * survey's cargo figures, the report) - it's the manually-entered figure
 * when one was provided, otherwise it falls back to the calculated one.
 */
export function computeInitial(surveyData, lightship, dp = 3) {
  const { values, missing } = computeSurvey(surveyData, dp);
  if (!isNum(lightship)) {
    missing.push({ path: "lightship", label: "Light Ship weight" });
  }
  const calculatedConstant =
    isNum(values.netDisplacement) && isNum(lightship)
      ? values.netDisplacement - lightship
      : null;

  const enteredConstant = surveyData.constant;
  const constant = isNum(enteredConstant) ? enteredConstant : calculatedConstant;

  return {
    values: {
      ...values,
      lightship: isNum(lightship) ? round(lightship, dp) : null,
      calculatedConstant: round(calculatedConstant, dp),
      constant: round(constant, dp),
    },
    missing,
  };
}

/**
 * Final survey: computes the full chain, then derives cargo figures using
 * the constant + lightship carried over from the Initial survey.
 */
export function computeFinal(surveyData, lightship, constant, initialNetDisplacement, dp = 3) {
  const { values, missing } = computeSurvey(surveyData, dp);
  if (!isNum(lightship)) missing.push({ path: "lightship", label: "Light Ship weight (from Initial survey)" });
  if (!isNum(constant)) missing.push({ path: "constant", label: "Constant (from Initial survey)" });

  const cargoPlusConstant =
    isNum(values.netDisplacement) && isNum(lightship)
      ? values.netDisplacement - lightship
      : null;

  const cargoOnBoard =
    isNum(values.netDisplacement) && isNum(lightship) && isNum(constant)
      ? values.netDisplacement - (lightship + constant)
      : null;

  const cargoLoaded =
    isNum(values.netDisplacement) && isNum(initialNetDisplacement)
      ? values.netDisplacement - initialNetDisplacement
      : null;

  return {
    values: {
      ...values,
      lightship: isNum(lightship) ? round(lightship, dp) : null,
      constant: isNum(constant) ? round(constant, dp) : null,
      cargoPlusConstant: round(cargoPlusConstant, dp),
      cargoOnBoard: round(cargoOnBoard, dp),
      cargoLoaded: round(cargoLoaded, dp),
    },
    missing,
  };
}