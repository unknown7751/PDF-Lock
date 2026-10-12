import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import type { EncryptAdvanced } from "../lib/schemas";
import { cn } from "../lib/format";
import { PasswordInput } from "./PasswordInput";

interface AdvancedSettingsProps {
  value: EncryptAdvanced;
  onChange: (next: EncryptAdvanced) => void;
  /** field id prefix so several instances can coexist */
  idPrefix: string;
  title?: string;
  /** validation message for owner password / permissions */
  error?: string;
  forceShowError?: boolean;
  disabled?: boolean;
  defaultOpen?: boolean;
}

const ALGORITHM_INFO = {
  "aes-256": { label: "AES-256", note: "Recommended. Strongest; needs a modern reader (PDF 2.0 / Acrobat X+)." },
  "aes-128": { label: "AES-128", note: "Maximum compatibility with older readers. Passwords up to 32 plain-ASCII characters." },
} as const;

/** Collapsible encryption options: algorithm, owner password and permissions. */
export function AdvancedSettings({ value, onChange, idPrefix, title = "Advanced options", error, forceShowError, disabled, defaultOpen = false }: AdvancedSettingsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const set = (patch: Partial<EncryptAdvanced>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-line bg-surface-2/50">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-accent" aria-hidden />
          {title}
          {error && <span className="chip border-danger/40 bg-danger-soft text-danger">Needs attention</span>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted">
          <ChevronDown className="size-4" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-4 pb-4">
              <fieldset disabled={disabled}>
                <legend className="mb-2 text-sm font-medium">Encryption algorithm</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(ALGORITHM_INFO) as (keyof typeof ALGORITHM_INFO)[]).map((alg) => {
                    const selected = value.algorithm === alg;
                    return (
                      <label
                        key={alg}
                        className={cn(
                          "flex min-h-11 cursor-pointer flex-col rounded-xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                          selected ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <input
                            type="radio"
                            name={`${idPrefix}-algorithm`}
                            value={alg}
                            checked={selected}
                            onChange={() => set({ algorithm: alg })}
                            className="size-4 accent-[var(--accent)]"
                          />
                          {ALGORITHM_INFO[alg].label}
                        </span>
                        <span className="mt-1 text-xs leading-relaxed text-muted">{ALGORITHM_INFO[alg].note}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <PasswordInput
                  id={`${idPrefix}-owner`}
                  label="Owner password (optional)"
                  value={value.ownerPassword}
                  onChange={(v) => set({ ownerPassword: v })}
                  autoComplete="new-password"
                  disabled={disabled}
                  hint="Controls the permissions below. The open password above is what readers type to open the file."
                  error={error}
                  forceShowError={forceShowError}
                />
              </div>

              <fieldset disabled={disabled}>
                <legend className="mb-2 text-sm font-medium">Document permissions</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["allowPrint", "Allow printing"],
                      ["allowCopy", "Allow copying text"],
                      ["allowEdit", "Allow editing"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 text-sm transition hover:border-accent/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                    >
                      <input
                        type="checkbox"
                        checked={value[key]}
                        onChange={(e) => set({ [key]: e.target.checked })}
                        className="size-4 accent-[var(--accent)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="flex gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Permission restrictions are a courtesy that compliant readers honour — some tools ignore them, so they
                  are not a substitute for a strong open password. Restrictions require a separate owner password.
                </span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
