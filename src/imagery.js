/** Local image treatments. Images never leave this browser. */
const MAX_SIDE = 1600;
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot process images.');
  return { canvas, context };
}

async function decodeImage(src) {
  if (typeof src !== 'string' || !/^(?:data:image\/(?:png|jpe?g|webp|gif|avif);|blob:)/i.test(src)) {
    throw new Error('Choose a PNG, JPEG, or WebP image from your computer.');
  }
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('This image could not be opened. Try a PNG, JPEG, or WebP.'));
    image.src = src;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The image has no usable dimensions.');
  return image;
}

export async function readImageFile(file) {
  if (!file || !ALLOWED_TYPES.has(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Choose an image smaller than 30 MB.');
  if (!file.size) throw new Error('The image file is empty.');
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The image could not be read. Please choose it again.'));
    reader.readAsDataURL(file);
  });
  const image = await decodeImage(src);
  const ratio = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  // Store a bounded source so repeated edits and saved projects stay manageable.
  const { canvas, context } = createCanvas(width, height);
  context.drawImage(image, 0, 0, width, height);
  return { src: canvas.toDataURL('image/png'), width, height, name: file.name || 'Image' };
}

const distanceSquared = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Estimate dominant border colors, ignoring already-transparent pixels. */
export function estimateBackgroundColors(data, width, height) {
  const bins = new Map();
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 192) return;
    const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
    let bin = bins.get(key);
    if (!bin) bins.set(key, bin = { count: 0, rgb: [0, 0, 0] });
    bin.count++;
    for (let c = 0; c < 3; c++) bin.rgb[c] += data[i + c];
  };
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  for (let x = 0; x < width; x += stepX) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y += stepY) { add(0, y); add(width - 1, y); }
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count);
  const total = ranked.reduce((sum, item) => sum + item.count, 0);
  const colors = [];
  for (const bin of ranked) {
    if (bin.count < Math.max(2, total * .045, ranked[0].count * .15)) break;
    const color = bin.rgb.map(value => value / bin.count);
    if (colors.every(previous => distanceSquared(previous, color) > 32 ** 2)) colors.push(color);
    if (colors.length >= 4) break;
  }
  return colors;
}

/**
 * Color-based, edge-connected background removal, not semantic AI segmentation.
 * Returns a copy and preserves the source so this operation is reversible.
 */
export function removeEdgeBackground(data, width, height, tolerance = 55) {
  const result = new Uint8ClampedArray(data);
  // An existing cutout is already its own mask. In particular, do not mistake
  // the subject for background when a transparent PNG touches a frame edge.
  let edgePixels = 0, transparentEdges = 0;
  const inspectEdge = (x, y) => {
    edgePixels++;
    if (data[(y * width + x) * 4 + 3] < 32) transparentEdges++;
  };
  for (let x = 0; x < width; x++) { inspectEdge(x, 0); inspectEdge(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { inspectEdge(0, y); inspectEdge(width - 1, y); }
  if (transparentEdges > edgePixels * .05) return result;
  const colors = estimateBackgroundColors(data, width, height);
  if (!colors.length) return result;
  const threshold = clamp(number(tolerance, 55), 0, 150);
  const thresholdSquared = threshold ** 2;
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const visit = index => {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (data[offset + 3] === 0) { queue[tail++] = index; return; }
    const pixel = [data[offset], data[offset + 1], data[offset + 2]];
    if (colors.some(color => distanceSquared(pixel, color) <= thresholdSquared)) queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    result[index * 4 + 3] = 0;
    const x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }
  // A narrow fringe softens antialiased edges while preserving interior alpha.
  if (threshold > 0) {
    for (let index = 0; index < count; index++) {
      const i = index * 4;
      if (result[i + 3] === 0) continue;
      const x = index % width, y = Math.floor(index / width);
      const edge = (x > 0 && result[i - 1] === 0) || (x < width - 1 && result[i + 7] === 0)
        || (y > 0 && result[i - width * 4 + 3] === 0) || (y < height - 1 && result[i + width * 4 + 3] === 0);
      if (!edge) continue;
      const pixel = [data[i], data[i + 1], data[i + 2]];
      const nearest = Math.sqrt(Math.min(...colors.map(color => distanceSquared(pixel, color))));
      const opacity = clamp((nearest - threshold) / Math.max(10, threshold * .35), 0, 1);
      result[i + 3] = Math.round(data[i + 3] * opacity);
    }
  }
  return result;
}

function rgb(hex, fallback) {
  const value = /^#([\da-f]{6})$/i.test(hex || '') ? hex.slice(1) : fallback;
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}

/** Duotone interpolation preserves pixel alpha and mixes with the original. */
export function applyDuotone(data, dark = '#16365A', light = '#AACEF3', strength = 1) {
  const shadow = rgb(dark, '16365A'), highlight = rgb(light, 'AACEF3');
  const amount = clamp(number(strength, 1), 0, 1);
  const result = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
    const tone = Math.pow(luminance, .85);
    for (let c = 0; c < 3; c++) {
      const target = shadow[c] + (highlight[c] - shadow[c]) * tone;
      result[i + c] = Math.round(data[i + c] * (1 - amount) + target * amount);
    }
  }
  return result;
}

function drawHalftone(context, data, width, height, spacing, color, offset = 0, strength = 1) {
  context.fillStyle = /^#[\da-f]{6}$/i.test(color || '') ? color : '#FF6638';
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const i = (Math.floor(y) * width + Math.floor(x)) * 4;
      const alpha = data[i + 3] / 255;
      if (alpha < .04) continue;
      const luminance = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
      const radius = spacing * .43 * Math.sqrt(alpha * (.2 + .8 * luminance));
      context.globalAlpha = alpha * strength;
      context.beginPath();
      context.arc(x + offset, y + offset * .55, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

export async function processImage(src, options = {}) {
  const image = await decodeImage(src);
  const ratio = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const { canvas, context } = createCanvas(width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const source = options.removeBackground
    ? removeEdgeBackground(pixels.data, width, height, options.tolerance)
    : new Uint8ClampedArray(pixels.data);
  const effect = ['original', 'duotone', 'dots', 'duotone-dots'].includes(options.effect) ? options.effect : 'original';
  const strength = clamp(number(options.strength, 1), 0, 1);
  const spacing = clamp(number(options.dotSpacing, 10), 4, 28);
  if (effect === 'dots') {
    context.clearRect(0, 0, width, height);
    if (strength < 1) {
      pixels.data.set(source);
      const base = createCanvas(width, height);
      base.context.putImageData(pixels, 0, 0);
      context.globalAlpha = 1 - strength;
      context.drawImage(base.canvas, 0, 0);
      context.globalAlpha = 1;
    }
    drawHalftone(context, source, width, height, spacing, options.dotColor, 0, strength);
  } else if (effect === 'duotone-dots') {
    const tinted = applyDuotone(source, options.dark, options.light, strength);
    const layer = createCanvas(width, height);
    pixels.data.set(tinted);
    layer.context.putImageData(pixels, 0, 0);
    context.clearRect(0, 0, width, height);
    // The offset printed-dot silhouette sits behind the duotone photograph.
    // A transparent cutout lets the offset dots show at the subject edges.
    drawHalftone(context, source, width, height, spacing, options.dotColor, spacing * 2.2, strength);
    context.drawImage(layer.canvas, 0, 0);
  } else {
    pixels.data.set(effect === 'duotone' ? applyDuotone(source, options.dark, options.light, strength) : source);
    context.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/png');
}
