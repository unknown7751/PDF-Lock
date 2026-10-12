import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Clock,
  KeyRound,
  LoaderCircle,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type BadgeKind =
  | "checking"
  | "ready"
  | "needs-input"
  | "blocked"
  | "uploading"
  | "queued"
  | "processing"
  | "success"
  | "failed"
  | "skipped"
  | "cancelled";

const STYLES: Record<BadgeKind, { label: string; icon: LucideIcon; classes: string; spin?: boolean }> = {
  checking: { label: "Checking", icon: LoaderCircle, classes: "border-line text-muted bg-surface-2", spin: true },
  ready: { label: "Ready", icon: CircleCheck, classes: "border-accent/40 text-accent bg-accent-soft" },
  "needs-input": { label: "Needs password", icon: KeyRound, classes: "border-warn/40 text-warn bg-warn-soft" },
  blocked: { label: "Not eligible", icon: Ban, classes: "border-warn/40 text-warn bg-warn-soft" },
  uploading: { label: "Uploading", icon: Upload, classes: "border-accent/40 text-accent bg-accent-soft" },
  queued: { label: "Queued", icon: Clock, classes: "border-line text-muted bg-surface-2" },
  processing: { label: "Processing", icon: LoaderCircle, classes: "border-accent/40 text-accent bg-accent-soft", spin: true },
  success: { label: "Done", icon: CircleCheck, classes: "border-success/40 text-success bg-success-soft" },
  failed: { label: "Failed", icon: CircleAlert, classes: "border-danger/40 text-danger bg-danger-soft" },
  skipped: { label: "Not encrypted", icon: CircleSlash, classes: "border-warn/40 text-warn bg-warn-soft" },
  cancelled: { label: "Cancelled", icon: CircleSlash, classes: "border-line text-muted bg-surface-2" },
};

/** Status chip: icon + text (never colour alone), animated when the status changes. */
export function FileStatusBadge({ kind, label }: { kind: BadgeKind; label?: string }) {
  const s = STYLES[kind];
  const Icon = s.icon;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={kind}
        data-status={kind}
        initial={{ opacity: 0, y: 4, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.94 }}
        transition={{ duration: 0.16 }}
        className={`chip ${s.classes}`}
      >
        <Icon className={`size-3.5 ${s.spin ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
        {label ?? s.label}
      </motion.span>
    </AnimatePresence>
  );
}
