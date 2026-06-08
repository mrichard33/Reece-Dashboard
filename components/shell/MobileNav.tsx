"use client";

import { createContext, useContext, useState } from "react";
import { Menu } from "lucide-react";

/**
 * Shared open/close state for the mobile sidebar drawer. The Sidebar and the
 * TopBar hamburger live in different parts of the tree (Sidebar in the dashboard
 * layout, TopBar rendered per-page inside {children}), so they coordinate through
 * this context instead of prop-drilling. No-op on md+ where the sidebar is static.
 */
type MobileNavValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const MobileNavContext = createContext<MobileNavValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ open, setOpen, toggle: () => setOpen(!open) }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext);
  // Tolerate usage outside a provider (e.g. a page that renders TopBar without
  // the dashboard layout) — the toggle simply becomes inert.
  return ctx ?? { open: false, setOpen: () => {}, toggle: () => {} };
}

/** Hamburger button — visible only below md, where the sidebar is a drawer. */
export function MobileNavToggle() {
  const { toggle } = useMobileNav();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open navigation"
      className="-ml-1 mr-1 inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-600 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
