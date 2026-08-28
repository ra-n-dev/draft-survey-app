// ============================================================================
// DRAFT MARK PHOTO READER (client side)
//
// This file no longer talks to any AI vision API directly - it calls your
// own Firebase Cloud Function (functions/index.js), which holds the Gemini
// API key server-side and is never sent to the browser. This closes the
// security gap from the first version of this feature: nothing secret ever
// touches client code or DevTools' Network tab.
//
// The person still has to press "Accept" before the returned reading goes
// anywhere near the actual survey (see DraftPhotoCapture.jsx) - the
// "confidence, then human confirmation" pattern is unchanged.
//
// Setup: see the comment block at the bottom of functions/index.js.
// ============================================================================

import { httpsCallable } from "firebase/functions";
import { functions, firebaseEnabled } from "./firebase.js";

// The Snap buttons only appear once Firebase itself is configured, since
// the Cloud Function lives inside your Firebase project. If the function
// hasn't actually been deployed yet (see setup steps), calling it will
// fail with a clear error shown inline rather than a crash.
export const draftVisionEnabled = firebaseEnabled;

/**
 * @param {string} dataUrl - base64 data URL of the photographed draft mark
 * @returns {Promise<{draft_m: number|null, visible_marks: string[], waterline_position: string, confidence: number, needs_human_verification: boolean, reason: string}>}
 */
export async function readDraftFromImage(dataUrl) {
  if (!firebaseEnabled) {
    throw new Error("Cloud sync isn't configured on this build, so photo reading isn't available.");
  }

  const callReadDraftPhoto = httpsCallable(functions, "readDraftPhoto");

  try {
    const result = await callReadDraftPhoto({ imageDataUrl: dataUrl });
    return result.data;
  } catch (err) {
    // Firebase callable errors carry a friendly .message already (set by
    // HttpsError on the function side) - surface it directly.
    if (err.code === "functions/unauthenticated") {
      throw new Error("Please sign in again to use photo reading.");
    }
    if (err.code === "functions/permission-denied") {
      throw new Error("Your account isn't approved for this feature yet.");
    }
    if (err.code === "functions/not-found") {
      throw new Error(
        "Photo reading isn't set up yet — the readDraftPhoto Cloud Function hasn't been deployed. See functions/index.js for setup steps."
      );
    }
    throw new Error(err.message || "Something went wrong reading the photo.");
  }
}