import { KeyRound } from "lucide-react";
import { PasswordInput } from "../../components/PasswordInput";
import { SharedPasswordToggle } from "../../components/SharedPasswordToggle";
import type { PasswordConfig } from "../../hooks/usePasswordConfig";

interface DecryptSettingsProps {
  config: PasswordConfig;
  appliesTo: number;
  error?: string;
  showErrors: boolean;
}

/** Decrypt-specific batch settings: individual vs shared CURRENT password. */
export function DecryptSettings({ config, appliesTo, error, showErrors }: DecryptSettingsProps) {
  return (
    <div className="space-y-4">
      <p className="flex gap-2 text-xs leading-relaxed text-muted">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          Enter each PDF's <strong className="text-fg">current</strong> password. PDFLock only unlocks files with the
          correct password — it never guesses or bypasses it.
        </span>
      </p>
      <SharedPasswordToggle checked={config.useShared} onChange={config.setUseShared} operation="decrypt" appliesTo={appliesTo}>
        <PasswordInput
          id="decrypt-shared-password"
          label="Shared current password"
          value={config.shared.password}
          onChange={(password) => config.setShared({ password })}
          error={error}
          forceShowError={showErrors}
          placeholder="Password used to open all these PDFs"
        />
      </SharedPasswordToggle>
      {!config.useShared && <p className="text-xs text-muted">Each PDF card below has its own password field.</p>}
    </div>
  );
}
