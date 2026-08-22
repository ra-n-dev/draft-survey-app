# Draft Survey — Offline-First PWA

A marine draft survey calculator + report generator that works fully offline,
installs like a native app on iPhone and Android, and syncs to your own
Firebase project when online.

It implements the full calculation chain: mean drafts → apparent trim →
perpendicular corrections → true drafts/trim → Quarter Mean → hydrostatic
table interpolation (Displacement/TPC/LCF) → MTC⁺/MTC⁻ interpolation → trim
corrections → displacement (trim) → density correction → displacement
(density) → deductibles → Net Displacement → Constant (Initial) or Cargo
figures (Final).

## 1. Run it locally

```bash
npm install
npm run dev
```
Open the printed local URL (usually http://localhost:5173). The app works
immediately with **zero Firebase configuration** — everything is saved to
IndexedDB on your device. Accounts/sync are optional, added in step 2.

## 2. Connect your own Firebase project (accounts + cross-device sync)

1. Go to https://console.firebase.google.com → **Add project** (free "Spark"
   plan is enough to start).
2. In your project: **Build → Authentication → Get started → Sign-in method
   → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** → start in
   **production mode** (the security rules below lock it down properly).
4. **Project settings (gear icon) → General → Your apps → Web (</> icon)**.
   Register an app (nickname doesn't matter, no hosting needed yet). Firebase
   shows you a `firebaseConfig` object — copy those values.
5. In this project, copy `.env.example` to `.env` and paste the values in:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

6. Deploy the security rules so users can only ever read/write **their own**
   surveys (already written for you in `firestore.rules`):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore     # choose your project, keep default file names
   firebase deploy --only firestore:rules
   ```

   Or paste the contents of `firestore.rules` directly into
   **Firestore → Rules** in the console and click **Publish**.

7. Restart `npm run dev`. The Sign in / Create account screens will now work.
   Data is written to `users/{yourUid}/surveys/{surveyId}` — nobody else can
   read it, including you from a different account, because of the rule
   `request.auth.uid == userId`.

**How offline sync actually works:** Firestore's client SDK is initialized
with `persistentLocalCache` (see `src/lib/firebase.js`). That means writes
made while offline are queued in the browser's IndexedDB automatically and
flushed to the server the instant connectivity returns — there is no custom
retry logic to maintain. On top of that, this app *also* keeps its own
independent IndexedDB store (`src/lib/localStore.js`) so the app is 100%
usable — creating, editing, and generating reports — even for someone who
never signs in or whose Firebase project isn't configured at all.

## 3. Deploy it somewhere reachable (needed before "installing" on a phone)

Any static host works. Easiest is Firebase Hosting since you already have a
project:

```bash
npm run build
firebase init hosting     # public directory: dist, single-page app: yes
firebase deploy --only hosting
```

You'll get a URL like `https://your-project.web.app`. Vercel/Netlify also
work — just point them at this repo with build command `npm run build` and
output directory `dist`.

> A PWA's offline support and installability require **HTTPS** (or
> localhost). Firebase Hosting, Vercel, and Netlify all give you this for
> free automatically.

## 4. Install it on your phone

**iPhone (Safari):**
1. Open your deployed URL in Safari (must be Safari, not Chrome, for iOS).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. It now opens full-screen from your home screen, works offline, and shows
   an "● Online / ○ Offline" indicator so you always know your sync state.

**Android (Chrome):**
1. Open your deployed URL in Chrome.
2. Tap the **⋮** menu → **Install app** (or you'll see an automatic
   "Add Draft Survey to Home screen" banner).
3. It installs like a native app with its own icon.

Once installed, close your data connection entirely and reopen the app —
every screen, all your saved surveys, and new entries continue to work. When
you're back online (and signed in), sync happens automatically in the
background.

## 5. Using the app

1. **Dashboard** → **New Initial Survey** for the empty/light condition, or
   **New Final Survey** for the loaded condition (it auto-links to your most
   recent completed Initial Survey to pull in Light Ship & Constant).
2. Work through the sections in order — draft readings, vessel geometry,
   hydrostatic table brackets (QM1/QM3), MTC⁺/MTC⁻ brackets, density,
   deductibles. Every computed figure updates live as you type, and a banner
   at the top always tells you exactly which figures are still missing.
3. Add ballast/fresh-water tanks individually (volume × density is summed
   automatically) or just type in a known total if that's easier — either
   works, and an override total always wins if both are filled in.
4. **Settings** lets you set the decimal precision used everywhere (0–4
   places) and store default vessel particulars so you don't retype LBM/LBP
   each time.
5. Once every required figure is filled in, **Mark Complete & View Report**
   opens a clean printable report. **Print / Save as PDF** uses your phone's
   native share sheet/print dialog to produce a real PDF.

## Project structure

```
src/
  lib/
    calculations.js   — pure calculation engine (unit-testable, no UI/Firebase deps)
    surveyModel.js     — default survey data shape
    localStore.js       — IndexedDB (offline source of truth)
    firebase.js          — Firebase init (safe no-op if unconfigured)
    firebaseSync.js       — push/pull surveys to/from Firestore
  context/
    AuthContext.jsx     — sign up / sign in / sign out
    SurveyContext.jsx    — local-first CRUD + background cloud sync
  pages/                  — Dashboard, Survey form, Report, Settings, Login, Signup
  components/               — reusable form/result pieces
firestore.rules               — per-user data isolation
```

## Verifying the calculation engine

`src/lib/calculations.js` was checked against the worked example (LBM
178.8 m, LBP 181 m, drafts 4.60/4.65, 5.10/5.15, 5.99/6.00) and reproduces
True Trim = 1.387 m, QM2 = 5.171, and Net Displacement ≈ 8,778 t, matching
the handwritten workings.
