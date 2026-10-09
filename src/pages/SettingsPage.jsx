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
  getClientProfile,
  saveClientProfile,
} from "../lib/localStore.js";

export default function SettingsPage() {
  const { settings, updateSettings, vesselProfile, updateVesselProfile } = useSurveys();
  const { isAdmin } = useProfile();
  const { user } = useAuth();
  const uid = user?.uid;
  const [company, setCompany] = useState(null);
  const [surveyor, setSurveyor] = useState(null);
  const [client, setClient] = useState(null);

  useEffect(() => {
    (async () => {
      setCompany(await getCompanyProfile(uid));
      setSurveyor(await getSurveyorProfile(uid));
      setClient(await getClientProfile(uid));
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

  const patchClient = async (patch) => {
    const next = { ...client, ...patch };
    setClient(next);
    await saveClientProfile(uid, next);
  };

  // Survey conditions live in the general settings object, next to `decimals`.
  const patchSettings = (patch) => updateSettings({ ...settings, ...patch });

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

  const onClientLogoSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800 * 1024) {
      alert("Please choose a smaller image (under ~800KB) so reports stay fast to load.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patchClient({ logoDataUrl: reader.result });
    reader.readAsDataURL(file);
  };

  if (!vesselProfile || !company || !surveyor || !client) return <div className="page">Loading…</div>;

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
              onChange={(e) => patchSettings({ decimals: Number(e.target.value) })}
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
          <h3>Surveying company details</h3>
          <p className="muted small">
            Your own company. The logo and name appear at the top-left of every report, in place of the
            generic "Draft Survey" heading, and the name is used in the report footer.
          </p>

          <div className="logo-upload-row">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt="Company logo" className="logo-preview" />
            ) : (
              <div className="logo-placeholder">No logo</div>
            )}
            <div>
              <span className="field-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                Surveying company logo
              </span>
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
              <input
                value={company.name || ""}
                onChange={(e) => patchCompany({ name: e.target.value })}
                placeholder="e.g. Worldwide Inspections Ltd"
              />
            </label>
            <label className="field">
              <span className="field-label">Tagline / services (optional)</span>
              <input
                value={company.tagline || ""}
                onChange={(e) => patchCompany({ tagline: e.target.value })}
                placeholder="e.g. Marine & Cargo Surveys"
              />
            </label>
            <label className="field">
              <span className="field-label">Address / city</span>
              <input
                value={company.address || ""}
                onChange={(e) => patchCompany({ address: e.target.value })}
                placeholder="e.g. Tema"
              />
            </label>
            <label className="field">
              <span className="field-label">Country</span>
              <input value={company.country || ""} onChange={(e) => patchCompany({ country: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Company phone</span>
              <input value={company.phone || ""} onChange={(e) => patchCompany({ phone: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Company email</span>
              <input
                type="email"
                value={company.email || ""}
                onChange={(e) => patchCompany({ email: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-body">
          <h3>Survey conditions</h3>
          <p className="muted small">
            Shown in the "Berth &amp; Conditions" box on the report. Update these for each port call; they
            print on every report until you change them.
          </p>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Berth No.</span>
              <input
                value={settings.berthNo || ""}
                onChange={(e) => patchSettings({ berthNo: e.target.value })}
                placeholder="e.g. 2"
              />
            </label>
            <label className="field">
              <span className="field-label">Sea state</span>
              <input
                value={settings.seaState || ""}
                onChange={(e) => patchSettings({ seaState: e.target.value })}
                placeholder="e.g. Calm / Slight"
              />
            </label>
            <label className="field">
              <span className="field-label">Wind</span>
              <input
                value={settings.windState || ""}
                onChange={(e) => patchSettings({ windState: e.target.value })}
                placeholder="e.g. Lt. Airs"
              />
            </label>
            <label className="field">
              <span className="field-label">Temperature (°C)</span>
              <input
                value={settings.temperature ?? ""}
                onChange={(e) => patchSettings({ temperature: e.target.value })}
                placeholder="e.g. 26"
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span className="field-label">Reading accuracy</span>
              <input
                value={settings.readingAccuracy || ""}
                onChange={(e) => patchSettings({ readingAccuracy: e.target.value })}
                placeholder="e.g. +/- 1cm"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-body">
          <h3>Default receiving / client company</h3>
          <p className="muted small">
            The company you're most often surveying for (e.g. Dzata Cement) — pre-fills a new Initial
            Survey's Client fields so you don't retype them every time. Still fully editable per survey
            if you work with a different client.
          </p>

          <div className="logo-upload-row">
            {client.logoDataUrl ? (
              <img src={client.logoDataUrl} alt="Client logo" className="logo-preview" />
            ) : (
              <div className="logo-placeholder">No logo</div>
            )}
            <div>
              <input type="file" accept="image/*" onChange={onClientLogoSelected} />
              {client.logoDataUrl && (
                <button className="btn-link danger" onClick={() => patchClient({ logoDataUrl: null })}>
                  Remove logo
                </button>
              )}
            </div>
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="field-label">Client company name</span>
              <input value={client.name || ""} onChange={(e) => patchClient({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Client contact (email or phone)</span>
              <input value={client.contact || ""} onChange={(e) => patchClient({ contact: e.target.value })} />
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
              <input value={surveyor.name || ""} onChange={(e) => patchSurveyor({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Surveyor contact (phone or email)</span>
              <input value={surveyor.contact || ""} onChange={(e) => patchSurveyor({ contact: e.target.value })} />
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
            <label className="field">
              <span className="field-label">IMO Number</span>
              <input
                value={vesselProfile.imoNumber || ""}
                onChange={(e) => updateVesselProfile({ ...vesselProfile, imoNumber: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Call Sign</span>
              <input
                value={vesselProfile.callSign || ""}
                onChange={(e) => updateVesselProfile({ ...vesselProfile, callSign: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Flag</span>
              <input
                value={vesselProfile.flag || ""}
                onChange={(e) => updateVesselProfile({ ...vesselProfile, flag: e.target.value })}
              />
            </label>
            <NumberField
              label="GRT"
              decimals={0}
              value={vesselProfile.grt}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, grt: x })}
              allowNegative={false}
            />
            <NumberField
              label="NRT"
              decimals={0}
              value={vesselProfile.nrt}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, nrt: x })}
              allowNegative={false}
            />
            <NumberField
              label="DWT"
              decimals={0}
              value={vesselProfile.dwt}
              onChange={(x) => updateVesselProfile({ ...vesselProfile, dwt: x })}
              suffix="t"
              allowNegative={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}