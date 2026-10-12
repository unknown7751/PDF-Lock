import { motion, useReducedMotion } from "motion/react";
import { CircleAlert, ShieldAlert } from "lucide-react";
import type { JobSnapshot } from "../lib/schemas";
import { plural } from "../lib/format";
import { AnimatedNumber } from "./AnimatedNumber";

/** Short phrase used for both the visible heading and the screen-reader announcement. */
export function summaryText(snapshot: JobSnapshot): string {
  const { counts } = snapshot;
  const processed = counts.total;
  const attention = counts.failed + counts.skipped;
  const parts = [`${counts.success} successful`];
  if (attention) parts.push(`${attention} need${attention === 1 ? "s" : ""} attention`);
  if (counts.cancelled) parts.push(`${counts.cancelled} cancelled`);
  return `${plural(processed, "file")} processed — ${parts.join(", ")}.`;
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  return { x: Math.cos(angle) * (46 + (i % 3) * 10), y: Math.sin(angle) * (46 + (i % 3) * 10), size: 4 + (i % 3) * 2 };
});

/** Completion celebration: a drawn check with a ring pulse and a particle burst. */
function CompletionBadge({ allGood }: { allGood: boolean }) {
  const reduce = useReducedMotion();
  const color = allGood ? "var(--success)" : "var(--warn)";
  return (
    <div className="relative flex size-20 shrink-0 items-center justify-center" aria-hidden data-testid="completion-badge">
      {!reduce &&
        allGood &&
        PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, background: i % 2 ? "var(--accent)" : color }}
            initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.4 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
          />
        ))}
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: color }}
          initial={{ scale: 0.6, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      )}
      <motion.svg
        viewBox="0 0 52 52"
        className="size-16"
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <circle cx="26" cy="26" r="23" fill="none" stroke={color} strokeWidth="3" opacity="0.28" />
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
        {allGood ? (
          <motion.path
            d="M15 27.5 22.5 35 37 18.5"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.35, ease: "easeOut" }}
          />
        ) : (
          <motion.path
            d="M26 14v15M26 36.5v.5"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          />
        )}
      </motion.svg>
    </div>
  );
}

export function ProcessingSummary({ snapshot }: { snapshot: JobSnapshot }) {
  const { counts } = snapshot;
  const attention = counts.failed + counts.skipped;
  const allGood = attention === 0 && counts.cancelled === 0 && counts.success > 0;
  const hasSignature = snapshot.files.some((f) => f.warnings.includes("signature"));
  const text = summaryText(snapshot);

  return (
    <div data-testid="processing-summary">
      <div className="flex items-center gap-4">
        <CompletionBadge allGood={allGood} />
        <div className="min-w-0">
          <h3 className="text-base leading-snug font-semibold" role="status" aria-live="polite">
            {text}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {allGood
              ? "Everything is ready to download."
              : counts.success > 0
                ? "Download what's ready, and fix the rest below."
                : "Nothing was processed successfully — see the details on each file."}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-success/30 bg-success-soft py-2.5">
          <dt className="text-xs text-muted">Successful</dt>
          <dd className="text-xl font-semibold text-success">
            <AnimatedNumber value={counts.success} />
          </dd>
        </div>
        <div className="rounded-xl border border-danger/30 bg-danger-soft py-2.5">
          <dt className="text-xs text-muted">Need attention</dt>
          <dd className="text-xl font-semibold text-danger">
            <AnimatedNumber value={attention} />
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 py-2.5">
          <dt className="text-xs text-muted">Cancelled</dt>
          <dd className="text-xl font-semibold">
            <AnimatedNumber value={counts.cancelled} />
          </dd>
        </div>
      </dl>

      {hasSignature && (
        <p className="mt-4 flex gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Some PDFs contain digital signatures. Modifying a document can invalidate its signature.
        </p>
      )}
      {!allGood && attention > 0 && (
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          One problem file never blocks the others — the rest of your batch finished normally.
        </p>
      )}
    </div>
  );
}
