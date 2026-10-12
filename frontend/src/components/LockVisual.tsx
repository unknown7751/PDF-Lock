import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lock, LockOpen } from "lucide-react";
import { useEffect, useState } from "react";

const LINES = [78, 92, 64, 86, 58, 74];

/** Looping illustration of a PDF page moving between locked and unlocked states. */
export function LockVisual() {
  const reduce = useReducedMotion();
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setLocked((l) => !l), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  const isLocked = reduce ? false : locked;

  return (
    <div className="relative mx-auto w-full max-w-[320px]" role="img" aria-label={`Illustration of a PDF page that is ${isLocked ? "locked" : "unlocked"}`}>
      <motion.div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 70%)" }}
        animate={reduce ? undefined : { opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* back sheet */}
      <div aria-hidden className="absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-2xl border border-line bg-surface-2" />

      <motion.div
        className="card relative aspect-[4/5] overflow-hidden p-6"
        animate={reduce ? undefined : { y: [0, -8, 0], rotate: [-1, 0.5, -1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-full bg-accent/70" />
          <div className="h-2.5 w-24 rounded-full bg-line" />
          <span className="ml-auto text-[10px] font-bold tracking-wider text-muted">PDF</span>
        </div>

        <div className="relative mt-6 space-y-3.5">
          {LINES.map((w, i) => (
            <div key={i} className="relative h-3">
              {/* readable text lines */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-fg/25"
                style={{ width: `${w}%` }}
                animate={{ opacity: isLocked ? 0 : 1 }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
              />
              {/* redacted/encrypted lines */}
              <motion.div
                className="absolute inset-y-0 left-0 flex gap-[3px] overflow-hidden rounded-full"
                style={{ width: `${w}%` }}
                animate={{ opacity: isLocked ? 1 : 0 }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
              >
                {Array.from({ length: 18 }, (_, j) => (
                  <span key={j} className="h-full flex-1 rounded-[2px] bg-accent/45" />
                ))}
              </motion.div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="h-16 rounded-xl bg-surface-2" />
          <div className="h-16 rounded-xl bg-surface-2" />
        </div>

        {/* scan sweep */}
        {!reduce && (
          <motion.div
            aria-hidden
            key={String(isLocked)}
            className="pointer-events-none absolute inset-x-0 h-24"
            style={{ background: "linear-gradient(to bottom, transparent, var(--accent-soft), transparent)" }}
            initial={{ top: "-20%" }}
            animate={{ top: "110%" }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
        )}
      </motion.div>

      {/* lock badge */}
      <motion.div
        className="absolute -right-3 -bottom-4 flex size-20 items-center justify-center rounded-2xl border border-line bg-surface shadow-card"
        animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isLocked ? "locked" : "open"}
            initial={{ scale: 0.4, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.4, rotate: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className={isLocked ? "text-accent" : "text-success"}
          >
            {isLocked ? <Lock className="size-9" strokeWidth={1.8} aria-hidden /> : <LockOpen className="size-9" strokeWidth={1.8} aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
