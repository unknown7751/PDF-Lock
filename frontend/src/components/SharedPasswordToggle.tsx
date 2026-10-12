import { AnimatePresence, motion } from "motion/react";
import { Users } from "lucide-react";
import { useId, type ReactNode } from "react";
import { plural } from "../lib/format";
import type { Operation } from "../types";

interface SharedPasswordToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  operation: Operation;
  /** number of files the shared password would apply to (excluding overrides) */
  appliesTo: number;
  disabled?: boolean;
  /** the shared password inputs, revealed when enabled */
  children: ReactNode;
}

/** The "Use the same password for all PDFs" switch plus the shared password panel. */
export function SharedPasswordToggle({ checked, onChange, operation, appliesTo, disabled, children }: SharedPasswordToggleProps) {
  const labelId = useId();
  const descId = useId();
  const verb = operation === "decrypt" ? "open" : "protect";

  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={labelId} className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-accent" aria-hidden />
            Use the same password for all PDFs
          </p>
          <p id={descId} className="mt-1 text-xs leading-relaxed text-muted">
            {operation === "decrypt"
              ? "All files in this batch share one current password."
              : "One new password protects every file in this batch."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-describedby={descId}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
            checked ? "border-accent bg-accent" : "border-line bg-surface-2"
          }`}
        >
          <motion.span
            initial={false}
            animate={{ x: checked ? 22 : 3 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className={`inline-block size-5 rounded-full shadow ${checked ? "bg-accent-fg" : "bg-muted"}`}
          />
          <span className="sr-only">{checked ? "On" : "Off"}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {checked && (
          <motion.div
            key="shared"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-4">
              {children}
              <p
                data-testid="shared-indicator"
                className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-medium text-accent"
              >
                <Users className="size-3.5 shrink-0" aria-hidden />
                {appliesTo > 0
                  ? `This password will be used to ${verb} ${plural(appliesTo, "PDF")} in this batch.`
                  : "Add PDFs to apply this password."}
              </p>
              <p className="text-xs text-muted">Any file can opt out and use its own password from its card.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
