import { useState } from "react";

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1 4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/**
 * Password input with show/hide toggle (eye icon).
 */
export default function PasswordField({
  id,
  name,
  value,
  onChange,
  onKeyDown,
  autoComplete,
  placeholder,
  style,
  className,
  disabled,
}) {
  const [visible, setVisible] = useState(false);
  const mergedStyle = {
    boxSizing: "border-box",
    width: "100%",
    ...style,
    paddingRight: 44,
  };

  return (
    <div className={`password-field-wrap${className ? ` ${className}` : ""}`}>
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        className="password-field-input"
        style={mergedStyle}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-field-toggle"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        <span className="password-field-toggle-icon">
          {visible ? <IconEyeOff /> : <IconEye />}
        </span>
      </button>
    </div>
  );
}
