import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";

export default function RequireAdmin({ children }) {
  const { user, authLoading, firebaseEnabled } = useAuth();
  const { isAdmin, loading } = useProfile();

  if (!firebaseEnabled) return <Navigate to="/" replace />;
  if (authLoading || loading) return <div className="page">Loading…</div>;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return children;
}
