import { euclideanVectorPath } from './halftone-vector.js';
import { circleCellInkArea, euclideanLevelForArea } from './halftone-tone.js';
import { normalizeFilterSettings } from './filter-settings.js';
/** Local SVG import and vector halftoning. No uploaded data leaves the browser. */
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

/**
 * Convert source coverage into editable SVG particles. Alpha mode (the default)
 * treats every source color equally. Luminance mode multiplies alpha by source
 * darkness, preserving grayscale shading and rendered blur in the ink coverage.
 * preserveAspectRatio emits a source-shaped viewBox with longest side 1000;
 * otherwise the source fits inside the original 1000-square output.
 */
export async function vectorToDots(source, options = {}) {
  const settings = normalizeFilterSettings(options);
  const check = () => {
    if (options.isCurrent && !options.isCurrent()) {
      const error = new Error('A newer halftone visual is ready.');
      error.name = 'AbortError';
      throw error;
    }
  };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  check();
  const safe = sanitizeSVG(source);
  const { width, height } = svgDimensions(safe);
  const image = await loadSVG(safe);
  check();
  const scale = SIZE / Math.max(width, height);
  const drawWidth = width >= height ? SIZE : width * scale;
  const drawHeight = height >= width ? SIZE : height * scale;
  const outputWidth = options.preserveAspectRatio ? drawWidth : SIZE;
  const outputHeight = options.preserveAspectRatio ? drawHeight : SIZE;
  const drawX = (outputWidth - drawWidth) / 2, drawY = (outputHeight - drawHeight) / 2;
  const pixelWidth = Math.max(1, Math.ceil(outputWidth));
  const pixelHeight = Math.max(1, Math.ceil(outputHeight));
  const luminanceMode = options.toneMode === 'luminance';
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser could not create the vector preview.');
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
  const stride = pixelWidth + 1;
  const integral = new Float64Array(stride * (pixelHeight + 1));
  let totalAlpha = 0;
  let totalCoverage = 0;
  for (let y = 0; y < pixelHeight; y++) {
    let rowCoverage = 0;
    for (let x = 0; x < pixelWidth; x++) {
      const index = (y * pixelWidth + x) * 4;
      const alpha = pixels[index + 3] / 255;
      const darkness = luminanceMode ? 1 - (.2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2]) / 255 : 1;
      totalAlpha += alpha;
      rowCoverage += alpha * clamp(darkness, 0, 1);
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowCoverage;
    }
    totalCoverage += rowCoverage;
    if ((y & 31) === 31) { check(); await tick(); }
  }
  if (totalAlpha < 0.01) throw new Error('This SVG contains no visible artwork to convert.');
  if (totalCoverage < 0.01) throw new Error('This SVG contains no dark tones to convert.');
  const spacing = settings.spacing;
  const sampleRadius = Math.max(0, Math.round(spacing * .25 * settings.edgeSampling));
  const minimum = Math.min(settings.minSize, settings.maxSize);
  const maximum = Math.max(settings.minSize, settings.maxSize);
  // A zero tone or transparent center must stay empty before the minimum-size
  // floor is applied, so a larger minimum cannot fill transparent cutouts.
  const diameterAtPixel = (x, y) => {
    const alpha = pixels[(y * pixelWidth + x) * 4 + 3] / 255;
    if (alpha < .008) return 0;
    const left = Math.max(0, x - sampleRadius), top = Math.max(0, y - sampleRadius);
    const right = Math.min(pixelWidth, x + sampleRadius + 1), bottom = Math.min(pixelHeight, y + sampleRadius + 1);
    const sum = integral[bottom * stride + right] - integral[top * stride + right]
      - integral[bottom * stride + left] + integral[top * stride + left];
    const tone = sum / ((right - left) * (bottom - top)) * Math.sqrt(alpha);
    if (tone <= 0) return 0;
    return (minimum + (maximum - minimum) * Math.sqrt(tone)) * settings.dotScale;
  };
  const particles = [];
  const intentionallyEmpty = settings.dotScale === 0 || maximum === 0;
  if (!intentionallyEmpty && settings.particlePattern !== 'dot') {
    // Preserve the prior ink density: map the bounded particle's actual circle
    // area into the Euclidean screen's area LUT, then contour that field.
    const tones = new Float32Array(pixelWidth * pixelHeight);
    for (let y = 0; y < pixelHeight; y++) {
      for (let x = 0; x < pixelWidth; x++) {
        const diameter = diameterAtPixel(x, y);
        if (!diameter) continue;
        const normalizedRadius = diameter / (2 * spacing);
        tones[y * pixelWidth + x] = euclideanLevelForArea(circleCellInkArea(normalizedRadius * normalizedRadius));
      }
      if ((y & 7) === 7) { check(); await tick(); }
    }
    const sampleCoverage = (x, y) => {
      if (x < 0 || y < 0 || x > outputWidth || y > outputHeight) return 0;
      const px = clamp(x - .5, 0, pixelWidth - 1), py = clamp(y - .5, 0, pixelHeight - 1);
      const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, pixelWidth - 1), y1 = Math.min(y0 + 1, pixelHeight - 1);
      const tx = px - x0, ty = py - y0;
      const a = tones[y0 * pixelWidth + x0] * (1 - tx) + tones[y0 * pixelWidth + x1] * tx;
      const b = tones[y1 * pixelWidth + x0] * (1 - tx) + tones[y1 * pixelWidth + x1] * tx;
      return a * (1 - ty) + b * ty;
    };
    const path = await euclideanVectorPath({
      width: outputWidth, height: outputHeight, spacing, sampleCoverage,
      rotation: settings.screenRotation, centerX: settings.centerX, centerY: settings.centerY,
      isCurrent: options.isCurrent,
    });
    if (path) particles.push(`<path fill-rule="evenodd" d="${path}"/>`);
  } else if (!intentionallyEmpty) {
    const columns = Math.max(1, Math.ceil(outputWidth / spacing - 1e-9));
    const rows = Math.max(1, Math.ceil(outputHeight / spacing - 1e-9));
    const centerX = outputWidth * settings.centerX / 100, centerY = outputHeight * settings.centerY / 100;
    const angle = settings.screenRotation * Math.PI / 180;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    // Retain the old centered rectangular grid's half-cell phase when its
    // number of rows/columns is even, including at the default 0° rotation.
    const phaseX = columns % 2 === 0 ? .5 : 0, phaseY = rows % 2 === 0 ? .5 : 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let corner = 0; corner < 4; corner++) {
      const x = (corner & 1 ? outputWidth : 0) - centerX;
      const y = (corner & 2 ? outputHeight : 0) - centerY;
      const gx = (cosine * x + sine * y) / spacing - phaseX;
      const gy = (-sine * x + cosine * y) / spacing - phaseY;
      minX = Math.min(minX, gx); maxX = Math.max(maxX, gx);
      minY = Math.min(minY, gy); maxY = Math.max(maxY, gy);
    }
    for (let row = Math.ceil(minY); row <= Math.floor(maxY); row++) {
      for (let column = Math.ceil(minX); column <= Math.floor(maxX); column++) {
        const gx = (column + phaseX) * spacing, gy = (row + phaseY) * spacing;
        const cx = centerX + cosine * gx - sine * gy, cy = centerY + sine * gx + cosine * gy;
        if (cx < 0 || cy < 0 || cx > outputWidth || cy > outputHeight) continue;
        const px = Math.min(pixelWidth - 1, Math.max(0, Math.floor(cx)));
        const py = Math.min(pixelHeight - 1, Math.max(0, Math.floor(cy)));
        const radius = diameterAtPixel(px, py) / 2;
        if (radius < .08) continue;
        particles.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${radius.toFixed(3)}"/>`);
      }
      if ((row & 7) === 7) { check(); await tick(); }
    }
  }
  check();
  if (!particles.length && !intentionallyEmpty) throw new Error('No particles fit this artwork. Reduce spacing or increase particle size.');
  const color = colorValue(options.color, '#3982e9');
  const color2 = colorValue(options.color2, '#aacef3');
  const angle = (number(options.angle, 0) % 360) * Math.PI / 180;
  const dx = Math.cos(angle) * SIZE / 2, dy = Math.sin(angle) * SIZE / 2;
  const centerX = outputWidth / 2, centerY = outputHeight / 2;
  const gradientID = `vector-gradient-${crypto.randomUUID()}`;
  const gradient = options.gradient ? `<defs><linearGradient id="${gradientID}" gradientUnits="userSpaceOnUse" x1="${(centerX - dx).toFixed(3)}" y1="${(centerY - dy).toFixed(3)}" x2="${(centerX + dx).toFixed(3)}" y2="${(centerY + dy).toFixed(3)}"><stop stop-color="${escapeXML(color)}"/><stop offset="1" stop-color="${escapeXML(color2)}"/></linearGradient></defs>` : '';
  const viewWidth = +outputWidth.toPrecision(12), viewHeight = +outputHeight.toPrecision(12);
  const definitions = [];
  const blurRadius = settings.filterSoftness * spacing * .15;
  const blurID = `particle-softness-${crypto.randomUUID()}`;
  if (blurRadius > 0) {
    const padding = blurRadius * 4;
    definitions.push(`<filter id="${blurID}" filterUnits="userSpaceOnUse" x="${-padding}" y="${-padding}" width="${outputWidth + padding * 2}" height="${outputHeight + padding * 2}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blurRadius}"/></filter>`);
  }
  const maskID = `particle-alpha-${crypto.randomUUID()}`;
  if (settings.clipToAlpha) {
    const maskSource = parseSVG(safe).svg;
    maskSource.setAttribute('x', String(drawX));
    maskSource.setAttribute('y', String(drawY));
    maskSource.setAttribute('width', String(drawWidth));
    maskSource.setAttribute('height', String(drawHeight));
    maskSource.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    definitions.push(`<mask id="${maskID}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${outputWidth}" height="${outputHeight}" mask-type="alpha">${new XMLSerializer().serializeToString(maskSource)}</mask>`);
  }
  const defs = definitions.length ? `<defs>${definitions.join('')}</defs>` : '';
  let artwork = `<g fill="${options.gradient ? `url(#${gradientID})` : escapeXML(color)}"${blurRadius > 0 ? ` filter="url(#${blurID})"` : ''}>${particles.join('')}</g>`;
  if (settings.clipToAlpha) artwork = `<g mask="url(#${maskID})">${artwork}</g>`;
  const metadata = `data-particle-pattern="${settings.particlePattern}" data-min-size="${minimum}" data-max-size="${maximum}" data-spacing="${spacing}" data-dot-scale="${settings.dotScale}" data-filter-softness="${settings.filterSoftness}" data-screen-rotation="${settings.screenRotation}" data-center-x="${settings.centerX}" data-center-y="${settings.centerY}" data-clip-to-alpha="${settings.clipToAlpha}" data-edge-sampling="${settings.edgeSampling}"`;
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}" role="img" aria-label="Halftone vector artwork" ${metadata}>${gradient}${defs}${artwork}</svg>`;
}
