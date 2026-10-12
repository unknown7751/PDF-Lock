import { motion, useReducedMotion } from "motion/react";

/** Slow-drifting gradient shapes behind the page. Transform-only animation; static with reduced motion. */
export function AmbientBackground() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <motion.div
        className="absolute -top-40 -left-32 size-[34rem] rounded-full blur-3xl"
        style={{ background: "var(--blob-a)" }}
        animate={reduce ? undefined : { x: [0, 60, -20, 0], y: [0, 40, 80, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-40 size-[30rem] rounded-full blur-3xl"
        style={{ background: "var(--blob-b)" }}
        animate={reduce ? undefined : { x: [0, -50, 30, 0], y: [0, -40, 50, 0], scale: [1, 0.92, 1.08, 1] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
