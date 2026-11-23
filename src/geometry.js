/** Pure geometry for rotated objects in artboard coordinates. */
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const radians = rotation => (finite(rotation) % 360) * Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rotate = (x, y, angle) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});

/** Axis-aligned bounds enclosing the entire rotated rectangle. */
export function rotatedBounds(layer) {
  const cx = finite(layer.cx), cy = finite(layer.cy);
  const w = Math.abs(finite(layer.w)), h = Math.abs(finite(layer.h));
  const angle = radians(layer.rotation);
  const halfWidth = (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2;
  const halfHeight = (Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h) / 2;
  return {
    left: cx - halfWidth, right: cx + halfWidth,
    top: cy - halfHeight, bottom: cy + halfHeight,
    width: halfWidth * 2, height: halfHeight * 2, cx, cy,
  };
}

function nearestSnap(positions, size, tolerance) {
  // Center matches win exact ties; otherwise choose the smallest correction.
  const targets = [size / 2, 0, size];
  let best = null;
  for (const source of positions) {
    for (const target of targets) {
      const correction = target - source;
      const distance = Math.abs(correction);
      if (distance <= tolerance && (!best || distance < best.distance - 1e-9)) {
        best = { correction, distance, position: target };
      }
    }
  }
  return best;
}

/** Snap rotated edges or centers to artboard edges or centers, one guide per axis. */
export function snapMove(layer, artboard, tolerance = 8) {
  const bounds = rotatedBounds(layer);
  const threshold = Math.max(0, finite(tolerance, 8));
  const width = Math.max(0, finite(artboard.width));
  const height = Math.max(0, finite(artboard.height));
  const x = nearestSnap([bounds.cx, bounds.left, bounds.right], width, threshold);
  const y = nearestSnap([bounds.cy, bounds.top, bounds.bottom], height, threshold);
  const guides = [];
  if (x) guides.push({ axis: 'x', position: x.position });
  if (y) guides.push({ axis: 'y', position: y.position });
  return {
    cx: bounds.cx + (x?.correction || 0),
    cy: bounds.cy + (y?.correction || 0), guides,
  };
}

/**
 * Corner scaling with optional independent axes. Normally the opposite corner
 * is fixed; Alt/Option scaling fixes the original center. Locked proportions
 * project the pointer onto the original diagonal; unlocked proportions follow
 * each local axis independently. Text size follows the height ratio.
 */
export function scaleFromCorner(original, pointer, handle, { fromCenter = false, locked = true, minScale = .03, maxScale = 12 } = {}) {
  if (!['nw', 'ne', 'sw', 'se'].includes(handle)) throw new TypeError('Choose an nw, ne, sw, or se corner.');
  const sx = handle.includes('e') ? 1 : -1;
  const sy = handle.includes('s') ? 1 : -1;
  const w = Math.abs(finite(original.w)), h = Math.abs(finite(original.h));
  const cx = finite(original.cx), cy = finite(original.cy);
  const angle = radians(original.rotation);
  const halfCorner = rotate(sx * w / 2, sy * h / 2, angle);
  const anchor = fromCenter ? { x: cx, y: cy } : { x: cx - halfCorner.x, y: cy - halfCorner.y };
  const divisor = fromCenter ? 2 : 1;
  const diagonal = { x: sx * w / divisor, y: sy * h / divisor };
  const vx = finite(pointer.x, cx + halfCorner.x) - anchor.x;
  const vy = finite(pointer.y, cy + halfCorner.y) - anchor.y;
  const local = rotate(vx, vy, -angle);
  const denominator = diagonal.x ** 2 + diagonal.y ** 2;
  const projectedScale = denominator ? (local.x * diagonal.x + local.y * diagonal.y) / denominator : 1;
  const minimum = Math.max(0, finite(minScale, .03));
  const maximum = Math.max(minimum, finite(maxScale, 12));
  const factorX = clamp(locked ? projectedScale : diagonal.x ? local.x / diagonal.x : 1, minimum, maximum);
  const factorY = clamp(locked ? projectedScale : diagonal.y ? local.y / diagonal.y : 1, minimum, maximum);
  const nextW = w * factorX, nextH = h * factorY;
  const nextHalfCorner = rotate(sx * nextW / 2, sy * nextH / 2, angle);
  const result = {
    cx: fromCenter ? cx : anchor.x + nextHalfCorner.x,
    cy: fromCenter ? cy : anchor.y + nextHalfCorner.y,
    w: nextW, h: nextH,
  };
  if (original.fontSize !== undefined && Number.isFinite(Number(original.fontSize))) result.fontSize = Number(original.fontSize) * factorY;
  return result;
}
