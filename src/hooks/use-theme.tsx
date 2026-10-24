import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("craft-theme") as Theme | null;
    const initial = stored ?? systemTheme();
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!localStorage.getItem("craft-theme")) {
        const t = systemTheme();
        setTheme(t);
        document.documentElement.classList.toggle("dark", t === "dark");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("craft-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggle };
}
