import { motion } from "motion/react";
import { CloudOff, LoaderCircle, Square, WifiOff } from "lucide-react";
import type { BatchPhase } from "../hooks/useBatchJob";
import type { Connection } from "../hooks/useJobStream";
import type { JobSnapshot } from "../lib/schemas";
import { AnimatedNumber } from "./AnimatedNumber";

interface BatchProgressProps {
  phase: BatchPhase;
  snapshot: JobSnapshot | null;
  uploadProgress: number;
  connection: Connection;
  cancelling: boolean;
  onCancel: () => void;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" | "busy" }) {
  const color = tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : tone === "busy" ? "text-accent" : "text-fg";
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tracking-tight ${color}`}>
        <AnimatedNumber value={value} />
      </dd>
    </div>
  );
}

/** Live dashboard for a running batch: counters, honest progress bar, cancel. */
export function BatchProgress({ phase, snapshot, uploadProgress, connection, cancelling, onCancel }: BatchProgressProps) {
  const uploading = phase === "uploading";
  const counts = snapshot?.counts;
  const total = counts?.total ?? 0;
  const done = counts ? counts.success + counts.failed + counts.skipped + counts.cancelled : 0;
  const remaining = counts ? counts.queued + counts.processing : 0;

  // Determinate only when we genuinely know the fraction: bytes uploaded, or server-reported file progress.
  const fraction = uploading ? uploadProgress : (snapshot?.overall_progress ?? 0);
  const percent = Math.round(fraction * 100);
  const anyFileProgress = snapshot?.files.some((f) => f.status === "processing" && f.progress != null) ?? false;
  const showDeterminate = uploading || done > 0 || anyFileProgress;

  return (
    <div data-testid="batch-progress">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <LoaderCircle className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
          {uploading ? "Uploading files…" : cancelling ? "Cancelling…" : "Processing files…"}
        </h3>
        <span className="text-sm font-semibold tabular-nums text-muted">{showDeterminate ? `${percent}%` : ""}</span>
      </div>

      <div
        role="progressbar"
        aria-label={uploading ? "Upload progress" : "Overall progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={showDeterminate ? percent : undefined}
        aria-valuetext={showDeterminate ? `${percent} percent` : "In progress"}
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        {showDeterminate ? (
          <motion.div
            className="h-full origin-left rounded-full bg-accent"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 26 }}
          />
        ) : (
          <div className="indeterminate-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />
        )}
      </div>

      {uploading ? (
        <p className="mt-3 text-xs text-muted">Sending your PDFs to the server for processing…</p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Total files" value={total} />
          <Stat label="Completed" value={done} tone="ok" />
          <Stat label="Remaining" value={remaining} tone="busy" />
          <Stat label="Need attention" value={(counts?.failed ?? 0) + (counts?.skipped ?? 0)} tone="bad" />
        </dl>
      )}

      {connection !== "live" && connection !== "idle" && !uploading && (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn"
        >
          {connection === "offline" ? <WifiOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
          {connection === "offline"
            ? "Connection lost. Your files keep processing on the server — we'll reconnect automatically."
            : "Live updates interrupted. Falling back to periodic checks…"}
        </p>
      )}

      <button type="button" className="btn btn-danger mt-4 w-full" onClick={onCancel} disabled={cancelling}>
        <Square className="size-3.5" aria-hidden />
        {uploading ? "Cancel upload" : cancelling ? "Cancelling…" : "Cancel operation"}
      </button>

      <p className="sr-only" role="status" aria-live="polite">
        {uploading ? `Uploading, ${percent} percent.` : `${done} of ${total} files finished.`}
      </p>
    </div>
  );
}
