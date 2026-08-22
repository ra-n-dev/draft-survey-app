import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase.js";
import { saveSurveyLocal, listSurveysLocal } from "./localStore.js";

// Firestore path: users/{uid}/surveys/{surveyId}
// Firestore's offline persistence (enabled in firebase.js) means calling
// setDoc while offline resolves immediately from the local cache and queues
// the write; it is sent automatically once the device is back online. We
// still mirror everything into idb-keyval (localStore.js) so the app's own
// UI can read data with zero Firebase dependency at all (fully offline mode
// for users who never sign in / never had Firebase configured).

function surveysCol(uid) {
  return collection(db, "users", uid, "surveys");
}

export async function pushSurveyToCloud(uid, survey) {
  if (!firebaseEnabled || !uid) return;
  const ref = doc(surveysCol(uid), survey.id);
  await setDoc(ref, { ...survey, synced: true }, { merge: true });
}

export async function deleteSurveyFromCloud(uid, surveyId) {
  if (!firebaseEnabled || !uid) return;
  await deleteDoc(doc(surveysCol(uid), surveyId));
}

/**
 * Subscribes to the user's cloud surveys and mirrors every change into the
 * local IndexedDB store, so the local list is always the merged view.
 * Returns an unsubscribe function.
 */
export function subscribeCloudSurveys(uid, onChange) {
  if (!firebaseEnabled || !uid) return () => {};
  const q = query(surveysCol(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    async (snapshot) => {
      const remoteSurveys = snapshot.docs.map((d) => d.data());
      const local = await listSurveysLocal(uid);
      const localById = new Map(local.map((s) => [s.id, s]));

      for (const remote of remoteSurveys) {
        const existing = localById.get(remote.id);
        // Last-write-wins by updatedAt, remote already reflects server state
        if (!existing || (remote.updatedAt || 0) >= (existing.updatedAt || 0)) {
          await saveSurveyLocal(uid, { ...remote, synced: true });
        }
      }
      const merged = await listSurveysLocal(uid);
      onChange(merged);
    },
    (err) => {
      // Offline or permission error - local data remains authoritative
      console.warn("Cloud sync listener error (safe to ignore while offline):", err.message);
    }
  );
}