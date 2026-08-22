import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import {
  listSurveysLocal,
  saveSurveyLocal,
  deleteSurveyLocal,
  getSettings,
  saveSettings as saveSettingsLocal,
  getVesselProfile,
  saveVesselProfile as saveVesselProfileLocal,
} from "../lib/localStore.js";
import {
  pushSurveyToCloud,
  deleteSurveyFromCloud,
  subscribeCloudSurveys,
} from "../lib/firebaseSync.js";
import { firebaseEnabled } from "../lib/firebase.js";

const SurveyContext = createContext(null);

export function SurveyProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [surveys, setSurveys] = useState([]);
  const [settings, setSettings] = useState({ decimals: 3, standardDensity: 1.025 });
  const [vesselProfile, setVesselProfile] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Load this account's local data. Re-runs whenever the signed-in account
  // changes (uid), so switching users on the same browser/device never
  // shows a stale previous account's surveys or settings — everything is
  // scoped per-uid in localStore.js.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSurveys([]); // clear immediately so a previous account's list never flashes
    (async () => {
      const [s, settingsData, profile] = await Promise.all([
        listSurveysLocal(uid),
        getSettings(uid),
        getVesselProfile(uid),
      ]);
      if (cancelled) return;
      setSurveys(s);
      setSettings(settingsData);
      setVesselProfile(profile);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Cloud subscription whenever a user is signed in
  useEffect(() => {
    if (!firebaseEnabled || !user) return;
    const unsub = subscribeCloudSurveys(user.uid, (merged) => setSurveys(merged));
    return unsub;
  }, [user]);

  const refreshLocal = useCallback(async () => {
    setSurveys(await listSurveysLocal(uid));
  }, [uid]);

  const upsertSurvey = useCallback(
    async (survey) => {
      await saveSurveyLocal(uid, survey);
      await refreshLocal();
      // Only push to the cloud once a survey is actually marked Complete —
      // this keeps every in-progress draft edit purely local (no Firestore
      // writes at all) and only syncs finished, submitted work. Local
      // storage still saves every keystroke regardless, so nothing is lost
      // if the tab closes mid-edit; it just won't appear on another device
      // until "Mark Complete" is pressed.
      if (firebaseEnabled && user && survey.status === "complete") {
        pushSurveyToCloud(user.uid, survey).catch((e) =>
          console.warn("Cloud push deferred (offline):", e.message)
        );
      }
      return survey;
    },
    [user, uid, refreshLocal]
  );

  const removeSurvey = useCallback(
    async (id) => {
      await deleteSurveyLocal(uid, id);
      await refreshLocal();
      if (firebaseEnabled && user) {
        deleteSurveyFromCloud(user.uid, id).catch(() => {});
      }
    },
    [user, uid, refreshLocal]
  );

  const updateSettings = useCallback(
    async (next) => {
      const saved = await saveSettingsLocal(uid, next);
      setSettings(saved);
    },
    [uid]
  );

  const updateVesselProfile = useCallback(
    async (next) => {
      const saved = await saveVesselProfileLocal(uid, next);
      setVesselProfile(saved);
    },
    [uid]
  );

  return (
    <SurveyContext.Provider
      value={{
        surveys,
        loading,
        isOnline,
        settings,
        vesselProfile,
        upsertSurvey,
        removeSurvey,
        updateSettings,
        updateVesselProfile,
      }}
    >
      {children}
    </SurveyContext.Provider>
  );
}

export function useSurveys() {
  return useContext(SurveyContext);
}