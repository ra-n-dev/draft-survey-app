import { useRef, useState } from "react";
import { readDraftFromImage, draftVisionEnabled } from "../lib/draftVision.js";

// Deliberately never calls onAccept automatically — the surveyor always has
// to press "Accept" first. This mirrors the "AI extraction -> confidence ->
// human confirmation -> data" pattern rather than letting a model write
// straight into the survey.
export default function DraftPhotoCapture({ label, onAccept }) {
  const fileRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | analyzing | result | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!draftVisionEnabled) return null; // silently hidden until configured

  const reset = () => {
    setPreviewUrl(null);
    setStatus("idle");
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setPreviewUrl(dataUrl);
      setStatus("analyzing");
      setError("");
      try {
        const parsed = await readDraftFromImage(dataUrl);
        setResult(parsed);
        setStatus("result");
      } catch (err) {
        setError(err.message || "Something went wrong reading the photo.");
        setStatus("error");
      }
    };
    reader.readAsDataURL(file);
  };

  const accept = () => {
    if (result?.draft_m != null) onAccept(result.draft_m);
    reset();
  };

  return (
    <div className="draft-photo-capture">
      <button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>
        📷 Snap {label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onFileSelected}
      />

      {previewUrl && (
        <div className="draft-photo-card">
          <img src={previewUrl} alt={`${label} draft mark`} className="draft-photo-thumb" />
          <div className="draft-photo-body">
            {status === "analyzing" && <p className="muted small">Reading draft mark…</p>}

            {status === "error" && <div className="banner banner-error">{error}</div>}

            {status === "result" && result.draft_m != null && (
              <>
                <div className="draft-photo-value">
                  {result.draft_m.toFixed(3)} m
                  <span className="draft-photo-confidence">
                    {Math.round((result.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                {result.needs_human_verification && (
                  <p className="muted small draft-photo-warning">
                    ⚠ Double check this one — {result.reason || "flagged for review."}
                  </p>
                )}
                <div className="draft-photo-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={accept}>
                    ✓ Accept {result.draft_m.toFixed(3)} m
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                    Retake
                  </button>
                </div>
              </>
            )}

            {status === "result" && result.draft_m == null && (
              <>
                <p className="muted small">
                  Couldn't get a clear reading{result.reason ? ` — ${result.reason}` : ""}. Try a
                  closer, more level, better-lit shot.
                </p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  Retake
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}