import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import type { Theme } from "../types";

/** Sonner toaster themed with the app's design tokens. Toasts are announced via aria-live. */
export function ToastProvider({ theme }: { theme: Theme }) {
  const style = {
    "--normal-bg": "var(--surface)",
    "--normal-text": "var(--fg)",
    "--normal-border": "var(--line)",
    "--success-bg": "var(--surface)",
    "--success-text": "var(--success)",
    "--success-border": "var(--line)",
    "--error-bg": "var(--surface)",
    "--error-text": "var(--danger)",
    "--error-border": "var(--line)",
    "--warning-bg": "var(--surface)",
    "--warning-text": "var(--warn)",
    "--warning-border": "var(--line)",
    "--border-radius": "14px",
  } as CSSProperties;

  return <Toaster theme={theme} position="bottom-right" closeButton visibleToasts={4} gap={10} style={style} />;
}
