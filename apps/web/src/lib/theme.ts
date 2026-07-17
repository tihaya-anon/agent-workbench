import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";

const getCurrentTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

const applyTheme = (theme: Theme) => {
  const isDark = theme === "dark";

  // Keep Tailwind dark mode, browser UI color, and persisted preference in sync.
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#242a26" : "#f7f7f4");
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark")),
  };
};
