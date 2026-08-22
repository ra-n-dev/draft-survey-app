import { useAuth } from "../context/AuthContext.jsx";

export default function PendingApprovalPage() {
  const { user, logout } = useAuth();
  return (
    <div className="status-page">
      <div className="status-card">
        <div className="status-icon">⏳</div>
        <h1>Your account is awaiting approval</h1>
        <p className="muted">
          Thank you for signing up, {user?.email}. Your account has been created successfully
          and is currently awaiting approval from the administrator. Please wait — you will be
          notified automatically as soon as it is approved, and your surveys will unlock without
          needing to sign up again.
        </p>
        <button className="btn btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}