import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/format";

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "off" avoids browsers offering unrelated saved logins; "new-password" for choosing a password */
  autoComplete?: "off" | "new-password";
  error?: string;
  /** show the error immediately instead of waiting for the field to be touched */
  forceShowError?: boolean;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  /** extra control rendered beside the field (e.g. the password generator) */
  trailing?: ReactNode;
  /** visually hide the label but keep it for screen readers */
  hideLabel?: boolean;
  /** each input owns its visibility toggle; pass to start revealed */
  startRevealed?: boolean;
  /** increment to reveal the value programmatically (e.g. after generating a password) */
  revealSignal?: number;
}

/** Labelled password field with its own independent show/hide toggle. */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete = "off",
  error,
  forceShowError = false,
  hint,
  placeholder,
  disabled,
  trailing,
  hideLabel,
  startRevealed = false,
  revealSignal = 0,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(startRevealed);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (revealSignal > 0) setRevealed(true);
  }, [revealSignal]);
  const showError = Boolean(error) && (touched || forceShowError);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={cn("mb-1.5 block text-sm font-medium text-fg", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type={revealed ? "text" : "password"}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            aria-invalid={showError}
            aria-describedby={cn(hint && hintId, showError && errorId) || undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            className="field pr-12 font-mono tracking-wide"
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-fg"
          >
            {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {trailing}
      </div>
      {hint && !showError && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {showError && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
