import type { EncryptAdvanced } from "../lib/schemas";

export type { EncryptAdvanced, ErrorInfo, FileResult, FileStatus, JobSnapshot, Limits } from "../lib/schemas";

export type Operation = "decrypt" | "encrypt";

export type Inspection =
  | { state: "pending" }
  | { state: "done"; encrypted: boolean | "unknown"; pageCount?: number };

/** A PDF the user selected. Lives in memory only; the File is never read into state. */
export interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  inspection: Inspection;
  /** id of an earlier identical file (same name, size, modified time), if any */
  duplicateOf?: string;
}

/** Per-file password inputs for one operation. Held in memory only. */
export interface FilePasswordEntry {
  password: string;
  confirm: string;
  /** when shared mode is on, this file opts out and uses its own password */
  override: boolean;
  /** encryption only: per-file advanced options (undefined = use batch options) */
  advanced?: EncryptAdvanced;
  showPassword?: boolean;
}

export type RejectionReason = "not_pdf" | "too_large" | "empty" | "limit";

export interface Rejection {
  name: string;
  reason: RejectionReason;
}

export interface AddFilesResult {
  added: QueuedFile[];
  rejected: Rejection[];
  duplicates: string[];
}

export type Theme = "dark" | "light";

export interface Eligibility {
  eligible: boolean;
  /** why a file can't take part in the current operation */
  reason?: string;
}

/** Validation problems for one file; only shown after the user interacts or tries to start. */
export interface FileErrors {
  password?: string;
  confirm?: string;
  options?: string;
}
