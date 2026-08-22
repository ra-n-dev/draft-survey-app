import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { friendlyAuthError } from "./LoginPage.jsx";

// Step 1 of 2. This does NOT create an account or a password — it only
// submits a request that an admin must approve before any Firebase Auth
// account or profile document is ever created (see firestore.rules and
// AuthContext.requestAccess). Nothing resembling a real account exists
// until the person completes step 2 on /complete-signup, which only
// succeeds once approved.
export default function SignupPage() {
  const { requestAccess, firebaseEnabled } = useAuth();
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestAccess(name, email, contactNumber);
      setSubmitted(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="status-icon">✓</div>
          <h1>Request received</h1>
          <p className="muted">
            Thank you, {name || "there"}. Your request to join has been sent to the
            administrator for approval. No account has been created yet — once approved,
            come back here and complete your sign-up with the same email address.
          </p>
          <Link to="/complete-signup" className="btn btn-primary" style={{ display: "inline-flex" }}>
            I've been approved — finish signing up
          </Link>
          <p className="muted small" style={{ marginTop: "1rem" }}>
            <Link to="/login">← Back to sign in</Link>
          </p>
          <footer className="app-footer">
            Powered by <strong>Doripal-Tech</strong> · 0541994034
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Request access</h1>
        <p className="muted">
          Submit your details below. An administrator will review your request — you'll
          create your password only after it's approved.
        </p>

        {!firebaseEnabled && (
          <div className="banner banner-warning">
            Cloud sync isn't configured on this build yet. See the README to connect Firebase.
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Contact number</span>
            <input
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="+233 ..."
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <div className="banner banner-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || !firebaseEnabled}>
            {busy ? "Sending request…" : "Request access"}
          </button>
        </form>

        <p className="muted small">
          Already approved? <Link to="/complete-signup">Finish creating your account</Link>
        </p>
        <p className="muted small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>

        <footer className="app-footer">
          Powered by <strong>Doripal-Tech</strong> · 0541994034
        </footer>
      </div>
    </div>
  );
}