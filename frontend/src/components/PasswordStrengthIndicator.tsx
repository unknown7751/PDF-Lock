import { motion } from "motion/react";
import { useMemo } from "react";
import { estimateStrength } from "../lib/passwords";

const COLORS = ["bg-danger", "bg-danger", "bg-warn", "bg-success", "bg-success"] as const;
const TEXT = ["text-danger", "text-danger", "text-warn", "text-success", "text-success"] as const;

/** Strength meter. Shows the label as text so it never relies on colour alone. */
export function PasswordStrengthIndicator({ password, id }: { password: string; id?: string }) {
  const strength = useMemo(() => estimateStrength(password), [password]);
  if (!password) return null;
  const filled = Math.max(1, strength.score);

  return (
    <div id={id} className="mt-2" role="status" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className={`h-full origin-left rounded-full ${COLORS[strength.score]}`}
              initial={false}
              animate={{ scaleX: i < filled ? 1 : 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Strength: <span className={`font-semibold ${TEXT[strength.score]}`}>{strength.label}</span>
        <span className="sr-only">. </span>
        <span className="before:mx-1 before:content-['·']">{strength.hint}</span>
      </p>
    </div>
  );
}
