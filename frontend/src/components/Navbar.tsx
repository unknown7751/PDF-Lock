import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Theme } from "../types";
import { LogoMark } from "./LogoMark";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#privacy", label: "Privacy" },
] as const;

const GITHUB_URL = import.meta.env.VITE_GITHUB_URL;

interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = "rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl"
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 rounded-lg" aria-label="PDFLock home">
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight">PDFLock</span>
        </a>

        <ul className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={linkClass}>
                {l.label}
              </a>
            </li>
          ))}
          {GITHUB_URL && (
            <li>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={`${linkClass} inline-flex items-center gap-1.5`}>
                GitHub <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          )}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="btn-icon border border-line sm:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-line/70 sm:hidden"
          >
            <ul className="flex flex-col gap-1 p-3">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className={`${linkClass} flex min-h-11 items-center`}>
                    {l.label}
                  </a>
                </li>
              ))}
              {GITHUB_URL && (
                <li>
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={`${linkClass} flex min-h-11 items-center`}>
                    GitHub (opens in a new tab)
                  </a>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
