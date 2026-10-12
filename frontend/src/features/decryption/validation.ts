import type { PasswordConfig } from "../../hooks/usePasswordConfig";
import { decryptPasswordSchema } from "../../lib/schemas";
import type { Eligibility, FileErrors, QueuedFile } from "../../types";

export function decryptEligibility(file: QueuedFile): Eligibility {
  if (file.inspection.state === "done" && file.inspection.encrypted === false) {
    return {
      eligible: false,
      reason: "This PDF isn't password-protected, so there's nothing to decrypt. Remove it or use it as it is.",
    };
  }
  return { eligible: true };
}

export function validateSharedDecrypt(password: string): string | undefined {
  const parsed = decryptPasswordSchema.safeParse(password);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

/** Every eligible file must resolve to a non-empty existing password. */
export function validateDecrypt(files: QueuedFile[], config: PasswordConfig): Record<string, FileErrors> {
  const errors: Record<string, FileErrors> = {};
  for (const file of files) {
    if (!decryptEligibility(file).eligible) continue;
    const { password } = config.effective(file.id);
    const message = validateSharedDecrypt(password);
    if (message) {
      errors[file.id] = {
        password: config.usesShared(file.id) ? "Enter the shared password above." : message,
      };
    }
  }
  return errors;
}
