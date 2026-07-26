"use client";

import { Moon, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_THEME, isThemeMode, THEME_ATTRIBUTE, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

const THEME_EVENT = "bgsport-theme-change";

function readTheme(): ThemeMode {
  if (typeof document === "undefined") return DEFAULT_THEME;

  const attributeTheme = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  if (isThemeMode(attributeTheme)) return attributeTheme;

  if (typeof window === "undefined") return DEFAULT_THEME;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

type ThemeToggleProps = {
  className?: string;
  compactLabel?: boolean;
};

export default function ThemeToggle({ className = "", compactLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    const syncTheme = () => setTheme(readTheme());

    window.addEventListener("storage", syncTheme);
    window.addEventListener(THEME_EVENT, syncTheme as EventListener);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(THEME_EVENT, syncTheme as EventListener);
    };
  }, []);

  const isDark = theme === "dark";
  const nextTheme: ThemeMode = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={`inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm font-black text-[var(--theme-foreground)] shadow-sm transition hover:bg-[var(--theme-surface-muted)] ${className}`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          isDark ? "bg-slate-800 text-amber-300" : "bg-amber-100 text-amber-700"
        }`}
      >
        {isDark ? <Moon size={16} /> : <SunMedium size={16} />}
      </span>
      <span className={compactLabel ? "hidden sm:inline" : ""}>{isDark ? "Dark Mode" : "Light Mode"}</span>
    </button>
  );
}
