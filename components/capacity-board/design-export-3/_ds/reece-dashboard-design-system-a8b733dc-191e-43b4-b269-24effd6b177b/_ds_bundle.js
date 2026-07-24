/* @ds-bundle: {"format":3,"namespace":"ReeceDashboardDesignSystem_a8b733","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"CardTitle","sourcePath":"components/core/Card.jsx"},{"name":"CardContent","sourcePath":"components/core/Card.jsx"},{"name":"InfoButton","sourcePath":"components/core/InfoButton.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"HealthTile","sourcePath":"components/tiles/HealthTile.jsx"},{"name":"StatTile","sourcePath":"components/tiles/StatTile.jsx"},{"name":"StageBars","sourcePath":"components/viz/StageBars.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f57a5ba6bcc9","components/core/Button.jsx":"0103756bfa49","components/core/Card.jsx":"ba34a93022ed","components/core/InfoButton.jsx":"cf6d0abf48cb","components/core/StatusDot.jsx":"4bd2cfba57da","components/core/Tooltip.jsx":"1f42f6a312ea","components/forms/Input.jsx":"d3cc04138b76","components/tiles/HealthTile.jsx":"ebb19fbfd725","components/tiles/StatTile.jsx":"7d05b194730e","components/viz/StageBars.jsx":"02ea8d4a1c71","ui_kits/mission-control/IssuesScreen.jsx":"1a3298412d8d","ui_kits/mission-control/LoginScreen.jsx":"684ad041b9f9","ui_kits/mission-control/OverviewScreen.jsx":"241a9bf8fb76","ui_kits/mission-control/PipelinesScreen.jsx":"3e7c9f287d89","ui_kits/mission-control/Shell.jsx":"32eba23dafb2"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ReeceDashboardDesignSystem_a8b733 = window.ReeceDashboardDesignSystem_a8b733 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  emerald: {
    bg: "var(--color-emerald-50)",
    text: "var(--color-emerald-700)",
    ring: "var(--color-emerald-200)",
    dot: "var(--color-emerald-500)"
  },
  mint: {
    bg: "rgba(236,253,245,0.6)",
    text: "var(--color-emerald-600)",
    ring: "rgba(167,243,208,0.5)",
    dot: "var(--color-emerald-300)"
  },
  amber: {
    bg: "var(--color-amber-50)",
    text: "var(--color-amber-800)",
    ring: "var(--color-amber-200)",
    dot: "var(--color-amber-500)"
  },
  rose: {
    bg: "var(--color-rose-50)",
    text: "var(--color-rose-700)",
    ring: "var(--color-rose-200)",
    dot: "var(--color-rose-500)"
  },
  slate: {
    bg: "var(--color-slate-100)",
    text: "var(--color-slate-700)",
    ring: "var(--color-slate-200)",
    dot: "var(--color-slate-400)"
  },
  navy: {
    bg: "var(--color-navy-50)",
    text: "var(--color-navy-800)",
    ring: "var(--color-navy-200)",
    dot: "var(--color-navy-600)"
  },
  brick: {
    bg: "var(--color-brick-50)",
    text: "var(--color-brick-700)",
    ring: "var(--color-brick-200)",
    dot: "var(--color-brick)"
  },
  sky: {
    bg: "var(--color-sky-50)",
    text: "var(--color-sky-700)",
    ring: "var(--color-sky-200)",
    dot: "var(--color-sky-500)"
  }
};

/**
 * Reece Badge — small status pill with an inset ring. Eight semantic tones,
 * optional leading dot. Used for severities, statuses and event types.
 */
function Badge({
  tone = "slate",
  dot = false,
  className,
  children,
  style,
  ...props
}) {
  const t = TONES[tone] ?? TONES.slate;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      borderRadius: "var(--radius-full)",
      padding: "2px 8px",
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1.4,
      color: t.text,
      background: t.bg,
      boxShadow: `inset 0 0 0 1px ${t.ring}`,
      ...style
    }
  }, props), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      height: "6px",
      width: "6px",
      borderRadius: "9999px",
      background: t.dot,
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Reece Button — the primary action control.
 * Navy-filled primary, outlined secondary, transparent ghost, brick-red danger.
 * Small / medium / large. Soft shadow, 6px radius, 150ms hover transition.
 */
function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  className,
  children,
  style,
  ...props
}) {
  const [hover, setHover] = useState(false);
  const sizes = {
    sm: {
      padding: "4px 8px",
      fontSize: "12px"
    },
    md: {
      padding: "6px 12px",
      fontSize: "14px"
    },
    lg: {
      padding: "8px 16px",
      fontSize: "14px"
    }
  };
  const variants = {
    primary: {
      base: {
        background: "var(--color-navy-800)",
        color: "#fff",
        border: "1px solid transparent"
      },
      hover: {
        background: "var(--color-navy-700)"
      }
    },
    secondary: {
      base: {
        background: "var(--surface-card)",
        color: "var(--color-navy-800)",
        border: "1px solid var(--color-slate-300)"
      },
      hover: {
        background: "var(--color-slate-50)"
      }
    },
    ghost: {
      base: {
        background: "transparent",
        color: "var(--color-slate-600)",
        border: "1px solid transparent"
      },
      hover: {
        background: "var(--color-slate-100)"
      }
    },
    danger: {
      base: {
        background: "var(--color-brick)",
        color: "#fff",
        border: "1px solid transparent"
      },
      hover: {
        background: "var(--color-brick-dark)"
      }
    }
  };
  const v = variants[variant] ?? variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    className: className,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      fontFamily: "var(--font-sans)",
      fontWeight: 500,
      lineHeight: 1,
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background 150ms var(--ease-standard), color 150ms var(--ease-standard)",
      ...sizes[size],
      ...v.base,
      ...(hover && !disabled ? v.hover : null),
      ...style
    }
  }, props), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Reece Card — the fundamental surface. White, 8px radius, hairline border,
 * soft shadow. Compose with CardHeader / CardTitle / CardContent.
 */
function Card({
  className,
  children,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      background: "var(--surface-card)",
      boxShadow: "var(--shadow-sm)",
      ...style
    }
  }, props), children);
}
function CardHeader({
  className,
  children,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "12px",
      padding: "12px 16px",
      borderBottom: "1px solid var(--border-soft)",
      ...style
    }
  }, props), children);
}
function CardTitle({
  className,
  children,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("h3", _extends({
    className: className,
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "14px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--color-slate-600)",
      ...style
    }
  }, props), children);
}
function CardContent({
  className,
  children,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      padding: "16px",
      ...style
    }
  }, props), children);
}
Object.assign(__ds_scope, { Card, CardHeader, CardTitle, CardContent });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/InfoButton.jsx
try { (() => {
const {
  useState
} = React;
/**
 * Reece InfoButton — the small circled "i" affordance on every tile/card.
 * Click toggles a popover explaining the data: what it is, where it comes from,
 * and how to fix it. Mirrors the dashboard's InfoPopover {what, where, fix}.
 */
function InfoButton({
  what,
  where,
  fix,
  align = "right",
  className
}) {
  const [open, setOpen] = useState(false);
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      position: "relative",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "More info",
    onClick: () => setOpen(v => !v),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "18px",
      width: "18px",
      borderRadius: "9999px",
      border: "1px solid var(--border)",
      background: open ? "var(--color-slate-100)" : "transparent",
      color: "var(--color-slate-400)",
      fontFamily: "var(--font-display)",
      fontSize: "11px",
      fontStyle: "italic",
      fontWeight: 700,
      lineHeight: 1,
      cursor: "pointer",
      flexShrink: 0
    }
  }, "i"), open && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    onClick: () => setOpen(false),
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 40
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      [align]: 0,
      zIndex: 50,
      width: "260px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      background: "var(--surface-card)",
      boxShadow: "var(--shadow-popover)",
      padding: "12px",
      textAlign: "left"
    }
  }, [["What", what], ["Where", where], ["Fix", fix]].map(([k, v]) => v && /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      marginBottom: "8px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "10px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: "var(--color-slate-400)"
    }
  }, k), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "2px 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      lineHeight: 1.45,
      color: "var(--color-slate-600)"
    }
  }, v))))));
}
Object.assign(__ds_scope, { InfoButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/InfoButton.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusDot.jsx
try { (() => {
const COLORS = {
  healthy: {
    base: "var(--color-emerald-500)",
    ping: "var(--color-emerald-400)"
  },
  warning: {
    base: "var(--color-amber-500)",
    ping: "var(--color-amber-400)"
  },
  critical: {
    base: "var(--color-rose-500)",
    ping: "var(--color-rose-400)"
  },
  neutral: {
    base: "var(--color-slate-400)",
    ping: "var(--color-slate-300)"
  }
};

/**
 * Reece StatusDot — a 10px health indicator. Healthy / warning / critical pulse
 * with a ping ring; neutral is static. Use in health tiles and live-status rows.
 */
function StatusDot({
  status = "neutral",
  animate = true,
  className,
  style
}) {
  const c = COLORS[status] ?? COLORS.neutral;
  const pulse = animate && status !== "neutral";
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      position: "relative",
      display: "inline-flex",
      height: "10px",
      width: "10px",
      ...style
    }
  }, pulse && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, `@keyframes reece-ping{75%,100%{transform:scale(2);opacity:0}}`), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      inset: 0,
      borderRadius: "9999px",
      background: c.ping,
      opacity: 0.6,
      animation: "reece-ping 1.4s cubic-bezier(0,0,0.2,1) infinite"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex",
      height: "10px",
      width: "10px",
      borderRadius: "9999px",
      background: c.base
    }
  }));
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/core/Tooltip.jsx
try { (() => {
const {
  useState
} = React;
/**
 * Reece Tooltip — lightweight hover/focus label. Navy bubble, appears below.
 * For rich {what/where/fix} help content use InfoButton instead.
 */
function Tooltip({
  label,
  children,
  className,
  style
}) {
  const [open, setOpen] = useState(false);
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    style: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      ...style
    }
  }, children, open && /*#__PURE__*/React.createElement("span", {
    style: {
      pointerEvents: "none",
      position: "absolute",
      left: "50%",
      top: "100%",
      transform: "translateX(-50%)",
      marginTop: "6px",
      zIndex: 30,
      whiteSpace: "nowrap",
      borderRadius: "var(--radius-md)",
      background: "var(--color-navy-900)",
      padding: "4px 8px",
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      color: "#fff",
      boxShadow: "var(--shadow-lg)",
      border: "1px solid var(--color-navy-800)"
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Reece Input — labelled text field. Slate border, navy focus ring, 6px radius.
 * Supports label, hint, error and any native input type.
 */
function Input({
  label,
  hint,
  error,
  id,
  className,
  style,
  ...props
}) {
  const [focus, setFocus] = useState(false);
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "14px",
      fontWeight: 500,
      color: "var(--color-slate-700)"
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: e => {
      setFocus(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      props.onBlur?.(e);
    },
    style: {
      width: "100%",
      boxSizing: "border-box",
      borderRadius: "var(--radius-md)",
      border: `1px solid ${error ? "var(--color-rose-500)" : focus ? "var(--color-navy-600)" : "var(--color-slate-300)"}`,
      boxShadow: focus ? `0 0 0 1px ${error ? "var(--color-rose-500)" : "var(--color-navy-600)"}` : "var(--shadow-sm)",
      background: "var(--surface-card)",
      padding: "8px 12px",
      fontFamily: "var(--font-sans)",
      fontSize: "14px",
      color: "var(--foreground)",
      outline: "none",
      transition: "border-color 150ms, box-shadow 150ms"
    }
  }, props)), error ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "12px",
      color: "var(--color-rose-600)"
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "12px",
      color: "var(--color-slate-500)"
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/tiles/HealthTile.jsx
try { (() => {
/**
 * Reece HealthTile — a service-status card. Pulsing StatusDot + label in the
 * header, a one-line detail, optional error line, and a relative timestamp.
 * The dashboard's "System health" row.
 */
function HealthTile({
  label,
  status = "neutral",
  detail,
  lastActivity,
  lastError,
  info
}) {
  const hasError = typeof lastError === "string" && lastError.length > 0;
  return /*#__PURE__*/React.createElement(__ds_scope.Card, null, /*#__PURE__*/React.createElement(__ds_scope.CardHeader, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusDot, {
    status: status
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--color-slate-600)"
    }
  }, label)), info && /*#__PURE__*/React.createElement(__ds_scope.InfoButton, info)), /*#__PURE__*/React.createElement(__ds_scope.CardContent, null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "14px",
      fontWeight: 500,
      color: "var(--color-navy-900)"
    }
  }, detail ?? "—"), hasError && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: "11px",
      color: "var(--color-rose-600)",
      wordBreak: "break-word"
    }
  }, lastError), lastActivity && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: "12px",
      color: "var(--color-slate-500)"
    }
  }, lastActivity)));
}
Object.assign(__ds_scope, { HealthTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tiles/HealthTile.jsx", error: String((e && e.message) || e) }); }

// components/tiles/StatTile.jsx
try { (() => {
const DELTA = {
  emerald: "var(--color-emerald-600)",
  rose: "var(--color-rose-600)",
  amber: "var(--color-amber-600)",
  slate: "var(--color-slate-500)"
};

/**
 * Reece StatTile — a headline KPI: small uppercase label, big tabular number,
 * optional delta line, and an InfoButton. The dashboard's "Today" row.
 */
function StatTile({
  label,
  value,
  delta,
  deltaTone = "slate",
  suffix,
  info
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, null, /*#__PURE__*/React.createElement(__ds_scope.CardHeader, null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--color-slate-500)"
    }
  }, label), info && /*#__PURE__*/React.createElement(__ds_scope.InfoButton, info)), /*#__PURE__*/React.createElement(__ds_scope.CardContent, null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "30px",
      fontWeight: 600,
      color: "var(--color-navy-900)",
      fontVariantNumeric: "tabular-nums",
      lineHeight: 1.1
    }
  }, value, suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "16px",
      fontWeight: 400,
      color: "var(--color-slate-500)"
    }
  }, suffix)), delta && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: "12px",
      fontWeight: 500,
      color: DELTA[deltaTone] ?? DELTA.slate
    }
  }, delta)));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tiles/StatTile.jsx", error: String((e && e.message) || e) }); }

// components/viz/StageBars.jsx
try { (() => {
function ageTone(days) {
  if (days < 7) return {
    bg: "var(--color-emerald-500)",
    text: "#ecfdf5",
    label: "healthy"
  };
  if (days < 14) return {
    bg: "var(--color-amber-500)",
    text: "#fffbeb",
    label: "watch"
  };
  return {
    bg: "var(--color-rose-500)",
    text: "#fff1f2",
    label: "stalled"
  };
}

/**
 * Reece StageBars — a proportional funnel bar for a pipeline. Each segment is a
 * stage, width ∝ opp count, color ∝ average age (green<7d, amber<14d, red 14d+).
 * Below the bar, a wrapping legend of stage / count / age chips.
 */
function StageBars({
  stages = []
}) {
  const total = stages.reduce((a, s) => a + s.count, 0) || 1;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "36px",
      width: "100%",
      overflow: "hidden",
      borderRadius: "var(--radius-md)",
      background: "var(--color-slate-100)",
      boxShadow: "inset 0 0 0 1px var(--color-slate-200)"
    }
  }, stages.map(s => {
    if (!s.count) return null;
    const pct = s.count / total * 100;
    const tone = ageTone(s.avgAgeDays);
    return /*#__PURE__*/React.createElement("div", {
      key: s.name,
      style: {
        width: `${pct}%`,
        height: "100%"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Tooltip, {
      label: `${s.name}: ${s.count} opps · avg ${s.avgAgeDays}d (${tone.label})`,
      style: {
        height: "100%",
        width: "100%"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        height: "100%",
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "10px",
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        background: tone.bg,
        color: tone.text
      }
    }, pct >= 8 ? s.count : "")));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "12px",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: "8px"
    }
  }, stages.map(s => {
    const tone = ageTone(s.avgAgeDays);
    return /*#__PURE__*/React.createElement("div", {
      key: s.name,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-soft)",
        padding: "4px 8px",
        fontSize: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        height: "8px",
        width: "8px",
        borderRadius: "9999px",
        background: tone.bg,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "var(--color-slate-700)"
      }
    }, s.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        color: "var(--color-slate-500)",
        fontVariantNumeric: "tabular-nums"
      }
    }, s.count, " \xB7 ", s.avgAgeDays, "d"));
  })));
}
Object.assign(__ds_scope, { StageBars });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/viz/StageBars.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mission-control/IssuesScreen.jsx
try { (() => {
/* Reece Mission Control — Issues screen */
const ISSUES = [{
  sev: "Critical",
  tone: "rose",
  cat: "Sync drift",
  title: "HL cache diverged from GHL",
  body: "3 P1 opportunities show stale stage values vs the GoHighLevel source of truth.",
  wf: "sync-hl-opportunities",
  when: "12m ago"
}, {
  sev: "Warning",
  tone: "amber",
  cat: "Heartbeat",
  title: "Decision Engine tick slow",
  body: "Latest agent_events.heartbeat.tick is 7 minutes old; the alert threshold is 6.",
  wf: "decision-engine",
  when: "26m ago"
}, {
  sev: "Warning",
  tone: "amber",
  cat: "Stuck contacts",
  title: "5 contacts stalled in Quoted",
  body: "No stage movement in 21+ days. Average age in stage is climbing.",
  wf: "P1 — Impact Windows",
  when: "1h ago"
}, {
  sev: "Info",
  tone: "sky",
  cat: "Namespace",
  title: "Tag namespace conflict resolved",
  body: "Duplicate 'impact-window' tag merged into canonical namespace.",
  wf: "ghl-tag-registry",
  when: "3h ago"
}];
function IssuesScreen() {
  const {
    Card,
    Badge,
    Button
  } = window.ReeceDashboardDesignSystem_a8b733;
  const counts = ISSUES.reduce((a, i) => {
    a[i.sev] = (a[i.sev] || 0) + 1;
    return a;
  }, {});
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "rose",
    dot: true
  }, counts.Critical || 0, " critical"), /*#__PURE__*/React.createElement(Badge, {
    tone: "amber",
    dot: true
  }, counts.Warning || 0, " warning"), /*#__PURE__*/React.createElement(Badge, {
    tone: "sky",
    dot: true
  }, counts.Info || 0, " info")), ISSUES.map((it, i) => /*#__PURE__*/React.createElement(Card, {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "12px",
      padding: "16px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: it.tone === "rose" ? "var(--color-rose-500)" : it.tone === "amber" ? "var(--color-amber-500)" : "var(--color-sky-500)",
      lineHeight: 0,
      marginTop: "2px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.tone === "rose" ? "alert-octagon" : it.tone === "amber" ? "alert-triangle" : "info",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: it.tone,
    dot: true
  }, it.sev), /*#__PURE__*/React.createElement(Badge, {
    tone: "slate"
  }, it.cat), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: "11px",
      color: "var(--color-slate-400)",
      fontFamily: "var(--font-mono)"
    }
  }, it.when)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      fontSize: "14px",
      fontWeight: 600,
      color: "var(--color-navy-900)"
    }
  }, it.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "3px 0 0",
      fontSize: "13px",
      color: "var(--color-slate-600)",
      lineHeight: 1.45
    }
  }, it.body), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      fontSize: "11px",
      color: "var(--color-slate-500)"
    }
  }, "Affects: ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)"
    }
  }, it.wf)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "8px",
      marginTop: "12px"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "View details"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Mark resolved")))))));
}
Object.assign(window, {
  IssuesScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mission-control/IssuesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mission-control/LoginScreen.jsx
try { (() => {
/* Reece Mission Control — Login screen */
function LoginScreen({
  onSignIn
}) {
  const {
    Input,
    Button
  } = window.ReeceDashboardDesignSystem_a8b733;
  const [email, setEmail] = React.useState("mark@reecewindows.com");
  const [pw, setPw] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const submit = e => {
    e.preventDefault();
    setPending(true);
    setTimeout(() => {
      setPending(false);
      onSignIn(email);
    }, 800);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--background)",
      padding: "24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: "380px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      marginBottom: "24px"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/reece-circle-logo.png",
    width: "72",
    height: "72",
    alt: "Reece"
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "14px 0 2px",
      fontFamily: "var(--font-display)",
      fontSize: "20px",
      fontWeight: 600,
      color: "var(--color-navy-900)"
    }
  }, "Mission Control"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "13px",
      color: "var(--color-slate-500)"
    }
  }, "Reece Windows & Doors \xB7 Operations")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      padding: "24px"
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Email",
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    autoComplete: "email"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Password",
    type: show ? "text" : "password",
    value: pw,
    onChange: e => setPw(e.target.value),
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShow(v => !v),
    "aria-label": "Toggle password",
    style: {
      position: "absolute",
      right: "10px",
      top: "30px",
      background: "none",
      border: "none",
      color: "var(--color-slate-400)",
      cursor: "pointer",
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: show ? "eye-off" : "eye",
    size: 16
  }))), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "primary",
    disabled: pending,
    style: {
      width: "100%",
      padding: "9px 16px"
    }
  }, pending && /*#__PURE__*/React.createElement("span", {
    style: {
      height: "12px",
      width: "12px",
      borderRadius: "9999px",
      border: "2px solid rgba(255,255,255,.4)",
      borderTopColor: "#fff",
      animation: "reece-spin 0.8s linear infinite",
      display: "inline-block"
    }
  }), pending ? "Signing in…" : "Sign in"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "12px"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: "var(--color-navy-700)",
      textDecoration: "none",
      fontWeight: 500
    }
  }, "First time here? Set a password"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: "var(--color-navy-700)",
      textDecoration: "none",
      fontWeight: 500
    }
  }, "Forgot?")))), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: "center",
      marginTop: "18px",
      fontSize: "11px",
      color: "var(--color-slate-400)"
    }
  }, "Allowlisted accounts only \xB7 Est. 1972")));
}
Object.assign(window, {
  LoginScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mission-control/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mission-control/OverviewScreen.jsx
try { (() => {
/* Reece Mission Control — Overview screen */
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 12px",
      fontFamily: "var(--font-display)",
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: "var(--color-slate-500)"
    }
  }, children);
}
const ACTIVITY = [{
  tone: "emerald",
  label: "Appointment booked",
  who: "Diane Foster",
  when: "2m ago"
}, {
  tone: "sky",
  label: "New lead",
  who: "Carlos Ruiz",
  when: "9m ago"
}, {
  tone: "emerald",
  label: "Customer replied",
  who: "The Hadleys",
  when: "14m ago"
}, {
  tone: "amber",
  label: "Status changed",
  who: "Greg Mason",
  when: "21m ago"
}, {
  tone: "emerald",
  label: "Sale closed",
  who: "Patel residence",
  when: "38m ago"
}, {
  tone: "sky",
  label: "Email opened",
  who: "Wanda Cole",
  when: "44m ago"
}, {
  tone: "amber",
  label: "Lead going cold",
  who: "Tom Brennan",
  when: "1h ago"
}];
const ALERTS = [{
  sev: "Critical",
  tone: "rose",
  title: "Supabase sync drift detected",
  body: "HL cache diverged from GHL on 3 opportunities in P1.",
  affects: "Pipeline: Impact Windows",
  when: "12m ago"
}, {
  sev: "Warning",
  tone: "amber",
  title: "Decision Engine heartbeat slow",
  body: "Last tick was 7 minutes ago — threshold is 6.",
  affects: "agent_events",
  when: "26m ago"
}, {
  sev: "Warning",
  tone: "amber",
  title: "5 contacts stuck in Quoted",
  body: "No movement in 21+ days; avg age rising.",
  affects: "Pipeline: Impact Windows",
  when: "1h ago"
}];
function OverviewScreen() {
  const {
    StatTile,
    HealthTile,
    Card,
    CardHeader,
    CardTitle,
    Badge
  } = window.ReeceDashboardDesignSystem_a8b733;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      padding: "24px"
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionLabel, null, "System health"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(HealthTile, {
    label: "LP MCP",
    status: "healthy",
    detail: "lp-mcp \xB7 running",
    lastActivity: "deployed 3h ago",
    info: {
      what: "Lead Perfection MCP service.",
      where: "Railway.",
      fix: "Redeploy from Railway if down."
    }
  }), /*#__PURE__*/React.createElement(HealthTile, {
    label: "HL MCP",
    status: "healthy",
    detail: "hl-mcp \xB7 running",
    lastActivity: "deployed 3h ago",
    info: {
      what: "GoHighLevel MCP service.",
      where: "Railway."
    }
  }), /*#__PURE__*/React.createElement(HealthTile, {
    label: "Decision Engine",
    status: "warning",
    detail: "Last tick 7 min ago",
    lastActivity: "7 min ago",
    info: {
      what: "Agent heartbeat.",
      where: "agent_events.heartbeat.tick",
      fix: "Check the n8n scheduler."
    }
  }), /*#__PURE__*/React.createElement(HealthTile, {
    label: "Supabase sync",
    status: "healthy",
    detail: "LP: 4m ago \xB7 HL: 6m ago",
    lastActivity: "4 min ago",
    info: {
      what: "Cache freshness vs source.",
      where: "sync_state table."
    }
  }))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Today"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Leads today",
    value: "42",
    delta: "+8 vs yesterday",
    deltaTone: "emerald",
    info: {
      what: "Leads created today.",
      where: "LP Supabase.",
      fix: "Sync now if stale."
    }
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Appts today",
    value: "11",
    delta: "+2 vs yesterday",
    deltaTone: "emerald",
    info: {
      what: "Appointments booked today.",
      where: "HL cache."
    }
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Opps in flight",
    value: "68",
    delta: "last 30 days",
    deltaTone: "slate",
    info: {
      what: "Open opportunities, 30d.",
      where: "HL cache."
    }
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Pending approvals",
    value: "2",
    suffix: " !",
    deltaTone: "amber",
    info: {
      what: "Content awaiting exec review.",
      where: "approvals."
    }
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Open issues",
    value: "3",
    suffix: " !",
    deltaTone: "rose",
    info: {
      what: "Unresolved system issues.",
      where: "claude_known_issues."
    }
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Recent activity")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 16px 12px"
    }
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0
    }
  }, ACTIVITY.map((a, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "8px 0",
      borderBottom: i < ACTIVITY.length - 1 ? "1px solid var(--border-soft)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: a.tone,
    dot: true
  }, a.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "13px",
      color: "var(--color-slate-700)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, a.who)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "11px",
      color: "var(--color-slate-400)",
      fontFamily: "var(--font-mono)",
      flexShrink: 0
    }
  }, a.when)))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Active alerts")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }
  }, ALERTS.map((al, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: "10px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      padding: "10px 12px",
      background: "var(--surface-card)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-rose-500)",
      lineHeight: 0,
      marginTop: "1px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-circle",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: al.tone,
    dot: true
  }, al.sev), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "5px 0 0",
      fontSize: "13px",
      fontWeight: 600,
      color: "var(--color-navy-900)"
    }
  }, al.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "2px 0 0",
      fontSize: "12px",
      color: "var(--color-slate-600)",
      lineHeight: 1.4
    }
  }, al.body), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: "11px",
      color: "var(--color-slate-400)"
    }
  }, "Affects: ", al.affects, " \xB7 ", al.when)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-slate-300)",
      lineHeight: 0,
      alignSelf: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16
  }))))))));
}
Object.assign(window, {
  OverviewScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mission-control/OverviewScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mission-control/PipelinesScreen.jsx
try { (() => {
/* Reece Mission Control — Pipelines screen */
const PIPELINES = [{
  id: "p1",
  name: "P1 — Impact Windows",
  count: 59,
  value: "$1,284,500",
  stages: [{
    name: "New",
    count: 24,
    avgAgeDays: 2
  }, {
    name: "Contacted",
    count: 14,
    avgAgeDays: 6
  }, {
    name: "Quoted",
    count: 11,
    avgAgeDays: 16
  }, {
    name: "Negotiation",
    count: 6,
    avgAgeDays: 9
  }, {
    name: "Won",
    count: 4,
    avgAgeDays: 3
  }],
  opps: [{
    name: "Diane Foster",
    lp: "0048213",
    value: "$28,400"
  }, {
    name: "Patel residence",
    lp: "0048190",
    value: "$41,900"
  }, {
    name: "The Hadleys",
    lp: "0048177",
    value: "$19,250"
  }]
}, {
  id: "p2",
  name: "P2 — Entry Doors",
  count: 31,
  value: "$402,100",
  stages: [{
    name: "New",
    count: 12,
    avgAgeDays: 3
  }, {
    name: "Contacted",
    count: 9,
    avgAgeDays: 8
  }, {
    name: "Quoted",
    count: 6,
    avgAgeDays: 13
  }, {
    name: "Negotiation",
    count: 4,
    avgAgeDays: 22
  }],
  opps: [{
    name: "Greg Mason",
    lp: "0048201",
    value: "$8,600"
  }, {
    name: "Wanda Cole",
    lp: "0048166",
    value: "$12,300"
  }]
}, {
  id: "p3",
  name: "P3 — Repairs & Service",
  count: 18,
  value: "$96,750",
  stages: [{
    name: "New",
    count: 8,
    avgAgeDays: 1
  }, {
    name: "Scheduled",
    count: 7,
    avgAgeDays: 4
  }, {
    name: "Complete",
    count: 3,
    avgAgeDays: 2
  }],
  opps: [{
    name: "Tom Brennan",
    lp: "0048220",
    value: "$2,150"
  }]
}];
function PipelinesScreen() {
  const {
    Card,
    CardHeader,
    StageBars
  } = window.ReeceDashboardDesignSystem_a8b733;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "24px"
    }
  }, PIPELINES.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.id
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "12px"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "16px",
      fontWeight: 600,
      color: "var(--color-navy-900)"
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12px",
      color: "var(--color-slate-500)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      color: "var(--color-slate-800)"
    }
  }, p.count), " open opps \xB7 ", p.value))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px"
    }
  }, /*#__PURE__*/React.createElement(StageBars, {
    stages: p.stages
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "16px",
      borderTop: "1px solid var(--border-soft)",
      paddingTop: "12px"
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: "0 0 8px",
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: "var(--color-slate-500)"
    }
  }, "Recent open opps"), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0
    }
  }, p.opps.map((o, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "12px",
      padding: "6px 0",
      borderBottom: i < p.opps.length - 1 ? "1px solid var(--border-soft)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "13px",
      fontWeight: 500,
      color: "var(--color-slate-900)"
    }
  }, o.name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "11px",
      fontFamily: "var(--font-mono)",
      color: "var(--color-slate-500)"
    }
  }, "LP ", o.lp)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      color: "var(--color-slate-500)"
    }
  }, o.value)))))))));
}
Object.assign(window, {
  PipelinesScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mission-control/PipelinesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mission-control/Shell.jsx
try { (() => {
/* Reece Mission Control — shell: Icon (Lucide), Sidebar, TopBar */

// ---- Lucide icon helper (builds an inline SVG from lucide.icons data) ----
function pascal(name) {
  return name.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
}
function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  style,
  className
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const node = window.lucide && window.lucide.icons[pascal(name)];
    if (!ref.current || !node) return;
    ref.current.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    Object.entries({
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }).forEach(([k, v]) => svg.setAttribute(k, v));
    (Array.isArray(node) ? Array.isArray(node[2]) ? node[2] : [] : node.iconNode || []).forEach(([tag, attrs]) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    ref.current.appendChild(svg);
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    className: className,
    style: {
      display: "inline-flex",
      lineHeight: 0,
      ...style
    }
  });
}
const NAV = [{
  id: "overview",
  label: "Overview",
  icon: "layout-dashboard"
}, {
  id: "pipelines",
  label: "Pipelines",
  icon: "git-branch"
}, {
  id: "workflows",
  label: "Workflows",
  icon: "workflow"
}, {
  id: "agent",
  label: "Decision Engine",
  icon: "bot",
  phase: 2
}, {
  id: "leads",
  label: "Leads",
  icon: "users",
  phase: 2
}, {
  id: "appointments",
  label: "Appointments",
  icon: "calendar",
  phase: 3
}, {
  id: "issues",
  label: "Issues",
  icon: "alert-triangle"
}, {
  id: "content",
  label: "Content",
  icon: "calendar-range"
}, {
  id: "settings",
  label: "Settings",
  icon: "cog"
}];
function Sidebar({
  route,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "224px",
      flexShrink: 0,
      background: "var(--color-navy-900)",
      color: "var(--color-slate-200)",
      borderRight: "1px solid var(--color-navy-700)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "16px",
      borderBottom: "1px solid var(--color-navy-700)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/reece-logo.png",
    width: "28",
    height: "28",
    style: {
      borderRadius: "var(--radius-md)",
      objectFit: "contain"
    },
    alt: "Reece"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "14px",
      fontWeight: 600,
      color: "#fff"
    }
  }, "Mission Control"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "10px",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: "var(--color-navy-300)"
    }
  }, "Reece W&D"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: "12px 8px",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      fontSize: "14px"
    }
  }, NAV.map(it => {
    const active = route === it.id;
    const stub = it.phase !== undefined;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      type: "button",
      disabled: stub,
      onClick: () => !stub && onNavigate(it.id),
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: stub ? "not-allowed" : "pointer",
        borderRadius: "var(--radius-md)",
        padding: "7px 10px",
        fontFamily: "var(--font-sans)",
        fontSize: "14px",
        background: active ? "var(--color-navy-700)" : "transparent",
        color: active ? "#fff" : stub ? "var(--color-slate-400)" : "var(--color-slate-300)",
        opacity: stub ? 0.6 : 1,
        transition: "background 150ms, color 150ms"
      },
      onMouseEnter: e => {
        if (!active && !stub) {
          e.currentTarget.style.background = "var(--color-navy-800)";
          e.currentTarget.style.color = "#fff";
        }
      },
      onMouseLeave: e => {
        if (!active && !stub) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-slate-300)";
        }
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 16
    }), /*#__PURE__*/React.createElement("span", null, it.label)), stub && /*#__PURE__*/React.createElement("span", {
      style: {
        borderRadius: "4px",
        background: "var(--color-navy-700)",
        padding: "1px 6px",
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-wider)",
        color: "var(--color-slate-400)"
      }
    }, "P", it.phase));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--color-navy-700)",
      padding: "12px 16px",
      fontSize: "11px",
      color: "var(--color-navy-300)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontWeight: 500
    }
  }, "Operator view"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "2px 0 0"
    }
  }, "Phase 1 build")));
}
function TopBar({
  title,
  subtitle,
  email = "mark@reecewindows.com",
  role = "operator",
  onSync,
  theme,
  onToggleTheme
}) {
  const [syncing, setSyncing] = React.useState(false);
  const sync = () => {
    setSyncing(true);
    onSync && onSync();
    setTimeout(() => setSyncing(false), 1200);
  };
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      borderBottom: "1px solid var(--border)",
      background: "var(--surface-card)",
      padding: "10px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "18px",
      fontWeight: 600,
      color: "var(--color-navy-900)"
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "1px 0 0",
      fontSize: "12px",
      color: "var(--color-slate-500)"
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: sync,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--color-slate-300)",
      background: "var(--surface-card)",
      color: "var(--color-navy-800)",
      padding: "6px 12px",
      fontSize: "13px",
      fontWeight: 500,
      fontFamily: "var(--font-sans)",
      cursor: "pointer",
      boxShadow: "var(--shadow-sm)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh-cw",
    size: 14,
    style: {
      animation: syncing ? "reece-spin 1s linear infinite" : "none"
    }
  }), syncing ? "Syncing…" : "Sync now"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onToggleTheme,
    "aria-label": "Toggle theme",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "32px",
      width: "32px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      background: "var(--surface-card)",
      color: "var(--color-slate-500)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: theme === "dark" ? "sun" : "moon",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      borderLeft: "1px solid var(--border)",
      paddingLeft: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "28px",
      width: "28px",
      borderRadius: "9999px",
      background: "var(--color-navy-700)",
      color: "#fff",
      textAlign: "center",
      lineHeight: "28px",
      fontFamily: "var(--font-display)",
      fontSize: "12px",
      fontWeight: 600
    }
  }, email.slice(0, 1).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "12px",
      fontWeight: 500,
      color: "var(--color-slate-800)"
    }
  }, email), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "10px",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: "var(--color-slate-500)"
    }
  }, role)))));
}
Object.assign(window, {
  Icon,
  Sidebar,
  TopBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mission-control/Shell.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.CardTitle = __ds_scope.CardTitle;

__ds_ns.CardContent = __ds_scope.CardContent;

__ds_ns.InfoButton = __ds_scope.InfoButton;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.HealthTile = __ds_scope.HealthTile;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.StageBars = __ds_scope.StageBars;

})();
