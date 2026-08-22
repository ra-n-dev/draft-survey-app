// One-time bootstrap script: grants a user the "admin" custom claim.
//
// This runs LOCALLY on your machine using a Firebase service account key —
// it is never part of the deployed app, and the app's client code never
// sees or contains this key. This is what makes admin status impossible
// for a regular user to fake or grant themselves.
//
// SETUP (only needed once):
//   1. npm install firebase-admin --save-dev
//   2. Firebase Console -> Project settings -> Service accounts
//      -> "Generate new private key" -> save the downloaded JSON file
//      somewhere OUTSIDE this project folder (or make sure it's gitignored —
//      see the entry already added to .gitignore). NEVER commit this file
//      or put it in src/ or public/.
//
// USAGE:
//   node scripts/setAdmin.mjs /path/to/serviceAccountKey.json you@example.com
//
// You must sign out and back in to the app afterwards for the change to
// take effect (custom claims are baked into the auth token at sign-in).

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [, , keyPath, identifier] = process.argv;

if (!keyPath || !identifier) {
  console.error(
    "Usage: node scripts/setAdmin.mjs /path/to/serviceAccountKey.json you@example.com"
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

const user = identifier.includes("@")
  ? await auth.getUserByEmail(identifier)
  : await auth.getUser(identifier);

await auth.setCustomUserClaims(user.uid, { admin: true });

// Keep the Firestore profile doc consistent with the claim, so the admin
// also shows up correctly as "approved" everywhere in the UI. This does
// NOT grant admin by itself — the custom claim above is what the security
// rules and the app actually check.
await db.doc(`users/${user.uid}`).set(
  { role: "admin", status: "approved", email: user.email, updatedAt: new Date() },
  { merge: true }
);

console.log(`✓ ${user.email} (${user.uid}) is now an admin.`);
console.log("  Sign out and back in on that account for it to take effect.");
