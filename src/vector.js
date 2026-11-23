/** Local SVG import and alpha-based vector halftoning. No uploaded data leaves the browser. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_BYTES = 2 * 1024 * 1024;
const SIZE = 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'title', 'desc',
  'clipPath', 'mask', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'stop',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
  'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'style',
]);
const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'color', 'clip-path', 'clip-rule', 'mask', 'filter',
  'marker-start', 'marker-mid', 'marker-end', 'paint-order', 'vector-effect',
  'display', 'visibility', 'overflow', 'isolation', 'mix-blend-mode',
  'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color',
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch',
  'font-variant', 'letter-spacing', 'word-spacing', 'text-anchor',
  'dominant-baseline', 'alignment-baseline', 'text-decoration', 'white-space',
  'color-interpolation', 'color-interpolation-filters', 'shape-rendering',
  'text-rendering', 'transform', 'transform-origin', 'transform-box',
]);
const ATTRIBUTES = new Set([
  'id', 'class', 'data-vector-scope', 'viewbox', 'preserveaspectratio', 'version', 'x', 'y', 'x1', 'y1',
  'x2', 'y2', 'width', 'height', 'rx', 'ry', 'r', 'cx', 'cy', 'd', 'points',
  'pathlength', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust', 'startoffset',
  'method', 'spacing', 'side', 'offset', 'gradientunits', 'gradienttransform',
  'spreadmethod', 'fx', 'fy', 'fr', 'patternunits', 'patterncontentunits',
  'patterntransform', 'clippathunits', 'maskunits', 'maskcontentunits', 'mask-type',
  'markerunits', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient',
  'filterunits', 'primitiveunits', 'in', 'in2', 'result', 'mode', 'type', 'values',
  'operator', 'k1', 'k2', 'k3', 'k4', 'order', 'kernelmatrix', 'divisor', 'bias',
  'targetx', 'targety', 'edgemode', 'preservealpha', 'surfacescale',
  'diffuseconstant', 'specularconstant', 'specularexponent', 'limitingconeangle',
  'azimuth', 'elevation', 'pointsatx', 'pointsaty', 'pointsatz', 'z', 'scale',
  'xchannelselector', 'ychannelselector', 'stddeviation', 'radius', 'tablevalues',
  'slope', 'intercept', 'amplitude', 'exponent', 'basefrequency', 'numoctaves',
  'seed', 'stitchtiles',
]);

function parseSVG(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Choose an SVG file containing vector artwork.');
  if (source.length > MAX_BYTES || new TextEncoder().encode(source).length > MAX_BYTES) throw new Error('Choose an SVG smaller than 2 MB.');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new Error('This SVG contains unsupported document declarations.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg' || (svg.namespaceURI && svg.namespaceURI !== SVG_NS)) {
    throw new Error('Choose a valid SVG file.');
  }
  return { doc, svg };
}

function lengthInPixels(value) {
  const match = String(value || '').trim().match(/^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|in|cm|mm|q)?$/i);
  if (!match) return NaN;
  return Number(match[1]) * ({ px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 }[String(match[2] || 'px').toLowerCase()]);
}

function dimensionsOf(svg) {
  const value = svg.getAttribute('viewBox');
  let box;
  if (value !== null) {
    box = value.trim().split(/[\s,]+/).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('This SVG needs a valid viewBox.');
  } else {
    const width = lengthInPixels(svg.getAttribute('width'));
    const height = lengthInPixels(svg.getAttribute('height'));
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('This SVG needs a viewBox or a positive width and height.');
    box = [0, 0, width, height];
  }
  if (box.some(value => Math.abs(value) > 1e9)) throw new Error('This SVG uses unsupported dimensions.');
  return { width: box[2], height: box[3], viewBox: box };
}

/** Dimensions follow the source viewBox, including its original coordinate origin. */
export function svgDimensions(source) {
  return dimensionsOf(parseSVG(source).svg);
}

function safeValue(value) {
  if (/[\\<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /(?:javascript|vbscript)\s*:|expression\s*\(|@import/i.test(value)) return false;
  const urls = [...value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  if (urls.some(match => !/^#[^\s"'<>()[\]{}\\]+$/.test(match[2].trim()))) return false;
  return !/url\s*\(/i.test(value.replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, ''));
}

function rewriteURLs(value, ids) {
  return value.replace(/url\s*\(\s*(['"]?)#([^\s"'<>()[\]{}\\]+)\1\s*\)/gi, (match, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
}

function safeDeclarations(source, ids) {
  const parsed = document.createElement('span').style;
  parsed.cssText = source;
  const declarations = [];
  for (const property of Array.from(parsed)) {
    const value = parsed.getPropertyValue(property).trim();
    if (PRESENTATION.has(property) && safeValue(value)) declarations.push(`${property}:${rewriteURLs(value, ids)}${parsed.getPropertyPriority(property) ? '!important' : ''}`);
  }
  return declarations.join(';');
}

function safeStyleSheet(source, scope, ids) {
  // This sheet is never adopted into a document, so parsing cannot load resources.
  // All at-rules (including imports and font faces) are discarded.
  const sheet = new CSSStyleSheet();
  try { sheet.replaceSync(source); } catch { return ''; }
  return Array.from(sheet.cssRules).filter(rule => rule.type === 1).map(rule => {
    const declarations = safeDeclarations(rule.style.cssText, ids);
    const selector = rule.selectorText.replace(/#([a-zA-Z_][\w-]*)/g, (match, id) => ids.has(id) ? `#${ids.get(id)}` : match);
    // SVG <style> participates in the containing HTML page's cascade. Scope
    // every selector to this asset so importing a logo cannot restyle the app.
    return declarations && safeValue(selector) ? `${scope}:is(${selector}),${scope} :is(${selector}){${declarations}}` : '';
  }).join('');
}

/** Normalize SVG into a passive, self-contained vector suitable for inline preview. */
export function sanitizeSVG(source) {
  const { svg } = parseSVG(source);
  const dimensions = dimensionsOf(svg);
  const existingScope = svg.getAttribute('data-vector-scope');
  const scopeID = /^[a-zA-Z0-9-]{1,80}$/.test(existingScope || '') ? existingScope : `v-${crypto.randomUUID()}`;
  svg.setAttribute('data-vector-scope', scopeID);
  const scope = `[data-vector-scope="${scopeID}"]`;
  const elements = [svg, ...svg.querySelectorAll('*')];
  if (elements.length > 50000) throw new Error('This SVG contains too many elements. Try a simpler vector.');
  const ids = new Map();
  for (const el of elements) {
    const id = el.getAttribute('id');
    if (id && !ids.has(id)) ids.set(id, id.startsWith(`${scopeID}-id-`) ? id : `${scopeID}-id-${ids.size}`);
  }
  for (const el of elements) {
    if (!svg.contains(el) && el !== svg) continue;
    if (!ELEMENTS.has(el.localName) || (el.namespaceURI && el.namespaceURI !== SVG_NS)) {
      el.remove();
      continue;
    }
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name === 'xmlns' && el === svg) continue;
      if (name === 'xmlns:xlink') { el.setAttribute(name, 'http://www.w3.org/1999/xlink'); continue; }
      if (name === 'href' || name === 'xlink:href') {
        if (!/^#[^\s"'<>()[\]{}\\]+$/.test(value.trim())) el.removeAttribute(attribute.name);
        else if (ids.has(value.trim().slice(1))) el.setAttribute(attribute.name, `#${ids.get(value.trim().slice(1))}`);
        continue;
      }
      if (name === 'style') {
        const style = safeDeclarations(value, ids);
        if (style) el.setAttribute('style', style); else el.removeAttribute('style');
        continue;
      }
      if ((!ATTRIBUTES.has(name) && !PRESENTATION.has(name)) || !safeValue(value)) el.removeAttribute(attribute.name);
      else if (name === 'id' && ids.has(value)) el.setAttribute(attribute.name, ids.get(value));
      else el.setAttribute(attribute.name, rewriteURLs(value, ids));
    }
    if (el.localName === 'style') {
      const css = safeStyleSheet(el.textContent || '', scope, ids);
      if (css) el.textContent = css; else el.remove();
    }
  }
  // Processing instructions and comments are unnecessary in an imported asset.
  const walker = svg.ownerDocument.createTreeWalker(svg, NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_COMMENT);
  const extraNodes = [];
  while (walker.nextNode()) extraNodes.push(walker.currentNode);
  extraNodes.forEach(node => node.remove());
  const graphic = [...svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,use')].some(el => {
    if (el.closest('defs,symbol,clipPath,mask,marker,pattern,filter')) return false;
    if (el.localName === 'use') return el.hasAttribute('href') || el.hasAttribute('xlink:href');
    if (el.localName === 'path') return Boolean(el.getAttribute('d')?.trim());
    if (el.localName === 'text') return Boolean(el.textContent?.trim());
    return true;
  });
  if (!graphic) throw new Error('This SVG has no visible vector shapes.');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', dimensions.viewBox.join(' '));
  svg.setAttribute('width', String(dimensions.width));
  svg.setAttribute('height', String(dimensions.height));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(svg);
}

export function svgToDataURL(source) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSVG(source))}`;
}

function loadSVG(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ''; reject(new Error('This SVG took too long to render. Try a simpler vector.')); }, 12000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('This SVG could not be rendered.')); };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });
}

function colorValue(value, fallback) {
  const color = String(value || '').trim();
  return color && CSS.supports('color', color) && safeValue(color) ? color : fallback;
}

/** Convert source alpha into editable SVG circles; source colors never change coverage. */
export async function vectorToDots(source, options = {}) {
  const safe = sanitizeSVG(source);
  const { width, height } = svgDimensions(safe);
  const image = await loadSVG(safe);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser could not create the vector preview.');
  const scale = Math.min(SIZE / width, SIZE / height);
  const drawWidth = width * scale, drawHeight = height * scale;
  context.drawImage(image, (SIZE - drawWidth) / 2, (SIZE - drawHeight) / 2, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
  const stride = SIZE + 1;
  const integral = new Float64Array(stride * stride);
  let totalAlpha = 0;
  for (let y = 0; y < SIZE; y++) {
    let rowAlpha = 0;
    for (let x = 0; x < SIZE; x++) {
      rowAlpha += pixels[(y * SIZE + x) * 4 + 3] / 255;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowAlpha;
    }
    totalAlpha += rowAlpha;
  }
  if (totalAlpha < 0.01) throw new Error('This SVG contains no visible artwork to convert.');
  const density = clamp(number(options.density, 70), 35, 110);
  const dotSize = clamp(number(options.dotSize, 1), .45, 1.6);
  const softness = clamp(number(options.softness, 1), .4, 1.8);
  const cells = Math.round(55 + density);
  const spacing = SIZE / cells;
  const maximumRadius = spacing * .425 * dotSize;
  const sampleRadius = Math.max(1, Math.round(spacing * .25 * softness));
  const circles = [];
  for (let row = 0; row < cells; row++) {
    const cy = (row + .5) * spacing;
    for (let col = 0; col < cells; col++) {
      const cx = (col + .5) * spacing;
      const px = Math.floor(cx), py = Math.floor(cy);
      // Sampling alpha, not luminance, keeps white artwork and transparent holes.
      const center = pixels[(py * SIZE + px) * 4 + 3] / 255;
      if (center < .008) continue;
      const left = Math.max(0, px - sampleRadius), top = Math.max(0, py - sampleRadius);
      const right = Math.min(SIZE, px + sampleRadius + 1), bottom = Math.min(SIZE, py + sampleRadius + 1);
      const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
      const coverage = sum / ((right - left) * (bottom - top));
      const radius = maximumRadius * Math.sqrt(coverage * Math.sqrt(center));
      if (radius < .08) continue;
      circles.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${radius.toFixed(3)}"/>`);
    }
  }
  if (!circles.length) throw new Error('The artwork is too fine at this density. Increase the dot density.');
  const color = colorValue(options.color, '#3982e9');
  const color2 = colorValue(options.color2, '#aacef3');
  const angle = (number(options.angle, 0) % 360) * Math.PI / 180;
  const dx = Math.cos(angle) * SIZE / 2, dy = Math.sin(angle) * SIZE / 2;
  const gradientID = `vector-gradient-${crypto.randomUUID()}`;
  const gradient = options.gradient ? `<defs><linearGradient id="${gradientID}" gradientUnits="userSpaceOnUse" x1="${(500 - dx).toFixed(3)}" y1="${(500 - dy).toFixed(3)}" x2="${(500 + dx).toFixed(3)}" y2="${(500 + dy).toFixed(3)}"><stop stop-color="${escapeXML(color)}"/><stop offset="1" stop-color="${escapeXML(color2)}"/></linearGradient></defs>` : '';
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="Halftone vector artwork">${gradient}<g fill="${options.gradient ? `url(#${gradientID})` : escapeXML(color)}">${circles.join('')}</g></svg>`;
}
