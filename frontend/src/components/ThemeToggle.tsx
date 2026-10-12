import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import type { Theme } from "../types";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="btn-icon relative overflow-hidden border border-line bg-surface-2/60"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -50 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 50 }}
          transition={{ duration: 0.22 }}
          className="inline-flex"
        >
          {theme === "dark" ? <Moon className="size-[1.1rem]" aria-hidden /> : <Sun className="size-[1.1rem]" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
