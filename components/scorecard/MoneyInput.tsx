"use client";

import { useState } from "react";
import { formatMoneyInput, parseMoney } from "@/lib/utils";

/**
 * Dollar-amount field for goal entry.
 *
 * `<input type="number" step="1000">` silently REJECTED $2,731,306.68 — a real
 * office goal — because the browser enforces step multiples, and a number input
 * cannot display thousands separators at all (2731306.68 is unreadable at a
 * glance). This is a text field instead: any amount to the cent is accepted,
 * "$" and commas are stripped on the way in, and the value is re-grouped with
 * commas on blur so what you read back matches how the goal is written down.
 *
 * The parent owns the canonical numeric value; this component owns only the
 * in-progress text so typing "1,2" or "1200." isn't fought mid-keystroke.
 */
export function MoneyInput({
  value,
  onChange,
  className = "",
  placeholder,
  id,
  name,
  ariaLabel,
}: {
  /** Canonical amount; null = empty field. */
  value: number | null;
  onChange: (next: number | null) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => formatMoneyInput(value));
  const [focused, setFocused] = useState(false);
  // Re-sync when the parent changes the value from outside (market/month
  // switch, distributor commit) — but never while the field has focus, which
  // would rewrite what someone is mid-way through typing. Adjusting during
  // render rather than in an effect avoids a second paint showing stale text.
  const [lastExternal, setLastExternal] = useState(value);
  if (!focused && value !== lastExternal) {
    setLastExternal(value);
    setText(formatMoneyInput(value));
  }

  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-slate-400">$</span>
      <input
        id={id}
        name={name}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={`${className} pl-6`}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
        onBlur={(e) => {
          setFocused(false);
          const parsed = parseMoney(e.target.value);
          setText(formatMoneyInput(parsed));
          onChange(parsed);
        }}
      />
    </div>
  );
}
