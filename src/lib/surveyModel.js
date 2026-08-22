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
    // Only meaningful for 'initial' surveys (or carried forward to 'final')
    lightship: null,
    constant: null,
    // Linked-survey identity (vessel/voyage/port) is filled in automatically
    // — see surveyModel/newSurvey and DashboardPage.startNew — since these
    // never change between the Initial and Final survey of the same voyage.
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
  };
}

export function newTank(name = "") {
  return { id: nanoid(), name, volume: null, density: null };
}