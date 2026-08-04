"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * The theme lives OUTSIDE React — it's the `dark` class on <html>, applied
 * pre-hydration by ThemeScript. useSyncExternalStore subscribes to that class
 * (via MutationObserver), so the icon always reflects the real applied theme
 * without a setState-in-effect hydration dance.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getTheme = (): "light" | "dark" =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

// Server snapshot: light (matches the pre-ThemeScript initial HTML).
const getServerTheme = (): "light" | "dark" => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}
