import { AnimatePresence, motion } from "motion/react";
import { CloudOff, Files, Lock, LockOpen, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BatchProgress } from "../../components/BatchProgress";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DownloadActions } from "../../components/DownloadActions";
import { NamingOptions } from "../../components/NamingOptions";
import { OperationTabs, tabDomId } from "../../components/OperationTabs";
import { PDFDropzone } from "../../components/PDFDropzone";
import { PDFFileCard } from "../../components/PDFFileCard";
import { ProcessingSummary, summaryText } from "../../components/ProcessingSummary";
import { useBatchJob } from "../../hooks/useBatchJob";
import { useFileQueue } from "../../hooks/useFileQueue";
import { usePasswordConfig } from "../../hooks/usePasswordConfig";
import { formatBytes, formatCountdown, plural } from "../../lib/format";
import { defaultNaming, previewName, resolveSuffix, validateNaming, type NamingState } from "../../lib/naming";
import type { Limits } from "../../lib/schemas";
import type { Operation, Rejection } from "../../types";
import { decryptEligibility, validateDecrypt } from "../decryption/validation";
import { DecryptSettings } from "../decryption/DecryptSettings";
import { EncryptSettings } from "../encryption/EncryptSettings";
import { DEFAULT_ADVANCED, encryptEligibility, validateEncrypt } from "../encryption/validation";
import { validateSharedDecrypt } from "../decryption/validation";
import { validateSharedEncrypt } from "../encryption/validation";
import { buildJobArgs, buildRetryItems, PERMANENT_FAILURES } from "./buildJob";
import type { LimitsStatus } from "../../hooks/useServerLimits";

const PANEL_ID = "workspace-panel";

interface WorkspaceProps {
  limits: Limits;
  limitsStatus: LimitsStatus;
  onReloadLimits: () => void;
  openPickerRef: { current: (() => void) | null };
}

function describeRejections(rejected: Rejection[], limits: Limits): { title: string; description: string } {
  const names = (r: Rejection[]) => r.slice(0, 3).map((x) => `“${x.name}”`).join(", ") + (r.length > 3 ? ` and ${r.length - 3} more` : "");
  const lines: string[] = [];
  const by = (reason: Rejection["reason"]) => rejected.filter((r) => r.reason === reason);
  if (by("not_pdf").length) lines.push(`${names(by("not_pdf"))} ${by("not_pdf").length === 1 ? "isn't a valid PDF" : "aren't valid PDFs"}.`);
  if (by("too_large").length) lines.push(`${names(by("too_large"))} exceed${by("too_large").length === 1 ? "s" : ""} the ${formatBytes(limits.max_file_size_bytes)} limit.`);
  if (by("empty").length) lines.push(`${names(by("empty"))} ${by("empty").length === 1 ? "is" : "are"} empty.`);
  if (by("limit").length) lines.push(`Only ${plural(limits.max_files, "file")} fit in one batch — ${by("limit").length} not added.`);
  return { title: `${plural(rejected.length, "file")} not added`, description: lines.join(" ") };
}

function ExpiryNotice({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = expiresAt * 1000 - now;
  return (
    <p className="mt-3 text-center text-xs text-muted" data-testid="expiry">
      {left > 0 ? `Files are deleted from the server in ${formatCountdown(left)}.` : "These files are about to be deleted from the server."}
    </p>
  );
}

export function Workspace({ limits, limitsStatus, onReloadLimits, openPickerRef }: WorkspaceProps) {
  const [operation, setOperation] = useState<Operation>("decrypt");
  const queue = useFileQueue(limits);
  const decryptPw = usePasswordConfig();
  const encryptPw = usePasswordConfig();
  const config = operation === "decrypt" ? decryptPw : encryptPw;
  const [naming, setNaming] = useState<Record<Operation, NamingState>>({
    decrypt: defaultNaming("decrypt"),
    encrypt: defaultNaming("encrypt"),
  });
  const [batchAdvanced, setBatchAdvanced] = useState(DEFAULT_ADVANCED);
  const [confirmBefore, setConfirmBefore] = useState(true);
  const [dialog, setDialog] = useState<null | "encrypt" | "newBatch" | "clearQueue">(null);
  const [showErrors, setShowErrors] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const batch = useBatchJob();
  const { phase, snapshot } = batch;
  const locked = phase !== "idle";

  /* ------------------------------------------------------------ derived state */
  const eligibilityOf = operation === "decrypt" ? decryptEligibility : encryptEligibility;
  const eligibility = useMemo(
    () => Object.fromEntries(queue.files.map((f) => [f.id, eligibilityOf(f)])),
    [queue.files, eligibilityOf],
  );
  const eligibleFiles = useMemo(() => queue.files.filter((f) => eligibility[f.id]?.eligible), [queue.files, eligibility]);

  const fileErrors = useMemo(
    () => (operation === "decrypt" ? validateDecrypt(eligibleFiles, config) : validateEncrypt(eligibleFiles, config, batchAdvanced)),
    [operation, eligibleFiles, config, batchAdvanced],
  );
  const sharedUsers = eligibleFiles.filter((f) => config.usesShared(f.id)).length;
  const sharedErrors = useMemo(() => {
    if (!config.useShared || sharedUsers === 0) return {};
    return operation === "decrypt"
      ? { password: validateSharedDecrypt(config.shared.password) }
      : validateSharedEncrypt(config.shared, batchAdvanced.algorithm);
  }, [config.useShared, config.shared, sharedUsers, operation, batchAdvanced.algorithm]);

  const namingError = validateNaming(operation, naming[operation]);
  const suffix = resolveSuffix(operation, naming[operation]);
  const invalidCount = Object.keys(fileErrors).length;
  const readyCount = eligibleFiles.length - invalidCount;
  const blockedCount = queue.files.length - eligibleFiles.length;

  const startBlocker = useMemo(() => {
    if (queue.files.length === 0) return "Add at least one PDF to get started.";
    if (eligibleFiles.length === 0) return "None of the selected PDFs can be used for this operation.";
    if (queue.isInspecting) return "Checking your files…";
    if (invalidCount > 0)
      return operation === "decrypt"
        ? `${plural(invalidCount, "file")} still ${invalidCount === 1 ? "needs" : "need"} a password.`
        : `${plural(invalidCount, "file")} ${invalidCount === 1 ? "has" : "have"} password or option problems to fix.`;
    if (namingError) return namingError;
    return null;
  }, [queue.files.length, eligibleFiles.length, queue.isInspecting, invalidCount, namingError, operation]);

  const results = snapshot?.files ?? [];
  const resultFor = (clientId: string) => results.find((r) => r.client_id === clientId);
  const retryable = results.filter((r) => r.status === "cancelled" || (r.status === "failed" && !PERMANENT_FAILURES.has(r.error?.code ?? "")));

  /* ------------------------------------------------------------ side effects */
  useEffect(() => {
    if (!batch.error) return;
    toast.error(batch.error.message, { description: batch.error.hint ?? undefined });
  }, [batch.error]);

  useEffect(() => {
    if (batch.expired) toast.warning("Your results expired", { description: "The files were deleted from the server. Start a new batch to process them again." });
  }, [batch.expired]);

  // The control panel changes height between settings / progress / summary; keep it in view
  // so a phone user isn't left looking at some other part of the page.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (phase !== "uploading" && phase !== "finished") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // wait for the panel's cross-fade to finish so we measure its final height
    const id = window.setTimeout(
      () => asideRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }),
      reduce ? 0 : 420,
    );
    return () => window.clearTimeout(id);
  }, [phase]);

  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current === "processing" && phase === "finished" && snapshot) {
      setAnnouncement(summaryText(snapshot));
      const attention = snapshot.counts.failed + snapshot.counts.skipped;
      if (attention === 0 && snapshot.counts.success > 0) toast.success("All files processed", { description: summaryText(snapshot) });
      else toast.message("Batch finished", { description: summaryText(snapshot) });
    }
    prevPhase.current = phase;
  }, [phase, snapshot]);

  /* ------------------------------------------------------------ handlers */
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (locked) return;
      const { added, rejected, duplicates } = await queue.addFiles(files);
      if (rejected.length) {
        const { title, description } = describeRejections(rejected, limits);
        toast.error(title, { description });
      }
      if (duplicates.length) {
        toast.warning("Possible duplicate files", {
          description: `${duplicates.slice(0, 3).map((n) => `“${n}”`).join(", ")} look identical to files you already added. Remove the extra copy if it's a mistake.`,
        });
      }
      if (added.length) setAnnouncement(`${plural(added.length, "file")} added.`);
    },
    [locked, queue, limits],
  );

  const removeFile = (id: string) => {
    queue.removeFile(id);
    const keep = queue.files.filter((f) => f.id !== id).map((f) => f.id);
    decryptPw.prune(keep);
    encryptPw.prune(keep);
  };

  const run = async () => {
    setDialog(null);
    const ok = await batch.start(buildJobArgs({ operation, files: eligibleFiles, config, batchAdvanced, nameSuffix: suffix }));
    if (ok) setShowErrors(false);
  };

  const requestStart = () => {
    if (phase !== "idle") return;
    if (startBlocker) {
      setShowErrors(true);
      toast.warning("Can't start yet", { description: startBlocker });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace [aria-invalid="true"]')?.focus());
      return;
    }
    if (operation === "encrypt" && confirmBefore) setDialog("encrypt");
    else void run();
  };

  const retry = async (targets: typeof results) => {
    if (targets.length === 0) return;
    const items = buildRetryItems(operation, targets, config, batchAdvanced);
    if (operation === "decrypt" && items.some((i) => !i.password)) {
      toast.warning("Enter a password first", { description: "Type the correct password for each file you want to retry." });
      return;
    }
    await batch.retry(items);
  };

  const startNewBatch = async () => {
    setDialog(null);
    await batch.discard();
    queue.clear();
    decryptPw.reset();
    encryptPw.reset();
    setShowErrors(false);
    toast.success("Cleared", { description: "Results were deleted from the server." });
  };

  const switchOperation = (op: Operation) => {
    if (locked) return;
    setOperation(op);
    setShowErrors(false);
  };

  const nameOf = (id?: string) => queue.files.find((f) => f.id === id)?.name;
  const sample = eligibleFiles[0]?.name;

  /* ------------------------------------------------------------ render */
  return (
    <section id="workspace" aria-labelledby="workspace-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
      <div className="mb-6">
        <h2 id="workspace-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your workspace
        </h2>
        <p className="mt-2 max-w-2xl text-muted">Pick an operation, add your PDFs, set the passwords — then process everything in one go.</p>
      </div>

      {limitsStatus === "unreachable" && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          <CloudOff className="size-4 shrink-0 text-warn" aria-hidden />
          <p className="min-w-0 flex-1 text-warn">
            Can't reach the PDFLock server. You can prepare files, but processing needs the backend to be running.
          </p>
          <button type="button" className="btn btn-secondary min-h-11" onClick={onReloadLimits}>
            <RefreshCw className="size-4" aria-hidden />
            Retry connection
          </button>
        </div>
      )}

      <OperationTabs value={operation} onChange={switchOperation} disabled={locked} panelId={PANEL_ID} />
      {locked && (
        <p className="mt-2 text-center text-xs text-muted">Operation is locked while this batch is active. Clear the results to start a new one.</p>
      )}

      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabDomId(operation)}
        tabIndex={-1}
        className="mt-6 grid items-start gap-6 outline-none lg:grid-cols-[minmax(0,1fr)_390px]"
      >
        {/* ------------------------------------------------ left: files */}
        <div className="min-w-0 space-y-4">
          {!locked && (
            <PDFDropzone
              onFiles={handleFiles}
              maxFileSize={limits.max_file_size_bytes}
              maxFiles={limits.max_files}
              fileCount={queue.files.length}
              openRef={openPickerRef}
            />
          )}

          {queue.files.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Files className="size-4 text-accent" aria-hidden />
                  {plural(queue.files.length, "PDF")}
                  {!locked && blockedCount > 0 && <span className="text-muted">· {blockedCount} not eligible</span>}
                </p>
                {!locked && (
                  <button
                    type="button"
                    className="btn btn-ghost min-h-11 text-xs"
                    onClick={() => (queue.files.length > 1 ? setDialog("clearQueue") : (queue.clear(), decryptPw.reset(), encryptPw.reset()))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Clear all
                  </button>
                )}
              </div>
              <ul className="space-y-3" aria-label="Selected PDFs">
                <AnimatePresence initial mode="popLayout">
                  {queue.files.map((file, index) => (
                    <PDFFileCard
                      key={file.id}
                      index={index}
                      file={file}
                      operation={operation}
                      phase={phase}
                      result={resultFor(file.id)}
                      eligibility={eligibility[file.id] ?? { eligible: true }}
                      entry={config.entryFor(file.id)}
                      usesShared={config.usesShared(file.id)}
                      sharedEnabled={config.useShared}
                      errors={fileErrors[file.id]}
                      showErrors={showErrors}
                      batchAdvanced={batchAdvanced}
                      duplicateOfName={nameOf(file.duplicateOf)}
                      onChange={(patch) => config.updateEntry(file.id, patch)}
                      onRemove={() => removeFile(file.id)}
                      onRetry={() => {
                        const r = resultFor(file.id);
                        if (r) void retry([r]);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            !locked && (
              <p className="px-2 text-center text-sm text-muted">
                No files yet. Your PDFs stay in this tab until you process them — switching between Decrypt and Encrypt keeps them.
              </p>
            )
          )}
        </div>

        {/* ------------------------------------------------ right: control panel */}
        <aside ref={asideRef} aria-label="Batch controls" className="card scroll-mt-24 self-start p-5 lg:sticky lg:top-24">
          <AnimatePresence mode="wait" initial={false}>
            {phase === "uploading" || phase === "processing" ? (
              <motion.div key="progress" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <BatchProgress
                  phase={phase}
                  snapshot={snapshot}
                  uploadProgress={batch.uploadProgress}
                  connection={batch.connection}
                  cancelling={batch.cancelling}
                  onCancel={() => void batch.cancel()}
                />
              </motion.div>
            ) : phase === "finished" && snapshot ? (
              <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                <ProcessingSummary snapshot={snapshot} />
                <div className="mt-5">
                  <DownloadActions
                    zipUrl={snapshot.zip_url}
                    successCount={snapshot.counts.success}
                    retryableCount={retryable.length}
                    canRetry={phase === "finished"}
                    onRetryFailed={() => void retry(retryable)}
                    onNewBatch={() => setDialog("newBatch")}
                  />
                </div>
                <ExpiryNotice expiresAt={snapshot.expires_at} />
              </motion.div>
            ) : (
              <motion.div
                key={`settings-${operation}`}
                initial={{ opacity: 0, x: operation === "encrypt" ? 14 : -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: operation === "encrypt" ? -14 : 14 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  {operation === "decrypt" ? <LockOpen className="size-4.5 text-accent" aria-hidden /> : <Lock className="size-4.5 text-accent" aria-hidden />}
                  {operation === "decrypt" ? "Decrypt settings" : "Encrypt settings"}
                </h3>

                {operation === "decrypt" ? (
                  <DecryptSettings
                    config={decryptPw}
                    appliesTo={sharedUsers}
                    error={sharedErrors.password}
                    showErrors={showErrors}
                  />
                ) : (
                  <EncryptSettings
                    config={encryptPw}
                    appliesTo={sharedUsers}
                    errors={sharedErrors}
                    showErrors={showErrors}
                    advanced={batchAdvanced}
                    onAdvancedChange={setBatchAdvanced}
                    confirmBefore={confirmBefore}
                    onConfirmBeforeChange={setConfirmBefore}
                  />
                )}

                <NamingOptions
                  operation={operation}
                  value={naming[operation]}
                  onChange={(v) => setNaming((n) => ({ ...n, [operation]: v }))}
                  sampleName={sample}
                  forceShowError={showErrors}
                />

                {/* ready summary */}
                <div className="rounded-xl border border-line bg-surface-2/50 p-4" data-testid="ready-summary">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-accent" aria-hidden />
                    Ready to process
                  </p>
                  <p className="mt-1 text-sm text-muted" aria-live="polite">
                    <span className="font-semibold text-fg">{readyCount}</span> of {plural(queue.files.length, "file")} ready
                    {invalidCount > 0 && <> · {invalidCount} need input</>}
                    {blockedCount > 0 && <> · {blockedCount} not eligible</>}
                  </p>
                  {readyCount > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {eligibleFiles
                        .filter((f) => !fileErrors[f.id])
                        .slice(0, 4)
                        .map((f) => (
                          <li key={f.id} className="truncate font-mono">
                            {f.name} → <span className="text-fg">{previewName(f.name, namingError ? "" : suffix)}</span>
                          </li>
                        ))}
                      {readyCount > 4 && <li>…and {readyCount - 4} more</li>}
                    </ul>
                  )}
                </div>

                <div>
                  <button type="button" className="btn btn-primary min-h-12 w-full text-base" onClick={requestStart} aria-describedby="start-hint">
                    {operation === "decrypt" ? <LockOpen className="size-4.5" aria-hidden /> : <Lock className="size-4.5" aria-hidden />}
                    {operation === "decrypt" ? "Decrypt" : "Encrypt"} {readyCount > 0 ? plural(readyCount, "PDF") : "PDFs"}
                  </button>
                  <p id="start-hint" className="mt-2 text-center text-xs text-muted">
                    {startBlocker ?? "Your PDFs are sent to the server for processing and deleted afterwards."}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="announcer">
        {announcement}
      </p>

      <ConfirmDialog
        open={dialog === "encrypt"}
        title={`Encrypt ${plural(readyCount, "PDF")}?`}
        description="Each file will be uploaded and protected with the password you set. Keep the passwords safe — PDFLock can't recover a lost password."
        confirmLabel="Encrypt now"
        onConfirm={() => void run()}
        onCancel={() => setDialog(null)}
      >
        {blockedCount > 0 && <p className="text-xs text-muted">{plural(blockedCount, "file")} that can't be encrypted will be skipped.</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "newBatch"}
        tone="danger"
        title="Clear results and start a new batch?"
        description="Processed files will be deleted from the server and your passwords cleared from this page. Make sure you've downloaded everything you need."
        confirmLabel="Clear everything"
        onConfirm={() => void startNewBatch()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "clearQueue"}
        tone="danger"
        title={`Remove all ${queue.files.length} PDFs?`}
        description="They'll be removed from this page along with any passwords you entered. Nothing has been uploaded yet."
        confirmLabel="Remove all"
        onConfirm={() => {
          queue.clear();
          decryptPw.reset();
          encryptPw.reset();
          setShowErrors(false);
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    </section>
  );
}
