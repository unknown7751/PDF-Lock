import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

/** Counts smoothly to `value`. The exact value is always exposed to assistive tech. */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return (
    <>
      <motion.span aria-hidden className="tabular-nums">
        {text}
      </motion.span>
      <span className="sr-only">{value}</span>
    </>
  );
}
