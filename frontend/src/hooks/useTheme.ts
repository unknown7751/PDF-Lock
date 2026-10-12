import { useCallback, useEffect, useState } from "react";
import type { Theme } from "../types";

export const THEME_KEY = "pdflock-theme";

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; // dark by default
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 450);
  }
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

/** Theme preference. Only the theme name is persisted — never anything sensitive. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme, false);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next, true);
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice still applies for this session */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);

  return { theme, setTheme, toggle };
}
