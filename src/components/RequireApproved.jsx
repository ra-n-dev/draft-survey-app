import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import PendingApprovalPage from "../pages/PendingApprovalPage.jsx";
import AccessBlockedPage from "../pages/AccessBlockedPage.jsx";

export default function RequireApproved({ children }) {
  const { user, authLoading, firebaseEnabled } = useAuth();
  const { profile, isAdmin, loading } = useProfile();

  // Since profile status is read via a live Firestore listener, the moment
  // an admin approves someone their screen updates automatically — no
  // re-login needed. This just adds a friendly one-time "You're approved!"
  // flash for that exact transition, then fades itself out on its own.
  const [showApprovedFlash, setShowApprovedFlash] = useState(false);
  const prevStatusRef = useRef(profile?.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = profile?.status;
    if (prev && prev !== "approved" && profile?.status === "approved") {
      setShowApprovedFlash(true);
      const t = setTimeout(() => setShowApprovedFlash(false), 3200);
      return () => clearTimeout(t);
    }
  }, [profile?.status]);

  // If this build has no Firebase project configured at all, there is no
  // account system to gate against — allow local-only offline use so the
  // app is still usable for evaluation/dev purposes.
  if (!firebaseEnabled) return children;

  if (authLoading || loading) return <div className="page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (isAdmin) return children;

  if (!profile) return <div className="page">Setting up your account…</div>;
  if (profile.status === "pending") return <PendingApprovalPage />;
  if (profile.status === "suspended") return <AccessBlockedPage reason="suspended" />;
  if (profile.status === "terminated") return <AccessBlockedPage reason="terminated" />;
  if (profile.status === "no-profile") return <AccessBlockedPage reason="no-profile" />;

  return (
    <>
      {showApprovedFlash && (
        <div className="approval-toast">✓ Your account has been approved — welcome!</div>
      )}
      {children}
    </>
  );
}