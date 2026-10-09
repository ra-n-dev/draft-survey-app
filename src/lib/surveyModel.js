import { nanoid } from "./nanoid.js";

export const emptyHydroPoint = () => ({ qm: null, disp: null, tpc: null, lcf: null });
export const emptyMtcPoint = () => ({ qm: null, mtc: null });

export function newSurvey(type = "initial") {
  return {
    id: nanoid(),
    type, // 'initial' | 'final'
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "draft", // 'draft' | 'complete'
    synced: false,
    vesselName: "",
    voyageNo: "",
    port: "",
    vessel: {
      lbm: null, // Length Between Marks
      lbp: null, // Length Between Perpendiculars
      dFwd: null, // distance: fwd perpendicular -> fwd draft mark
      dAft: null, // distance: aft draft mark -> aft perpendicular
      dMid: 0, // usually 0
      // Certificate/registry particulars - fixed for the ship, sourced from
      // the Certificate of Registry / Tonnage Certificate (chief officer's
      // ship's documents), not calculated or observed. Inherited via the
      // vessel profile exactly like LBM/LBP already are.
      imoNumber: "",
      callSign: "",
      flag: "",
      grt: null,
      nrt: null,
      dwt: null,
    },
    drafts: {
      fwdPort: null,
      fwdStbd: null,
      midPort: null,
      midStbd: null,
      aftPort: null,
      aftStbd: null,
    },
    hydrostatic: {
      qm1: emptyHydroPoint(),
      qm3: emptyHydroPoint(),
      mtcPlus: { qm1: emptyMtcPoint(), qm3: emptyMtcPoint() },
      mtcMinus: { qm1: emptyMtcPoint(), qm3: emptyMtcPoint() },
    },
    density: {
      dockwater: null,
      standard: 1.025,
    },
    deductibles: {
      ballastTanks: [],
      freshWaterTanks: [],
      ballastTotal: null, // set if user prefers to enter a pre-summed figure
      freshWaterTotal: null,
      fuel: {
        hfo: null,
        diesel: null,
        lube: null,
        others: null,
        totalOverride: null,
      },
    },
    // Only meaningful for 'initial' surveys (or carried forward to 'final').
    // `constant` doubles as a manual-override INPUT when this survey's
    // condition is "empty" (e.g. a known figure from a Certificate of
    // Constant) - see calculations.js/computeInitial. `constantSnapshot`
    // is the RESOLVED value (whichever of manual-entry-or-calculated was
    // actually used), saved once an "empty"-condition survey is marked
    // complete so a linked "loaded" survey always inherits the correct
    // number regardless of which path produced it.
    lightship: null,
    constant: null,
    constantSnapshot: null,
    // Whether THIS survey observes the vessel empty (light/ballast) or
    // loaded (with cargo) - independent of `type` (which just records
    // whether this was the first or second survey done for the voyage,
    // for report labeling and linking purposes). The two are the same in
    // the common LOADING scenario (arrive empty -> load cargo -> depart
    // loaded: initial=empty, final=loaded) but swap in a DISCHARGING
    // scenario (arrive loaded -> discharge cargo -> depart empty:
    // initial=loaded, final=empty). This is what actually decides which
    // calculation runs (computeInitial vs computeFinal) - see
    // SurveyFormPage's `result` and DashboardPage's `startNew`.
    condition: type === "initial" ? "empty" : "loaded",
    // Time-of-day this specific survey's readings were taken (e.g. "01:20"
    // to "02:30"), shown alongside the date on the report. Plain text/time
    // strings, not calculated.
    startTime: "",
    endTime: "",
    // Survey conditions AT THE TIME OF READING - the surveyor's own
    // on-the-spot observation, recorded because they affect the accuracy
    // of a visual draft reading (rough seas or poor light lower it). Not
    // calculated, not from the ship's certificates.
    seaState: "",
    windState: "",
    temperature: null,
    readingAccuracy: "", // e.g. "+/- 1cm" - the surveyor's own stated tolerance
    // What's in the holds - shown once on the report, not tied to a
    // specific survey side.
    commodity: "",
    // Cargo Manifested: declared by the vessel's Chief Officer (from the
    // Bill of Lading / mate's receipt) - only meaningful when THIS survey's
    // condition is "loaded" (the vessel already has the cargo aboard).
    cargoManifested: null,
    // Cargo Discharged (or Loaded) Tally: confirmed by the receiver's own
    // weighing/tally, AFTER the cargo has actually moved - only meaningful
    // when THIS survey's condition is "empty" and it's paired with a
    // "loaded" survey (i.e. there's something to compare it against).
    // Compared against cargoManifested on the report to flag a Shortage or
    // Excess - see ReportPage.jsx.
    cargoTally: null,
    // Named cargo holds with individual quantities (e.g. Hold 1, Hold 2...)
    // - purely informational breakdown shown on the report; does not feed
    // into the displacement-based calculations.
    cargoHolds: [],
    // Link a 'final' survey to its paired 'initial' survey
    linkedInitialId: null,
    // Per-survey people/parties. Surveyor name/contact default from the
    // surveyor's own saved Settings profile but can be overridden per
    // survey; Chief Officer and Client are always survey-specific since
    // they differ every voyage.
    chiefOfficerName: "",
    surveyorName: "",
    surveyorContact: "",
    clientCompany: "",
    clientContact: "",
    // Optional: the receiving/client company's own logo for this survey,
    // stored as a data URL (uploaded once per survey - no saved default in
    // Settings yet, see ReportPage.jsx notes).
    clientLogoDataUrl: "",
  };
}

export function newTank(name = "") {
  return {
    id: nanoid(),
    name,
    // Sounding/ullage reading actually measured in this tank.
    soundingD2: null,
    // The tank's own sounding/calibration table: two bracketing rows used
    // to interpolate the true volume at soundingD2, the same way QM1/QM3
    // bracket the hydrostatic table for Displacement/TPC/LCF.
    d1: null,
    vol1: null,
    d3: null,
    vol3: null,
    density: null,
  };
}

export function newCargoHold(name = "") {
  return { id: nanoid(), name, quantity: null };
}