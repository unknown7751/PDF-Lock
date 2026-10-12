import type { PasswordConfig } from "../../hooks/usePasswordConfig";
import { encryptPasswordSchema, type EncryptAdvanced } from "../../lib/schemas";
import type { Eligibility, FileErrors, QueuedFile } from "../../types";

export const DEFAULT_ADVANCED: EncryptAdvanced = Object.freeze({
  algorithm: "aes-256",
  ownerPassword: "",
  allowPrint: true,
  allowCopy: true,
  allowEdit: true,
});

export function encryptEligibility(file: QueuedFile): Eligibility {
  if (file.inspection.state === "done" && file.inspection.encrypted === true) {
    return {
      eligible: false,
      reason: "This PDF is already password-protected. Decrypt it first (Decrypt tab), then encrypt it again.",
    };
  }
  return { eligible: true };
}

export const hasRestrictions = (a: EncryptAdvanced) => !(a.allowPrint && a.allowCopy && a.allowEdit);

/** Rules for the owner password / permissions, mirrored from the server. */
export function validateAdvanced(advanced: EncryptAdvanced, userPassword: string): string | undefined {
  if (hasRestrictions(advanced)) {
    if (!advanced.ownerPassword) return "Permission restrictions need an owner password.";
    if (advanced.ownerPassword === userPassword) return "The owner password must differ from the open password.";
  }
  if (advanced.ownerPassword) {
    const probe = encryptPasswordSchema(advanced.algorithm).safeParse(advanced.ownerPassword.padEnd(8, "x"));
    if (!probe.success) return `Owner password: ${probe.error.issues[0]?.message ?? "invalid"}`;
  }
  return undefined;
}

export function validateNewPassword(password: string, algorithm: EncryptAdvanced["algorithm"]): string | undefined {
  const parsed = encryptPasswordSchema(algorithm).safeParse(password);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

/** Validation for the single shared password (and its confirmation). */
export function validateSharedEncrypt(
  shared: { password: string; confirm: string },
  algorithm: EncryptAdvanced["algorithm"],
): { password?: string; confirm?: string } {
  const out: { password?: string; confirm?: string } = {};
  const pw = validateNewPassword(shared.password, algorithm);
  if (pw) out.password = pw;
  if (shared.password !== shared.confirm) out.confirm = "The two passwords don't match.";
  return out;
}

export function validateEncrypt(
  files: QueuedFile[],
  config: PasswordConfig,
  batchAdvanced: EncryptAdvanced,
): Record<string, FileErrors> {
  const errors: Record<string, FileErrors> = {};
  for (const file of files) {
    if (!encryptEligibility(file).eligible) continue;
    const entry = config.entryFor(file.id);
    const advanced = entry.advanced ?? batchAdvanced;
    const { password, confirm } = config.effective(file.id);
    const shared = config.usesShared(file.id);
    const fileErrors: FileErrors = {};

    const pw = validateNewPassword(password, advanced.algorithm);
    if (pw) fileErrors.password = shared ? `Shared password: ${pw}` : pw;
    else if (password !== confirm) fileErrors.confirm = "The two passwords don't match.";

    const options = validateAdvanced(advanced, password);
    if (options) fileErrors.options = options;

    if (fileErrors.password || fileErrors.confirm || fileErrors.options) errors[file.id] = fileErrors;
  }
  return errors;
}
