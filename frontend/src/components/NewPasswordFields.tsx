import { Copy, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generatePassword } from "../lib/passwords";
import { PasswordInput } from "./PasswordInput";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

interface NewPasswordFieldsProps {
  idPrefix: string;
  /** appended to the labels for screen readers, e.g. "invoice.pdf" or "all PDFs" */
  subject: string;
  password: string;
  confirm: string;
  onChange: (patch: { password?: string; confirm?: string }) => void;
  passwordError?: string;
  confirmError?: string;
  showErrors: boolean;
  disabled?: boolean;
}

/**
 * Fields for choosing a NEW password (encryption): input + confirmation, strength feedback,
 * a cryptographically random generator and a copy button.
 */
export function NewPasswordFields({ idPrefix, subject, password, confirm, onChange, passwordError, confirmError, showErrors, disabled }: NewPasswordFieldsProps) {
  const [revealSignal, setRevealSignal] = useState(0);

  const generate = () => {
    const pw = generatePassword(20);
    onChange({ password: pw, confirm: pw });
    setRevealSignal((n) => n + 1);
    toast.success("Strong password generated", { description: "Copy it and store it somewhere safe — it can't be recovered." });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied to clipboard");
    } catch {
      toast.error("Couldn't copy automatically", { description: "Select the password and copy it manually." });
    }
  };

  return (
    <div className="space-y-3">
      <PasswordInput
        id={`${idPrefix}-new`}
        label={`New password for ${subject}`}
        value={password}
        onChange={(v) => onChange({ password: v })}
        autoComplete="new-password"
        error={passwordError}
        forceShowError={showErrors}
        revealSignal={revealSignal}
        disabled={disabled}
        hint="A new password — whoever opens the protected PDF will have to type it."
        placeholder="Choose a strong password"
        trailing={
          <div className="flex gap-1">
            <button type="button" className="btn-icon border border-line" onClick={generate} disabled={disabled} aria-label={`Generate a strong password for ${subject}`} title="Generate a strong password">
              <Wand2 className="size-4" aria-hidden />
            </button>
            <button type="button" className="btn-icon border border-line" onClick={copy} disabled={disabled || !password} aria-label={`Copy the new password for ${subject}`} title="Copy password">
              <Copy className="size-4" aria-hidden />
            </button>
          </div>
        }
      />
      <PasswordStrengthIndicator password={password} />
      <PasswordInput
        id={`${idPrefix}-confirm`}
        label={`Confirm new password for ${subject}`}
        value={confirm}
        onChange={(v) => onChange({ confirm: v })}
        autoComplete="new-password"
        error={confirmError}
        forceShowError={showErrors}
        revealSignal={revealSignal}
        disabled={disabled}
        placeholder="Type it again"
      />
    </div>
  );
}
