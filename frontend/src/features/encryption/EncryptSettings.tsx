import { KeyRound } from "lucide-react";
import { AdvancedSettings } from "../../components/AdvancedSettings";
import { NewPasswordFields } from "../../components/NewPasswordFields";
import { SharedPasswordToggle } from "../../components/SharedPasswordToggle";
import type { PasswordConfig } from "../../hooks/usePasswordConfig";
import type { EncryptAdvanced } from "../../lib/schemas";

interface EncryptSettingsProps {
  config: PasswordConfig;
  appliesTo: number;
  errors: { password?: string; confirm?: string };
  showErrors: boolean;
  advanced: EncryptAdvanced;
  onAdvancedChange: (next: EncryptAdvanced) => void;
  confirmBefore: boolean;
  onConfirmBeforeChange: (on: boolean) => void;
}

/** Encrypt-specific batch settings: NEW password (individual or shared), advanced options, confirmation. */
export function EncryptSettings({ config, appliesTo, errors, showErrors, advanced, onAdvancedChange, confirmBefore, onConfirmBeforeChange }: EncryptSettingsProps) {
  const needsOwner = !(advanced.allowPrint && advanced.allowCopy && advanced.allowEdit);
  const advancedError = needsOwner && !advanced.ownerPassword ? "Permission restrictions need an owner password." : undefined;

  return (
    <div className="space-y-4">
      <p className="flex gap-2 text-xs leading-relaxed text-muted">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          Choose a <strong className="text-fg">new</strong> password. It will be required to open the protected copy
          (AES-256 by default).
        </span>
      </p>
      <SharedPasswordToggle checked={config.useShared} onChange={config.setUseShared} operation="encrypt" appliesTo={appliesTo}>
        <NewPasswordFields
          idPrefix="encrypt-shared"
          subject="all PDFs"
          password={config.shared.password}
          confirm={config.shared.confirm}
          onChange={(patch) => config.setShared(patch)}
          passwordError={errors.password}
          confirmError={errors.confirm}
          showErrors={showErrors}
        />
      </SharedPasswordToggle>
      {!config.useShared && <p className="text-xs text-muted">Each PDF card below has its own new password and confirmation.</p>}

      <AdvancedSettings
        idPrefix="encrypt-batch"
        title="Advanced options (all files)"
        value={advanced}
        onChange={onAdvancedChange}
        error={advancedError}
        forceShowError={showErrors}
      />

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={confirmBefore} onChange={(e) => onConfirmBeforeChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Ask me to confirm before encrypting
      </label>
    </div>
  );
}
