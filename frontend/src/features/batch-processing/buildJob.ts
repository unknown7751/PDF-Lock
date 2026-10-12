import { toEncryptWire, type CreateJobArgs, type RetryWireItem, type WireFile } from "../../lib/api";
import type { EncryptAdvanced, FileResult } from "../../lib/schemas";
import type { PasswordConfig } from "../../hooks/usePasswordConfig";
import type { Operation, QueuedFile } from "../../types";

interface BuildInput {
  operation: Operation;
  /** only eligible files */
  files: QueuedFile[];
  config: PasswordConfig;
  batchAdvanced: EncryptAdvanced;
  nameSuffix: string;
}

/** Turn the workspace state into the multipart job request. Each file keeps its own password/options. */
export function buildJobArgs({ operation, files, config, batchAdvanced, nameSuffix }: BuildInput): Omit<
  CreateJobArgs,
  "signal" | "onUploadProgress"
> {
  return {
    operation,
    nameSuffix,
    files: files.map((f) => {
      const wire: WireFile = { client_id: f.id, password: config.effective(f.id).password };
      if (operation === "encrypt") wire.encrypt = toEncryptWire(config.entryFor(f.id).advanced ?? batchAdvanced);
      return { file: f.file, wire };
    }),
  };
}

/**
 * Items for "retry failed". A file that was given its own password in the retry field uses it;
 * otherwise the previously effective (own or shared) password is reused, which suits transient failures.
 */
export function buildRetryItems(
  operation: Operation,
  failed: FileResult[],
  config: PasswordConfig,
  batchAdvanced: EncryptAdvanced,
): RetryWireItem[] {
  return failed.map((r) => {
    const entry = config.entryFor(r.client_id);
    const password = entry.override && entry.password ? entry.password : config.effective(r.client_id).password;
    const item: RetryWireItem = { file_id: r.id, password };
    if (operation === "encrypt") item.encrypt = toEncryptWire(entry.advanced ?? batchAdvanced);
    return item;
  });
}

/** Failure codes where trying again can't help without changing the file itself. */
export const PERMANENT_FAILURES = new Set([
  "corrupt_pdf",
  "not_a_pdf",
  "file_too_large",
  "empty_file",
  "too_many_pages",
  "unsupported_encryption",
  "already_encrypted",
]);

/** Failures that are fixed by entering a different password. */
export const PASSWORD_FAILURES = new Set(["invalid_password", "password_required", "owner_password_required"]);
