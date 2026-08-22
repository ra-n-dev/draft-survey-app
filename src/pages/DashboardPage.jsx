import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { newSurvey } from "../lib/surveyModel.js";
import { getSurveyorProfile } from "../lib/localStore.js";

const PLAN_LABELS = {
  monthly: "Monthly plan",
  annual: "Annual plan",
  commission: "Commission plan",
};

// Prefer a real first name (Firebase Auth displayName, or the Firestore
// profile's displayName) over showing someone's raw email address.
function firstNameOf(user, profile) {
  const full = user?.displayName || profile?.displayName || "";
  const first = full.trim().split(/\s+/)[0];
  return first || user?.email || "";
}

export default function DashboardPage() {
  const { surveys, isOnline, removeSurvey, upsertSurvey, vesselProfile } = useSurveys();
  const { user, firebaseEnabled, logout } = useAuth();
  const { profile, isAdmin } = useProfile();
  const nav = useNavigate();
  const [surveyorProfile, setSurveyorProfile] = useState(null);

  useEffect(() => {
    getSurveyorProfile(user?.uid).then(setSurveyorProfile);
  }, [user?.uid]);

  const startNew = async (type) => {
    const s = newSurvey(type);

    // Convenience defaults for the surveyor line — still editable per survey.
    if (surveyorProfile) {
      s.surveyorName = surveyorProfile.name || "";
      s.surveyorContact = surveyorProfile.contact || "";
    }

    if (type === "initial") {
      if (vesselProfile) {
        s.vesselName = vesselProfile.vesselName || "";
        s.vessel = {
          lbm: vesselProfile.lbm,
          lbp: vesselProfile.lbp,
          dFwd: vesselProfile.dFwd,
          dAft: vesselProfile.dAft,
          dMid: vesselProfile.dMid ?? 0,
        };
        if (vesselProfile.lightship != null) s.lightship = vesselProfile.lightship;
      }
    } else {
      // Final survey: copy identity + geometry EXACTLY from the specific
      // linked Initial survey (not the generic vessel profile) — LBM, LBP,
      // and the perpendicular distances are fixed ship particulars that
      // cannot differ between the two surveys of the same voyage.
      const initials = surveys.filter((sv) => sv.type === "initial" && sv.status === "complete");
      if (initials.length) {
        const linked = initials[0];
        s.linkedInitialId = linked.id;
        s.lightship = linked.lightship;
        s.constant = linked.constant;
        s.vesselName = linked.vesselName;
        s.voyageNo = linked.voyageNo;
        s.port = linked.port;
        s.vessel = { ...linked.vessel };
        s.clientCompany = linked.clientCompany;
        s.clientContact = linked.clientContact;
        s.chiefOfficerName = linked.chiefOfficerName;
      }
    }

    await upsertSurvey(s);
    nav(`/survey/${s.id}`);
  };

  const displayName = firstNameOf(user, profile);

  return (
    <div className="page dashboard-shell">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Draft Survey</h1>
            <span className={`status-pill ${isOnline ? "online" : "offline"}`}>
              {isOnline ? "● Online" : "○ Offline — saved on this device"}
            </span>
            {profile?.plan && (
              <span className="plan-badge">
                {PLAN_LABELS[profile.plan] || profile.plan}
                {profile.plan !== "commission" && profile.planAmount != null && ` · ${profile.planAmount}`}
              </span>
            )}
            {isAdmin && <span className="plan-badge">Admin</span>}
          </div>
        </div>
        <nav className="header-actions">
          <Link to="/settings" className="btn btn-ghost-invert">
            Settings
          </Link>
          {isAdmin && (
            <Link to="/admin" className="btn btn-ghost-invert">
              Admin Panel
            </Link>
          )}
          {firebaseEnabled && user ? (
            <button className="btn btn-ghost-invert" onClick={logout}>
              Sign out ({displayName})
            </button>
          ) : (
            <Link to="/login" className="btn btn-ghost-invert">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <div className="new-survey-buttons">
        <button className="btn btn-primary" onClick={() => startNew("initial")}>
          + New Initial Survey
        </button>
        <button className="btn btn-secondary" onClick={() => startNew("final")}>
          + New Final Survey
        </button>
      </div>

      <h2 className="section-heading">Your surveys</h2>
      <div className="survey-scroll-area">
        {surveys.length === 0 ? (
          <p className="muted">No surveys yet. Start an Initial Survey (empty/ballast condition) first.</p>
        ) : (
          <ul className="survey-list">
            {surveys.map((s) => (
              <li key={s.id} className="survey-card">
                <Link to={`/survey/${s.id}`} className="survey-card-main">
                  <div className="survey-card-title">
                    {s.vesselName || "Unnamed vessel"} — {s.type === "initial" ? "Initial" : "Final"} Survey
                  </div>
                  <div className="survey-card-meta">
                    {new Date(s.updatedAt).toLocaleString()} · {s.status === "complete" ? "Complete" : "Draft"}{" "}
                    {s.synced ? "· ☁ Synced" : "· 📱 Local only"}
                  </div>
                </Link>
                <div className="survey-card-actions">
                  <Link to={`/report/${s.id}`} className="btn-link">
                    Report
                  </Link>
                  <button className="btn-link danger" onClick={() => removeSurvey(s.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="app-footer">
        Powered by <strong>Doripal-Tech</strong> · 0541994034
      </footer>
    </div>
  );
}