// Icon component backed by lucide's vanilla UMD bundle.
// Lucide ships icons as ['svg', svgAttrs, [['tag', attrs], ...]]
// We render that shape as React elements so we get tree-shaken,
// real lucide paths without bundling lucide-react.

// kebab → camelCase for React SVG attrs
const ATTR_MAP = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'view-box': 'viewBox',
};
function normalizeAttrs(attrs) {
  const out = {};
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') out.className = v;
    else out[ATTR_MAP[k] || k] = v;
  }
  return out;
}

function Icon({ name, size = 16, strokeWidth = 2, className = '', style }) {
  const data = (window.lucide && window.lucide[name]) || (window.lucide && window.lucide.icons && window.lucide.icons[name]);
  if (!data) {
    return <span className={className} style={{ display: 'inline-block', width: size, height: size, ...(style||{}) }} />;
  }
  const [tag, rawAttrs, children] = data;
  const attrs = normalizeAttrs(rawAttrs);
  const finalAttrs = {
    ...attrs,
    width: size,
    height: size,
    strokeWidth,
    className: 'inline-block shrink-0 ' + className,
    style,
    'aria-hidden': true,
  };
  return React.createElement(
    tag,
    finalAttrs,
    (children || []).map((c, i) => React.createElement(c[0], { ...normalizeAttrs(c[1]), key: i }))
  );
}

window.Icon = Icon;
