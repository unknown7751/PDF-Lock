import { motion } from "motion/react";
import { Lock, LockOpen } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "../lib/format";
import type { Operation } from "../types";

interface OperationTabsProps {
  value: Operation;
  onChange: (op: Operation) => void;
  /** locked while a batch is running or showing results */
  disabled?: boolean;
  panelId: string;
}

const TABS = [
  { id: "decrypt" as const, label: "Decrypt PDF", hint: "Remove password protection", Icon: LockOpen },
  { id: "encrypt" as const, label: "Encrypt PDF", hint: "Protect with a new password", Icon: Lock },
];

export const tabDomId = (op: Operation) => `tab-${op}`;

/** Accessible segmented tabs with an animated selection indicator and arrow-key navigation. */
export function OperationTabs({ value, onChange, disabled, panelId }: OperationTabsProps) {
  const refs = useRef<Record<Operation, HTMLButtonElement | null>>({ decrypt: null, encrypt: null });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const index = TABS.findIndex((t) => t.id === value);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (target) {
      onChange(target.id);
      refs.current[target.id]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Operation"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="relative grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface-2/70 p-1"
      title={disabled ? "Start a new batch to switch operation" : undefined}
    >
      {TABS.map(({ id, label, hint, Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={tabDomId(id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            aria-disabled={disabled && !selected ? true : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => !disabled && onChange(id)}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center rounded-xl px-3 py-2 text-center transition-colors sm:flex-row sm:gap-3",
              selected ? "text-fg" : "text-muted hover:text-fg",
              disabled && !selected && "cursor-not-allowed opacity-50",
            )}
          >
            {selected && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl border border-accent/40 bg-surface shadow-card"
                style={{ boxShadow: "0 0 0 1px color-mix(in oklab, var(--accent) 25%, transparent), var(--shadow-card)" }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2 text-sm font-semibold">
              <Icon className={cn("size-4", selected && "text-accent")} aria-hidden />
              {label}
            </span>
            <span className="relative z-10 hidden text-xs text-muted sm:block">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
