import { sanitizeSVG } from './vector.js';

// Original working placeholders. Replace these with the approved brand artwork.
const DEFAULT_COLOR = '#16365A';
const symbolGeometry = `<path d="M68 10C36 10 12 34 12 66s24 56 56 56 56-24 56-56S100 10 68 10Zm0 25c18 0 31 13 31 31S86 97 68 97 37 84 37 66s13-31 31-31Z" fill-rule="evenodd"/><rect x="144" y="10" width="26" height="112" rx="13"/>`;
const makeSVG = (width, height, content, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="${DEFAULT_COLOR}"><title>${title} — placeholder</title>${content}</svg>`;

export const ASSET_PRESETS = [
  {
    id: 'brand-symbol', name: 'Brand symbol', width: 184, height: 132,
    svg: makeSVG(184, 132, symbolGeometry, 'Brand symbol'),
  },
  {
    id: 'logotype', name: 'Logotype', width: 720, height: 132,
    svg: makeSVG(720, 132, '<text x="8" y="94" font-family="Aeonik, sans-serif" font-size="92" font-weight="400" letter-spacing="-4">One Innovation</text>', 'Logotype'),
  },
  {
    id: 'combination-mark', name: 'Combination mark', width: 948, height: 132,
    svg: makeSVG(948, 132, `${symbolGeometry}<text x="218" y="94" font-family="Aeonik, sans-serif" font-size="92" font-weight="400" letter-spacing="-4">One Innovation</text>`, 'Combination mark'),
  },
];

const PAINTED = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'use']);

function specificity(selector) {
  // Source is already sanitized. This covers Illustrator's class-based SVG
  // styles as well as presentation attributes and ordinary grouped selectors.
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const types = (selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, '').match(/(?:^|[\s>+~,(])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 100 + classes * 10 + types;
}

function sourceRules(svg) {
  const rules = [];
  for (const style of svg.querySelectorAll('style')) {
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(style.textContent || ''); } catch { continue; }
    for (const rule of sheet.cssRules) {
      if (rule.type !== 1) continue;
      rules.push({ selector: rule.selectorText, style: rule.style, specificity: specificity(rule.selectorText) });
    }
  }
  return rules;
}

/**
 * Apply one solid color to an imported vector, retaining all intentional holes
 * and stroke-only geometry. Source gradients become solid on visible artwork;
 * mask and clipping geometry are preserved so their coverage stays unchanged.
 */
export function recolorSVG(source, color) {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(color || ''))) throw new Error('Choose a solid hex color for this asset.');
  const safe = sanitizeSVG(source);
  const documentSVG = new DOMParser().parseFromString(safe, 'image/svg+xml');
  const svg = documentSVG.documentElement;
  const rules = sourceRules(svg);
  const computed = new Map();

  const paintFor = element => {
    if (computed.has(element)) return computed.get(element);
    const parent = element.parentElement && svg.contains(element.parentElement) ? paintFor(element.parentElement) : { fill: '#000000', stroke: 'none' };
    const paint = {};
    for (const property of ['fill', 'stroke']) {
      let value = element.getAttribute(property) || parent[property];
      let rank = -1;
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const candidate = rule.style.getPropertyValue(property).trim();
        if (!candidate) continue;
        let matches = false;
        try { matches = element.matches(rule.selector); } catch { /* Unsupported selector cannot affect this element. */ }
        if (!matches) continue;
        const priority = (rule.style.getPropertyPriority(property) ? 1000000 : 0) + rule.specificity * 100 + i;
        if (priority >= rank) { value = candidate; rank = priority; }
      }
      const inline = element.style.getPropertyValue(property).trim();
      if (inline) {
        const priority = (element.style.getPropertyPriority(property) ? 1000000 : 0) + 100000;
        if (priority >= rank) value = inline;
      }
      if (/^(inherit|unset)$/i.test(value)) value = parent[property];
      if (/^initial$/i.test(value)) value = property === 'fill' ? '#000000' : 'none';
      paint[property] = String(value).trim().toLowerCase() === 'none' ? 'none' : color;
    }
    computed.set(element, paint);
    return paint;
  };

  // Resolve original inheritance first; applying color to a parent must not
  // change how a child's original `fill="none"` is interpreted.
  const artwork = [svg, ...svg.querySelectorAll('*')].filter(element => PAINTED.has(element.localName) && !element.closest('mask,clipPath,filter'));
  const resolved = artwork.map(element => ({ element, paint: paintFor(element) }));
  for (const { element, paint } of resolved) {
    element.setAttribute('color', color);
    for (const property of ['fill', 'stroke']) {
      element.setAttribute(property, paint[property]);
      element.style.setProperty(property, paint[property], 'important');
    }
  }
  svg.setAttribute('color', color);
  return sanitizeSVG(new XMLSerializer().serializeToString(svg));
}
