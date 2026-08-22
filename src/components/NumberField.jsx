import { useState, useEffect } from "react";

// Plain <input type="number"> hides the minus sign on iOS/Android numeric
// keyboards (inputMode="decimal"/"numeric" pads don't include "-"), which
// made it impossible to type negative values (e.g. perpendicular distances,
// LCF) on a phone. This version uses a text input with manual validation
// plus an explicit "±" toggle button, so negative entry always works
// regardless of what keyboard the OS decides to show.
export default function NumberField({
  label,
  value,
  onChange,
  decimals = 3,
  suffix,
  placeholder,
  required,
  hint,
  allowNegative = true,
}) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));

  // Keep local text in sync if the value changes from outside (e.g. reset)
  useEffect(() => {
    const asString = value === null || value === undefined ? "" : String(value);
    setText((prev) => (Number(prev) === value ? prev : asString));
  }, [value]);

  const commit = (raw) => {
    setText(raw);
    if (raw === "" || raw === "-" || raw === ".") {
      onChange(null);
      return;
    }
    const num = Number(raw);
    if (!Number.isNaN(num)) onChange(num);
  };

  const handleChange = (e) => {
    let v = e.target.value;
    // Keep only digits, at most one leading minus, at most one decimal point
    v = v.replace(/[^0-9.-]/g, "");
    const negative = allowNegative && v.startsWith("-");
    v = v.replace(/-/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    }
    commit((negative ? "-" : "") + v);
  };

  const toggleSign = () => {
    if (text.startsWith("-")) commit(text.slice(1));
    else commit("-" + text);
  };

  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      <div className="field-input-wrap">
        {allowNegative && (
          <button
            type="button"
            className="sign-toggle"
            onClick={toggleSign}
            aria-label="Toggle negative"
            tabIndex={-1}
          >
            {text.startsWith("-") ? "−" : "±"}
          </button>
        )}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          placeholder={placeholder ?? (0).toFixed(decimals)}
          value={text}
          onChange={handleChange}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
