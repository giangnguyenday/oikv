/** One Innovation — deterministic, resolution-independent halftone fields. */
export const TYPES = [
  { id: 'strengthen', name: 'Strengthen', number: '01', description: 'Small signals become a stronger whole.' },
  { id: 'reshape', name: 'Reshape', number: '02', description: 'Intelligence takes a new form.' },
  { id: 'reorganize', name: 'Reorganize', number: '03', description: 'A new order opens new possibilities.' },
  { id: 'optimize', name: 'Optimize', number: '04', description: 'Every part finds its place.' },
];

// These pairings are deliberately centralized so the brand palette stays editable.
export const PALETTES = [
  { id: 'electric', name: 'Electric blue', background: '#021427', foreground: '#3982e9', accent: '#aacef3' },
  { id: 'warm', name: 'Warm signal', background: '#f4f4f4', foreground: '#ff6638', accent: '#fda68c' },
  { id: 'mist', name: 'Blue on mist', background: '#d8d8d8', foreground: '#3982e9', accent: '#aacef3' },
  { id: 'teal', name: 'Living teal', background: '#16365a', foreground: '#56a7b3', accent: '#bbbeab' },
  { id: 'paper', name: 'Paper', background: '#f4f4f4', foreground: '#16365a', accent: '#d6c3d9' },
  { id: 'coral', name: 'Coral field', background: '#ff6638', foreground: '#f4f4f4', accent: '#fda68c' },
];

export const defaults = {
  type: 'reorganize', palette: 'electric', seed: 1122, density: 70, dotSize: 1,
  scale: 1, rotation: 0, spread: 1, softness: 1, width: 1600, height: 1000,
  showText: false, headline: 'Intelligence,\nin every possibility.',
  caption: 'Adaptive Living Intelligence', wordmark: false, invert: false, phase: 0,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function random(seed) {
  let a = seed | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function coordinateHash(x, y, seed) {
  let n = Math.imul(x + 17191, 374761393) ^ Math.imul(y + 9511, 668265263) ^ Math.imul(seed, 144269);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

function smoothMin(a, b, k = .2) {
  const h = clamp(.5 + .5 * (b - a) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}

function ellipse(x, y, cx, cy, rx, ry, p = 2) {
  return (Math.pow(Math.pow(Math.abs((x - cx) / rx), p) + Math.pow(Math.abs((y - cy) / ry), p), 1 / p) - 1) * Math.min(rx, ry);
}

function preparedState(input = {}) {
  const s = { ...defaults, ...input };
  s.width = clamp(Math.round(finite(s.width, defaults.width)), 100, 10000);
  s.height = clamp(Math.round(finite(s.height, defaults.height)), 100, 10000);
  s.seed = finite(s.seed, defaults.seed) | 0;
  s.density = clamp(finite(s.density, defaults.density), 0, 110);
  s.dotSize = clamp(finite(s.dotSize, 1), .2, 2);
  s.scale = clamp(finite(s.scale, 1), .3, 2.5);
  s.spread = clamp(finite(s.spread, 1), .4, 2);
  s.softness = clamp(finite(s.softness, 1), .25, 2);
  s.rotation = finite(s.rotation, 0);
  s.phase = finite(s.phase, 0);
  if (!TYPES.some(t => t.id === s.type)) s.type = defaults.type;
  return s;
}

export function getPalette(state = {}) {
  const requested = typeof state.palette === 'object' && state.palette ? state.palette : PALETTES.find(p => p.id === state.palette);
  const p = { ...PALETTES[0], ...requested };
  return state.invert ? { ...p, background: p.foreground, foreground: p.background, accent: p.background } : p;
}

function makeField(s) {
  const rand = random(s.seed);
  const shift = Array.from({ length: 8 }, () => (rand() - .5) * .16);
  const phase = s.phase * Math.PI * 2;
  const a = rand() * Math.PI * 2;
  const variation = .045 + rand() * .025;
  return (ox, oy) => {
    // Continuous low-frequency displacement creates a living surface. The grid
    // itself remains untouched, keeping the design's characteristic alignment.
    const x = ox + variation * Math.sin(oy * 4.1 + a + phase * .22) + .018 * Math.sin(oy * 10 - a);
    const y = oy + variation * Math.sin(ox * 3.5 - a - phase * .18) + .016 * Math.cos(ox * 9 + a);
    const sp = s.spread;
    let distance;
    if (s.type === 'strengthen') {
      const body = ellipse(x, y, .29 + shift[0], shift[1], .66, .43, 2.8);
      const shoulder = ellipse(x, y, .55, -.14, .36, .39, 2.5);
      const signal = ellipse(x, y, -.73 * sp, .025 + shift[2], .25, .265, 2.8);
      distance = smoothMin(smoothMin(body, shoulder, .22), signal, .15 / sp);
    } else if (s.type === 'reshape') {
      const shapes = [
        ellipse(x, y, -.33 * sp + shift[0], -.43 * sp, .48, .34, 2.6),
        ellipse(x, y, .29 * sp, -.31 * sp + shift[1], .43, .35, 2.2),
        ellipse(x, y, -.34 * sp, .24 * sp, .38, .48, 2.4),
        ellipse(x, y, .30 * sp + shift[3], .38 * sp, .45, .39, 2.7),
        ellipse(x, y, .67 * sp, .09 + shift[4], .22, .28, 2.5),
      ];
      distance = shapes.reduce((d, e) => smoothMin(d, e, .17));
      // A folded recess rather than a simple central hole.
      const fold = ellipse(x, y, .10 + shift[5], -.04, .145, .26, 2.4);
      distance = Math.max(distance, -fold * .75);
    } else if (s.type === 'reorganize') {
      const outer = ellipse(x, y, 0, 0, .78, .77, 3.5);
      const innerX = (x + y) * Math.SQRT1_2;
      const innerY = (y - x) * Math.SQRT1_2;
      const inner = ellipse(innerX, innerY, shift[1] * .35, shift[3] * .35, .31 * sp, .34 * sp, 3.1);
      distance = Math.max(outer, -inner);
    } else {
      const gap = .37 * sp;
      const petal = (cx, cy, sx, sy) => ellipse(x, y, cx, cy, sx, sy, 3.0);
      distance = Math.min(
        petal(-gap + shift[0] * .3, -gap, .29, .31),
        petal(gap, -gap + shift[1] * .3, .30, .31),
        petal(-gap, gap + shift[3] * .3, .30, .31),
        petal(gap + shift[4] * .3, gap, .30, .30),
        ellipse(x, y, -.98 * sp, .015, .12, .13, 2.6),
        ellipse(x, y, .98 * sp, -.015, .12, .13, 2.6),
      );
    }
    const edge = .145 * s.softness;
    const silhouette = 1 - smoothstep(-.055, edge, distance);
    // Subtle grazing light and an inhomogeneous surface give depth without
    // gradients or raster layers: all visible marks remain individual circles.
    const light = .82 + .09 * Math.sin(x * 4.7 + y * 3.0 + a) + .065 * Math.cos(y * 6.7 - x * 2.1 + phase * .25);
    const contour = .93 + .07 * Math.sin(x * 13.1 + Math.sin(y * 5) * 1.6 + a);
    return clamp(silhouette * light * contour, 0, 1);
  };
}

/** The returned circles use output pixels, so SVG and raster exports coincide. */
export function generatePoints(input = {}) {
  const s = preparedState(input);
  const field = makeField(s);
  const min = Math.min(s.width, s.height);
  const portrait = s.height > s.width * 1.1;
  const textLayout = s.showText;
  const centerX = textLayout && !portrait ? s.width * .69 : s.width * .5;
  const centerY = textLayout && portrait ? s.height * .60 : s.height * .49;
  const heightLimit = ({ strengthen: .63, reshape: .50, reorganize: .53, optimize: .49 })[s.type];
  const artworkLimit = textLayout && !portrait ? Math.min(s.height * .47, s.width * .278) : Math.min(s.height * heightLimit, s.width * .40);
  const unit = artworkLimit * s.scale;
  const spacing = min / mix(55, 155, s.density / 100);
  const angle = -s.rotation * Math.PI / 180;
  const c = Math.cos(angle), sn = Math.sin(angle);
  const points = [];
  const maxRadius = spacing * .425 * s.dotSize;
  const cols = Math.ceil(s.width / spacing), rows = Math.ceil(s.height / spacing);
  const offsetX = (s.width - (cols - 1) * spacing) / 2;
  const offsetY = (s.height - (rows - 1) * spacing) / 2;
  for (let row = 0; row < rows; row++) {
    const py = row * spacing + offsetY;
    for (let col = 0; col < cols; col++) {
      const px = col * spacing + offsetX;
      const dx = (px - centerX) / unit;
      const dy = (py - centerY) / unit;
      const x = dx * c - dy * sn;
      const y = dx * sn + dy * c;
      if (Math.abs(x) > 1.6 || Math.abs(y) > 1.35) continue;
      const value = field(x, y);
      if (value < .018) continue;
      const grain = coordinateHash(col, row, s.seed);
      const radius = maxRadius * Math.pow(value, .79) * (.94 + grain * .12);
      if (radius < spacing * .028) continue;
      // Sparse outermost points keep the falloff airy, with no random movement.
      if (value < .12 && grain > value * 7.5) continue;
      points.push({ x: +px.toFixed(3), y: +py.toFixed(3), r: +radius.toFixed(3), opacity: +(value < .18 ? mix(.48, 1, value / .18) : 1).toFixed(3) });
    }
  }
  return points;
}

// Advance widths from the supplied Signifier Light font. A small kerning
// allowance keeps the estimate close to the browser's shaped text width.
const SIGNIFIER_WIDTHS = {
  ' ': .2, '!': .308, '"': .336, '#': .651, '$': .547, '%': .683, '&': .824, "'": .185,
  '(': .405, ')': .405, '*': .47, '+': .6, ',': .251, '-': .402, '.': .251, '/': .419,
  '0': .598, '1': .423, '2': .527, '3': .482, '4': .626, '5': .492, '6': .556, '7': .513, '8': .545, '9': .556,
  ':': .251, ';': .251, '<': .599, '=': .6, '>': .599, '?': .463, '@': .942,
  A: .765, B: .646, C: .681, D: .785, E: .65, F: .604, G: .774, H: .857, I: .361, J: .355, K: .712, L: .625, M: .965,
  N: .778, O: .805, P: .624, Q: .805, R: .693, S: .547, T: .723, U: .771, V: .75, W: 1.067, X: .799, Y: .745, Z: .652,
  '[': .435, '\\': .419, ']': .435, '^': .382, _: .513, '`': .5,
  a: .447, b: .537, c: .427, d: .559, e: .453, f: .309, g: .506, h: .56, i: .277, j: .245, k: .533, l: .275, m: .849,
  n: .564, o: .531, p: .552, q: .533, r: .389, s: .379, t: .359, u: .553, v: .49, w: .705, x: .504, y: .49, z: .452,
  '{': .445, '|': .326, '}': .445, '~': .513,
};

function estimatedTitleWidth(text, fontSize) {
  const chars = Array.from(text);
  const advances = chars.reduce((sum, char) => {
    if (/\p{Mark}/u.test(char)) return sum;
    const base = char.normalize('NFD')[0];
    return sum + (SIGNIFIER_WIDTHS[char] ?? SIGNIFIER_WIDTHS[base] ?? 1);
  }, 0);
  return Math.max(0, (advances * .98 - Math.max(0, chars.length - 1) * .026) * fontSize);
}

function wrapTitle(text, fontSize, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let remaining = Array.from(paragraph);
    if (!remaining.length) { lines.push(''); continue; }
    while (remaining.length) {
      let count = 0, lastSpace = -1;
      while (count < remaining.length && estimatedTitleWidth(remaining.slice(0, count + 1).join(''), fontSize) <= maxWidth) {
        if (/\s/u.test(remaining[count])) lastSpace = count;
        count++;
      }
      // Keep every character, including the whitespace at a wrapping boundary.
      // A long unbroken word wraps at a character boundary rather than spilling.
      if (count < remaining.length && lastSpace >= 0) count = lastSpace + 1;
      count = Math.max(1, count);
      lines.push(remaining.slice(0, count).join(''));
      remaining = remaining.slice(count);
    }
  }
  return lines;
}

function fitTitle(text, initialSize, maxWidth, maxHeight) {
  let size = initialSize;
  let lines = wrapTitle(text, size, maxWidth);
  while (lines.length * size * 1.06 > maxHeight || lines.some(line => estimatedTitleWidth(line, size) > maxWidth)) {
    size *= .97;
    lines = wrapTitle(text, size, maxWidth);
  }
  return { lines, size };
}

function textMarkup(s, palette) {
  if (!s.showText) return '';
  const width = s.width, height = s.height, min = Math.min(width, height);
  const margin = min * .07;
  const bg = palette.background.replace('#', '');
  const luminance = bg.length === 6 ? (parseInt(bg.slice(0, 2), 16) * .299 + parseInt(bg.slice(2, 4), 16) * .587 + parseInt(bg.slice(4, 6), 16) * .114) / 255 : .1;
  const color = luminance > .67 ? '#16365a' : '#f4f4f4';
  const portrait = height > width * 1.1;
  let result = '';
  if (s.showText) {
    const { lines, size: titleSize } = fitTitle(String(s.headline || ''), min * (portrait ? .082 : .073), width * (portrait ? .85 : .34), height * (portrait ? .23 : .40));
    const y = portrait ? margin + titleSize : height * .36;
    result += `<g fill="${xml(color)}"><text x="${margin}" y="${margin + min * .016}" font-family="Aeonik, sans-serif" font-size="${min * .013}" letter-spacing="${min * .0018}">${xml(s.caption)}</text>`;
    result += `<text xml:space="preserve" font-family="Signifier, Georgia, serif" font-weight="300" font-size="${titleSize}" letter-spacing="${-titleSize * .026}">`;
    lines.forEach((line, i) => { result += `<tspan x="${margin}" y="${y + i * titleSize * 1.06}">${xml(line)}</tspan>`; });
    result += '</text></g>';
  }
  if (s.wordmark) {
    result += `<text x="${margin}" y="${height - margin}" fill="${xml(color)}" font-family="Aeonik, sans-serif" font-size="${min * .034}" letter-spacing="${-min * .001}">One Innovation</text>`;
    result += `<text x="${width - margin}" y="${height - margin}" text-anchor="end" fill="${xml(color)}" opacity=".65" font-family="Aeonik, sans-serif" font-size="${min * .011}">${xml(TYPES.find(t => t.id === s.type).name)} / ${String(s.seed).padStart(4, '0')}</text>`;
  }
  return result;
}

export function renderSVG(input = {}, options = {}) {
  const s = preparedState(input);
  const palette = getPalette(s);
  const points = generatePoints(s);
  const type = TYPES.find(t => t.id === s.type);
  const gradient = options.gradient ?? s.gradient ?? false;
  const uid = `kv-${s.type}-${s.seed}-${s.width}-${s.height}`;
  const gradientDef = gradient ? `<linearGradient id="${uid}-background" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${xml(palette.background)}"/><stop offset="57%" stop-color="${xml(palette.background)}"/><stop offset="100%" stop-color="${xml(palette.accent)}"/></linearGradient>` : '';
  const background = options.background === false ? '' : `<rect width="${s.width}" height="${s.height}" fill="${gradient ? `url(#${uid}-background)` : xml(palette.background)}"/>`;
  const fontStyle = options.fontsCss ? `<style>${options.fontsCss.replace(/<\/style/gi, '&lt;/style')}</style>` : '';
  const css = gradientDef || fontStyle ? `<defs>${gradientDef}${fontStyle}</defs>` : '';
  const circles = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}"${p.opacity < 1 ? ` opacity="${p.opacity}"` : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}" role="img" aria-labelledby="${uid}-title"><title id="${uid}-title">One Innovation — ${type.name}</title>${css}${background}<g fill="${xml(palette.foreground)}">${circles}</g>${textMarkup(s, palette)}</svg>`;
}
