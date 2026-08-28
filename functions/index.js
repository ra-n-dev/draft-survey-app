// ============================================================================
// readDraftPhoto — the server-side half of the draft-mark photo reader.
//
// This is the fix for the security gap flagged earlier: the Gemini API key
// lives ONLY here, in Firebase Secret Manager, and is never sent to or
// readable from the browser. The client (see src/lib/draftVision.js) sends
// the photo to this function over Firebase's authenticated "callable
// function" protocol; this function checks the caller is a signed-in,
// APPROVED user (mirroring firestore.rules' own access model), then calls
// Gemini on their behalf and returns just the structured JSON result.
//
// Requires the Blaze (pay-as-you-go) plan to deploy at all — Cloud
// Functions aren't available on Spark. See the setup notes at the bottom
// of this file for exact commands.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const PROMPT = `You are reading a ship's draft mark from a photograph taken by a marine surveyor.

Identify the visible draft mark numerals and the waterline in the photo, then calculate the draft reading in metres by interpolating the waterline's position between the two nearest clearly-visible marks.

Respond with ONLY a JSON object, no other text, matching exactly this shape:
{
  "draft_m": number or null,
  "visible_marks": array of strings (e.g. ["6", "7"]),
  "waterline_position": short string description,
  "confidence": number from 0 to 1,
  "needs_human_verification": boolean,
  "reason": short string explaining any uncertainty (empty string if none)
}

Rules:
- If the draft marks or the waterline are not clearly visible, set draft_m to null and needs_human_verification to true, explaining why in "reason".
- If the photo is at a steep angle, blurry, too far away, or the waterline is ambiguous (waves, reflections, poor lighting), lower confidence accordingly and set needs_human_verification to true.
- Never guess a number you are not reasonably confident in — returning null is always better than a wrong reading.`;

exports.readDraftPhoto = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  // 1. Must be signed in at all.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to use this feature.");
  }
  const uid = request.auth.uid;

  // 2. Must be an approved user (or admin) — same rule as everywhere else
  //    in the app. This closes the gap where a "pending"/suspended account
  //    can't reach the UI but could otherwise still call this function
  //    directly if they knew its name.
  const isAdmin = request.auth.token?.admin === true;
  if (!isAdmin) {
    const snap = await admin.firestore().doc(`users/${uid}`).get();
    const status = snap.exists ? snap.data().status : null;
    if (status !== "approved") {
      throw new HttpsError("permission-denied", "Your account isn't approved for this feature yet.");
    }
  }

  // 3. Validate the incoming image.
  const dataUrl = request.data?.imageDataUrl;
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new HttpsError("invalid-argument", "No image provided.");
  }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new HttpsError("invalid-argument", "Image format not recognized.");
  }
  const mimeType = match[1];
  const base64Data = match[2];

  // 4. Call Gemini server-side — the API key never leaves this function.
  const model = "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY.value()}`;

  const geminiBody = {
    contents: [
      {
        parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64Data } }],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    throw new HttpsError("unavailable", `Could not reach the vision model: ${err.message}`);
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new HttpsError("internal", `Vision model request failed (${resp.status}). ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new HttpsError("internal", "The vision model returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpsError("internal", "Couldn't understand the model's response — please try again.");
  }

  return {
    draft_m: typeof parsed.draft_m === "number" ? parsed.draft_m : null,
    visible_marks: Array.isArray(parsed.visible_marks) ? parsed.visible_marks : [],
    waterline_position: parsed.waterline_position || "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    needs_human_verification: Boolean(parsed.needs_human_verification),
    reason: parsed.reason || "",
  };
});

// ============================================================================
// ONE-TIME SETUP (run these from your project root, not inside functions/):
//
//   cd functions
//   npm install
//   cd ..
//
//   1. Get a free Gemini API key: https://aistudio.google.com/apikey
//   2. Store it as a secret (never goes in your code or .env):
//        firebase functions:secrets:set GEMINI_API_KEY
//      (paste the key when prompted)
//   3. Deploy:
//        firebase deploy --only functions
//
// Requires the Blaze plan (Firebase console -> gear icon -> Usage and
// billing -> Modify plan). Cloud Functions include 2 million free
// invocations/month even on Blaze - a single-surveyor app will not incur
// real cost at this scale.
// ============================================================================