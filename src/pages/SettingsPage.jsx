import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSurveys } from "../context/SurveyContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import NumberField from "../components/NumberField.jsx";
import {
  getCompanyProfile,
  saveCompanyProfile,
  getSurveyorProfile,
  saveSurveyorProfile,
} from "../lib/localStore.js";

export default function SettingsPage() {
  const { settings, updateSettings, vesselProfile, updateVesselProfile } = useSurveys();
  const { isAdmin } = useProfile();
  const { user } = useAuth();
  const uid = user?.uid;
  const [company, setCompany] = useState(null);
  const [surveyor, setSurveyor] = useState(null);

  useEffect(() => {
    (async () => {
      setCompany(await getCompanyProfile(uid));
      setSurveyor(await getSurveyorProfile(uid));
    })();
  }, [uid]);

  const patchCompany = async (patch) => {
    const next = { ...company, ...patch };
    setCompany(next);
    await saveCompanyProfile(uid, next);
  };

  const patchSurveyor = async (patch) => {
    const next = { ...surveyor, ...patch };
    setSurveyor(next);
    await saveSurveyorProfile(uid, next);
  };

  const onLogoSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800 * 1024) {
      alert("Please choose a smaller image (under ~800KB) so reports stay fast to load.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patchCompany({ logoDataUrl: reader.result });
    reader.readAsDataURL(file);
  };

  if (!vesselProfile || !company || !surveyor) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <Link to="/" className="back-link">
              ← Dashboard
            </Link>
            <h1>Settings</h1>
          </div>
        </div>
        {isAdmin && (
          <div className="header-actions">
            <Link to="/admin" className="btn btn-ghost-invert">
              Admin Panel
            </Link>
          </div>
        )}
      </header>

      <div className="section">
        <div className="section-body">
          <h3>Display precision</h3>
          <label className="field">
            <span className="field-label">Decimal places for all figures</span>
            <select
              value={settings.decimals}
              onChange={(e) => updateSettings({ ...settings, decimals: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="section">
        <div className="section-body">
          <h3>Company details</h3>
          <p className="muted small">Shown at the top of every generated report.</p>

          <div className="logo-upload-row">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt="Company logo" className="logo-preview" />
            ) : (
              <div className="logo-placeholder">No logo</div>
            )}
            <div>
              <input type="file" accept="image/*" onChange={onLogoSelected} />
              {company.logoDataUrl && (
                <button className="btn-link danger" onClick={() => patchCompany({ logoDataUrl: null })}>
                  Remove logo
                </button>
              )}
            </div>
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="field-label">Company name</span>
              <input value={company.name} onChange={(e) => patchCompany({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Country</span>
              <input value={company.country} onChange={(e) => patchCompany({ country: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Company email</span>
              <input type="email" value={company.email} onChange={(e) => patchCompany({ email: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-body">
          <h3>Surveyor details</h3>
          <p className="muted small">Shown next to the signature line on every report.</p>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Surveyor name</span>
              <input value={surveyor.name} onChange={(e) => patchSurveyor({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Surveyor contact (phone or email)</span>
              <input value={surveyor.contact} onChange={(e) => patchSurveyor({ contact: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-body">
          <h3>Default vessel particulars</h3>
          <p className="muted small">Pre-fills every new survey so you don't re-enter geometry each time.</p>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Vessel name</span>
              <input
                value={vesselProfile.vesselName || ""}
                onChange={(e) => updateVesselProfile({ ...vesselProfile, vesselName: e.target.value })}
              />
            </label>
            <NumberField
              label="LBM"
              value={vesselProfile.lbm}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, lbm: x })}
              suffix="m"
              allowNegative={false}
            />
            <NumberField
              label="LBP"
              value={vesselProfile.lbp}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, lbp: x })}
              suffix="m"
              allowNegative={false}
            />
            <NumberField
              label="Fwd perpendicular → Fwd mark"
              value={vesselProfile.dFwd}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, dFwd: x })}
              suffix="m"
            />
            <NumberField
              label="Aft mark → Aft perpendicular"
              value={vesselProfile.dAft}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, dAft: x })}
              suffix="m"
            />
            <NumberField
              label="Light Ship"
              value={vesselProfile.lightship}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, lightship: x })}
              suffix="t"
              allowNegative={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}