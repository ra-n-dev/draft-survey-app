import { useAuth } from "../context/AuthContext.jsx";

export default function AccessBlockedPage({ reason }) {
  const { user, logout } = useAuth();
  const copy =
    reason === "terminated"
      ? "Your access to Draft Survey has been permanently terminated by the administrator."
      : reason === "no-profile"
      ? "We couldn't find an account profile linked to this sign-in. This can happen if your account was created outside the normal sign-up process."
      : "Your access to Draft Survey has been temporarily suspended by the administrator.";

  return (
    <div className="status-page">
      <div className="status-card">
        <div className="status-icon">🚫</div>
        <h1>
          {reason === "terminated"
            ? "Account terminated"
            : reason === "no-profile"
            ? "Account not recognized"
            : "Account suspended"}
        </h1>
        <p className="muted">
          {copy} Signed in as {user?.email}. Please contact your administrator for help.
        </p>
        <button className="btn btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}