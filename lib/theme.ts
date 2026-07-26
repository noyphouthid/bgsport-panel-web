export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "bgsport:theme";
export const THEME_ATTRIBUTE = "data-theme";
export const DEFAULT_THEME: ThemeMode = "light";

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export const themeInitScript = `
(() => {
  const root = document.documentElement;
  const storageKey = "${THEME_STORAGE_KEY}";
  const attribute = "${THEME_ATTRIBUTE}";

  try {
    const saved = window.localStorage.getItem(storageKey);
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved === "dark" || saved === "light" ? saved : preferred;
    root.setAttribute(attribute, theme);
    root.style.colorScheme = theme;
  } catch {
    root.setAttribute(attribute, "${DEFAULT_THEME}");
    root.style.colorScheme = "${DEFAULT_THEME}";
  }
})();
`;
