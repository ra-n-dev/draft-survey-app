import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login, firebaseEnabled } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
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
        <h1>Draft Survey</h1>
        <p className="muted">Sign in to sync your surveys across devices.</p>

        {!firebaseEnabled && (
          <div className="banner banner-warning">
            Cloud sync isn't configured on this build yet. You can still use the app fully offline -{" "}
            <Link to="/">continue without an account</Link>.
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="banner banner-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || !firebaseEnabled}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="muted small">
          No account? <Link to="/signup">Request access</Link>
        </p>
        <p className="muted small">
          Already approved? <Link to="/complete-signup">Finish creating your account</Link>
        </p>
        <p className="muted small">
          <Link to="/">Continue offline without signing in →</Link>
        </p>

        <footer className="app-footer">
          Powered by <strong>Doripal-Tech</strong> · 0541994034
        </footer>
      </div>
    </div>
  );
}

export function friendlyAuthError(err) {
  const code = err?.code || "";
  const message = (err?.message || "").toLowerCase();
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Incorrect email or password.";
  if (code.includes("email-already-in-use")) return "An account already exists with that email.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("network-request-failed")) return "No internet connection - try again when you're online, or continue offline.";
  if (code.includes("permission-denied") || message.includes("insufficient permissions") || message.includes("missing or insufficient"))
    return "We couldn't finish setting up your account just now. Please try again in a moment.";
  if (code === "not-approved") return err.message;
  return "Something went wrong. Please try again.";
}