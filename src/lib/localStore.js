import { get, set, del, keys } from "idb-keyval";

// Every survey is saved locally FIRST, always, regardless of network status.
// This is the offline source of truth. Firestore sync (see firebaseSync.js)
// is a secondary layer that pushes/pulls on top of this.
//
// IMPORTANT: every key below is scoped by the signed-in account's uid.
// Without this, switching accounts on the same browser/device would let
// one person's cached surveys and settings bleed into another person's
// view — which is exactly a bug this scoping exists to prevent. Always
// pass the current user's uid (from useAuth()'s `user?.uid`) into every
// function here. When there is no signed-in user at all (Firebase not
// configured, fully offline dev mode), pass undefined — everything then
// falls back to one shared "local" bucket, which is fine since there's no
// concept of multiple accounts in that mode anyway.

const scope = (uid) => uid || "local";
const surveyKey = (uid, id) => `${scope(uid)}::survey:${id}`;
const surveyPrefix = (uid) => `${scope(uid)}::survey:`;
const settingsKey = (uid) => `${scope(uid)}::settings`;
const vesselProfileKey = (uid) => `${scope(uid)}::vesselProfile`;
const companyProfileKey = (uid) => `${scope(uid)}::companyProfile`;
const surveyorProfileKey = (uid) => `${scope(uid)}::surveyorProfile`;

export async function saveSurveyLocal(uid, survey) {
  survey.updatedAt = Date.now();
  await set(surveyKey(uid, survey.id), survey);
  return survey;
}

export async function getSurveyLocal(uid, id) {
  return (await get(surveyKey(uid, id))) || null;
}

export async function deleteSurveyLocal(uid, id) {
  await del(surveyKey(uid, id));
}

export async function listSurveysLocal(uid) {
  const allKeys = await keys();
  const prefix = surveyPrefix(uid);
  const surveyKeys = allKeys.filter((k) => String(k).startsWith(prefix));
  const surveys = await Promise.all(surveyKeys.map((k) => get(k)));
  return surveys
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getSettings(uid) {
  return (
    (await get(settingsKey(uid))) || {
      decimals: 3,
      standardDensity: 1.025,
      // 'wizard' = Google-Forms-style one-section-at-a-time with Back/Next.
      // 'unfolded' = every section stacked on one scrollable page (the
      // original layout). Toggled from the Dashboard.
      formMode: "wizard",
    }
  );
}

export async function saveSettings(uid, settings) {
  await set(settingsKey(uid), settings);
  return settings;
}

// Vessel profile: reusable ship particulars (name, LBM, LBP, distances,
// certificate/registry info) so the user doesn't have to re-type them for
// every survey.
export async function getVesselProfile(uid) {
  return (
    (await get(vesselProfileKey(uid))) || {
      vesselName: "",
      lbm: null,
      lbp: null,
      dFwd: null,
      dAft: null,
      dMid: 0,
      imoNumber: "",
      callSign: "",
      flag: "",
      grt: null,
      nrt: null,
      dwt: null,
      lightship: null,
    }
  );
}

export async function saveVesselProfile(uid, profile) {
  await set(vesselProfileKey(uid), profile);
  return profile;
}

// Company branding (shown on the report header) + surveyor contact details
// (shown next to the Master/Chief Officer signature line).
export async function getCompanyProfile(uid) {
  return (
    (await get(companyProfileKey(uid))) || {
      name: "",
      country: "",
      email: "",
      logoDataUrl: null, // small base64 image, kept local (and optionally synced)
    }
  );
}

export async function saveCompanyProfile(uid, profile) {
  await set(companyProfileKey(uid), profile);
  return profile;
}

export async function getSurveyorProfile(uid) {
  return (
    (await get(surveyorProfileKey(uid))) || {
      name: "",
      contact: "",
    }
  );
}

export async function saveSurveyorProfile(uid, profile) {
  await set(surveyorProfileKey(uid), profile);
  return profile;
}

// Default receiving/client company (e.g. "Dzata Cement") - pre-fills a new
// Initial survey's Client fields, same convenience pattern as the vessel
// profile. Still fully editable per survey since you may work with
// different clients.
const clientProfileKey = (uid) => `${scope(uid)}::clientProfile`;

export async function getClientProfile(uid) {
  return (
    (await get(clientProfileKey(uid))) || {
      name: "",
      contact: "",
      logoDataUrl: null,
    }
  );
}

export async function saveClientProfile(uid, profile) {
  await set(clientProfileKey(uid), profile);
  return profile;
}