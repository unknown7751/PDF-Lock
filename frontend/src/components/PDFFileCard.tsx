import { motion } from "motion/react";
import { CircleAlert, FileText, KeyRound, Lock, RefreshCw, ShieldAlert, Users, X } from "lucide-react";
import { useId } from "react";
import { PASSWORD_FAILURES, PERMANENT_FAILURES } from "../features/batch-processing/buildJob";
import type { BatchPhase } from "../hooks/useBatchJob";
import { cn, formatBytes, plural } from "../lib/format";
import type { EncryptAdvanced, FileResult } from "../lib/schemas";
import type { Eligibility, FileErrors, FilePasswordEntry, Operation, QueuedFile } from "../types";
import { AdvancedSettings } from "./AdvancedSettings";
import { DownloadButton } from "./DownloadActions";
import { FileStatusBadge, type BadgeKind } from "./FileStatusBadge";
import { PasswordInput } from "./PasswordInput";
import { NewPasswordFields } from "./NewPasswordFields";

export interface PDFFileCardProps {
  index: number;
  file: QueuedFile;
  operation: Operation;
  phase: BatchPhase;
  result?: FileResult;
  eligibility: Eligibility;
  entry: FilePasswordEntry;
  /** the shared password is what will be applied to this file */
  usesShared: boolean;
  /** shared-password mode is switched on for this operation */
  sharedEnabled: boolean;
  errors?: FileErrors;
  showErrors: boolean;
  batchAdvanced: EncryptAdvanced;
  duplicateOfName?: string;
  onChange: (patch: Partial<FilePasswordEntry>) => void;
  onRemove: () => void;
  onRetry: () => void;
}

function badgeKind(p: PDFFileCardProps): BadgeKind {
  if (p.result) return p.result.status;
  if (!p.eligibility.eligible) return "blocked";
  if (p.phase === "uploading") return "uploading";
  if (p.file.inspection.state === "pending") return "checking";
  return p.errors ? "needs-input" : "ready";
}

/** One uploaded PDF: its status, its own password inputs and its own result. */
export function PDFFileCard(props: PDFFileCardProps) {
  const { index, file, operation, phase, result, eligibility, entry, usesShared, sharedEnabled, errors, showErrors, batchAdvanced, duplicateOfName, onChange, onRemove, onRetry } = props;
  const baseId = useId();
  const editing = phase === "idle" && !result;
  const kind = badgeKind(props);
  const inspection = file.inspection;
  const locked = Boolean(result) || phase !== "idle";
  const canRemove = !result && phase === "idle";

  const meta = [
    formatBytes(file.size),
    inspection.state === "done" && inspection.pageCount ? plural(inspection.pageCount, "page") : null,
    inspection.state === "done" && inspection.encrypted === true ? "Password-protected" : null,
    inspection.state === "done" && inspection.encrypted === false ? "Not protected" : null,
  ].filter(Boolean);

  const retryable = result?.status === "failed" && !PERMANENT_FAILURES.has(result.error?.code ?? "");
  const needsNewPassword = result?.status === "failed" && PASSWORD_FAILURES.has(result.error?.code ?? "");

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 340, damping: 30, delay: Math.min(index, 8) * 0.045 }}
      className="card glow-hover list-none p-4 sm:p-5"
      data-testid="file-card"
      aria-label={file.name}
    >
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <FileText className="size-5" aria-hidden />
          {inspection.state === "done" && inspection.encrypted === true && (
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-line bg-surface">
              <Lock className="size-3" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FileStatusBadge kind={kind} />
            {file.duplicateOf && duplicateOfName && (
              <span className="chip border-warn/40 bg-warn-soft text-warn" title="Same name, size and date as an earlier file">
                <CircleAlert className="size-3.5" aria-hidden />
                Possible duplicate
              </span>
            )}
          </div>
        </div>
        {canRemove && (
          <button type="button" className="btn-icon -mt-1 -mr-1" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* eligibility */}
      {!eligibility.eligible && !result && (
        <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {eligibility.reason}
        </p>
      )}

      {/* processing progress */}
      {result?.status === "processing" && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label={`Processing ${file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={result.progress ?? undefined}
            className="relative h-1.5 overflow-hidden rounded-full bg-surface-2"
          >
            {result.progress != null ? (
              <motion.div
                className="h-full origin-left rounded-full bg-accent"
                initial={false}
                animate={{ width: `${result.progress}%` }}
                transition={{ duration: 0.25 }}
              />
            ) : (
              <div className="indeterminate-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {result.progress != null ? `${result.progress}% written` : "Working on it…"}
          </p>
        </div>
      )}

      {/* password configuration */}
      {editing && eligibility.eligible && (
        <div className="mt-4 border-t border-line pt-4">
          {usesShared ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="chip border-accent/40 bg-accent-soft text-accent">
                <Users className="size-3.5" aria-hidden />
                Shared password applies
              </p>
              <button type="button" className="btn btn-ghost min-h-11 text-xs" onClick={() => onChange({ override: true })}>
                <KeyRound className="size-3.5" aria-hidden />
                Use a different password
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sharedEnabled && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="chip border-warn/40 bg-warn-soft text-warn">Own password (overrides shared)</p>
                  <button type="button" className="btn btn-ghost min-h-11 text-xs" onClick={() => onChange({ override: false })}>
                    <Users className="size-3.5" aria-hidden />
                    Use the shared password
                  </button>
                </div>
              )}

              {operation === "decrypt" ? (
                <PasswordInput
                  id={`${baseId}-pw`}
                  label={`Current password for ${file.name}`}
                  value={entry.password}
                  onChange={(password) => onChange({ password })}
                  error={errors?.password}
                  forceShowError={showErrors}
                  hint="The password currently required to open this PDF."
                  placeholder="Existing password"
                />
              ) : (
                <NewPasswordFields
                  idPrefix={baseId}
                  subject={file.name}
                  password={entry.password}
                  confirm={entry.confirm}
                  onChange={onChange}
                  passwordError={errors?.password}
                  confirmError={errors?.confirm}
                  showErrors={showErrors}
                />
              )}
            </div>
          )}

          {operation === "encrypt" && (
            <div className="mt-3">
              <AdvancedSettings
                idPrefix={`${baseId}-adv`}
                title={entry.advanced ? "Custom options for this file" : "Options for this file (using batch options)"}
                value={entry.advanced ?? batchAdvanced}
                onChange={(advanced) => onChange({ advanced })}
                error={errors?.options}
                forceShowError={showErrors}
              />
              {entry.advanced && (
                <button type="button" className="btn btn-ghost mt-1 min-h-11 text-xs" onClick={() => onChange({ advanced: undefined })}>
                  Reset to batch options
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* result */}
      {result && (result.status === "failed" || result.status === "skipped" || result.status === "cancelled") && result.error && (
        <div className={cn("mt-4 rounded-xl border p-3.5", result.status === "failed" ? "border-danger/40 bg-danger-soft" : "border-warn/40 bg-warn-soft")} data-testid="file-error">
          <p className={cn("flex items-start gap-2 text-sm font-semibold", result.status === "failed" ? "text-danger" : "text-warn")}>
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.error.message}
          </p>
          {result.error.hint && <p className="mt-1 pl-6 text-xs leading-relaxed text-muted">{result.error.hint}</p>}

          {needsNewPassword && (
            <div className="mt-3 pl-6">
              <PasswordInput
                id={`${baseId}-retry`}
                label={`Try another password for ${file.name}`}
                value={entry.override ? entry.password : ""}
                onChange={(password) => onChange({ password, override: true })}
                placeholder="Enter the correct password"
              />
            </div>
          )}
          {retryable && (
            <div className="mt-3 pl-6">
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                <RefreshCw className="size-4" aria-hidden />
                Retry this file
              </button>
            </div>
          )}
        </div>
      )}

      {result?.status === "success" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-3.5" data-testid="file-success">
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-success" title={result.output_name ?? ""}>
              {result.output_name}
            </p>
            <p className="text-xs text-muted">{result.output_size ? formatBytes(result.output_size) : ""}</p>
          </div>
          <DownloadButton result={result} />
        </div>
      )}
      {result?.warnings.includes("signature") && (
        <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This PDF contains a digital signature. Re-saving a document changes its bytes, so the signature may no longer validate.
        </p>
      )}
      {locked && !result && phase !== "idle" && eligibility.eligible && (
        <p className="mt-3 text-xs text-muted">Waiting for the server…</p>
      )}
    </motion.li>
  );
}
