import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props {
  label: string;
  name?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}

export function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  autoComplete,
  disabled = false,
}: Props) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200">
        {label}
      </label>

      <div className="relative">
        <input
          name={name}
          type={isPassword && passwordVisible ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 ${isPassword ? "pr-12" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={disabled}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}