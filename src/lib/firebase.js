import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// ---------------------------------------------------------------------------
// PUT YOUR OWN FIREBASE PROJECT CONFIG HERE.
// Get this from: Firebase Console -> Project Settings -> General -> "Your apps"
// -> Web app -> SDK setup and configuration.
// It is safe to ship these values in client code (they are not secret) -
// your data is protected by Firestore Security Rules, not by hiding this
// object. See firestore.rules in the project root.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, auth, db, functions;

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  // This is what gives us "works offline, syncs automatically when online":
  // Firestore keeps a persistent local cache (IndexedDB-backed). Writes made
  // offline are queued locally and automatically flushed to the server the
  // moment connectivity returns - no custom sync code required.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  // Used by src/lib/draftVision.js to call the readDraftPhoto Cloud
  // Function - this is what keeps the Gemini API key server-side instead
  // of exposed in the browser bundle. See functions/index.js.
  functions = getFunctions(app);
} else {
  // No Firebase config supplied - app still works 100% offline using
  // IndexedDB (see localStore.js). Auth/sync screens will show a notice.
  console.warn(
    "[draft-survey-app] Firebase config missing - running in offline-only mode. " +
      "Add your Firebase keys to a .env file to enable account sync (see README)."
  );
}

export { app, auth, db, functions };