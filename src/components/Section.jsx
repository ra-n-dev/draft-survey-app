import { useState } from "react";

export default function Section({ title, subtitle, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button type="button" className="section-header" onClick={() => setOpen((o) => !o)}>
        <div>
          <div className="section-title">
            {title}
            {badge != null && <span className="badge">{badge}</span>}
          </div>
          {subtitle && <div className="section-subtitle">{subtitle}</div>}
        </div>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}
