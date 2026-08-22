import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { friendlyAuthError } from "./LoginPage.jsx";

// Step 2 of 2. Only succeeds if an admin already approved this exact email
// (see AuthContext.completeSignup + firestore.rules) — this is the moment
// a real Firebase Auth account and profile actually get created.
export default function CompleteSignupPage() {
  const { completeSignup, firebaseEnabled } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await completeSignup(email, password, name, contactNumber);
      nav("/");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Finish creating your account</h1>
        <p className="muted">
          This only works once the administrator has approved your email address. If you
          haven't requested access yet, <Link to="/signup">start here</Link> first.
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
            />
          </label>
          <label className="field">
            <span className="field-label">Email (must match your approved request)</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Choose a password</span>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="banner banner-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || !firebaseEnabled}>
            {busy ? "Creating account…" : "Create my account"}
          </button>
        </form>

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