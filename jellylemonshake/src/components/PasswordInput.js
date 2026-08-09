import React, { useState } from "react";

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  required = false,
  className = "form-input",
  autoComplete,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-container">
      <input
        type={visible ? "text" : "password"}
        id={id}
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
