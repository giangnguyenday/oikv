/**
 * Vector contours of the supplied shader's Euclidean halftone screen.
 * Compound paths use evenodd fill; the caller supplies the ink color.
 */
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const SEGMENTS = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], null, [0, 2], [3, 2],
  [2, 3], [0, 2], null, [1, 2], [1, 3], [0, 1], [3, 0], [],
];

function abortError() {
  const error = new Error('A newer halftone contour is ready.');
  error.name = 'AbortError';
  return error;
}

/**
 * Sample at sixteen substeps per period, up to 4096 substeps on the long side.
 * The latter bounds work for the expanded 4-unit minimum spacing. Samples on
 * the source boundary plus a negative padding ring close clipped contours.
 */
export async function euclideanVectorPath({ width, height, spacing, sampleCoverage, dotScale = 1, rotation = 0, centerX = 50, centerY = 50, isCurrent } = {}) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) throw new Error('Halftone contours need positive finite dimensions.');
  if (!(Number.isFinite(spacing) && spacing > 0) || typeof sampleCoverage !== 'function') throw new Error('Halftone contours need positive spacing and a coverage sampler.');
  const check = () => { if (isCurrent && !isCurrent()) throw abortError(); };
  check();
  const scale = Number.isFinite(dotScale) ? Math.max(0, dotScale) ** 2 : 1;
  if (!scale) return '';
  const step = Math.max(spacing / 16, Math.max(width, height) / 4096);
  const innerCols = Math.max(1, Math.ceil(width / step));
  const innerRows = Math.max(1, Math.ceil(height / step));
  const cols = innerCols + 2, rows = innerRows + 2;
  const xs = new Float64Array(cols + 1), ys = new Float64Array(rows + 1);
  xs[0] = -step; ys[0] = -step;
  for (let i = 0; i <= innerCols; i++) xs[i + 1] = i * width / innerCols;
  for (let i = 0; i <= innerRows; i++) ys[i + 1] = i * height / innerRows;
  xs[cols] = width + step; ys[rows] = height + step;
  const originX = width * clamp01((Number.isFinite(centerX) ? centerX : 50) / 100);
  const originY = height * clamp01((Number.isFinite(centerY) ? centerY : 50) / 100);
  const angle = ((Number.isFinite(rotation) ? rotation : 0) + 45) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const field = (x, y) => {
    if (x < 0 || y < 0 || x > width || y > height) return -1;
    const coverage = Number(sampleCoverage(x, y));
    const threshold = clamp01((Number.isFinite(coverage) ? coverage : 0) * scale) - .0005;
    if (threshold < 0) return threshold;
    const dx = x - originX, dy = y - originY;
    const gx = (cosine * dx + sine * dy) / spacing;
    const gy = (-sine * dx + cosine * dy) / spacing;
    const value = threshold - (.5 - .25 * (Math.cos(TAU * gx) + Math.cos(TAU * gy)));
    // A deterministic infinitesimal negative tie prevents vertices exactly on
    // sample nodes. It does not shift the 45-degree screen's coordinate phase.
    return Math.abs(value) < 1e-12 ? -1e-12 : value;
  };

  let capacity = 16384, count = 0;
  let vx = new Float64Array(capacity), vy = new Float64Array(capacity);
  let neighborA = new Int32Array(capacity).fill(-1), neighborB = new Int32Array(capacity).fill(-1);
  const vertex = (x, y) => {
    if (count === capacity) {
      const previous = capacity; capacity *= 2;
      const xNext = new Float64Array(capacity), yNext = new Float64Array(capacity);
      const aNext = new Int32Array(capacity).fill(-1), bNext = new Int32Array(capacity).fill(-1);
      xNext.set(vx); yNext.set(vy); aNext.set(neighborA); bNext.set(neighborB);
      vx = xNext; vy = yNext; neighborA = aNext; neighborB = bNext;
    }
    vx[count] = Math.max(0, Math.min(width, x));
    vy[count] = Math.max(0, Math.min(height, y));
    return count++;
  };
  const connect = (a, b) => {
    if (neighborA[a] < 0) neighborA[a] = b; else if (neighborB[a] < 0) neighborB[a] = b; else throw new Error('Halftone contour has a non-manifold vertex.');
    if (neighborA[b] < 0) neighborA[b] = a; else if (neighborB[b] < 0) neighborB[b] = a; else throw new Error('Halftone contour has a non-manifold vertex.');
  };
  let top = new Float64Array(cols + 1), bottom = new Float64Array(cols + 1);
  let topEdges = new Int32Array(cols).fill(-1), bottomEdges = new Int32Array(cols).fill(-1);
  const verticalEdges = new Int32Array(cols + 1);
  for (let x = 0; x <= cols; x++) top[x] = field(xs[x], ys[0]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) bottom[x] = field(xs[x], ys[y + 1]);
    verticalEdges.fill(-1); bottomEdges.fill(-1);
    for (let x = 0; x < cols; x++) {
      const a = top[x], b = top[x + 1], c = bottom[x + 1], d = bottom[x];
      const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (!code || code === 15) continue;
      const crossing = edge => {
        if (edge === 0) {
          if (topEdges[x] < 0) topEdges[x] = vertex(xs[x] + a / (a - b) * (xs[x + 1] - xs[x]), ys[y]);
          return topEdges[x];
        }
        if (edge === 2) {
          if (bottomEdges[x] < 0) bottomEdges[x] = vertex(xs[x] + d / (d - c) * (xs[x + 1] - xs[x]), ys[y + 1]);
          return bottomEdges[x];
        }
        const column = edge === 3 ? x : x + 1;
        if (verticalEdges[column] < 0) {
          const first = edge === 3 ? a : b, last = edge === 3 ? d : c;
          verticalEdges[column] = vertex(xs[column], ys[y] + first / (first - last) * (ys[y + 1] - ys[y]));
        }
        return verticalEdges[column];
      };
      let pairs = SEGMENTS[code];
      if (!pairs) {
        // Bilinear asymptotic decider. Exact saddle ties consistently choose
        // top-to-right / bottom-to-left, with shared edge identities preserved.
        const determinant = a * c - b * d;
        pairs = determinant >= 0 ? [0, 1, 2, 3] : [0, 3, 1, 2];
      }
      for (let i = 0; i < pairs.length; i += 2) connect(crossing(pairs[i]), crossing(pairs[i + 1]));
    }
    [top, bottom] = [bottom, top];
    [topEdges, bottomEdges] = [bottomEdges, topEdges];
    if ((y & 7) === 7) { check(); await tick(); check(); }
  }

  const toleranceSquared = (spacing * .01) ** 2;
  let simplifyWork = 0;
  const simplify = async points => {
    const length = points.length / 2;
    let anchor = 0;
    for (let i = 1; i < length; i++) if (points[i * 2] < points[anchor * 2] || (points[i * 2] === points[anchor * 2] && points[i * 2 + 1] < points[anchor * 2 + 1])) anchor = i;
    const ordered = new Float64Array((length + 1) * 2);
    for (let i = 0; i <= length; i++) { const j = (anchor + i) % length; ordered[i * 2] = points[j * 2]; ordered[i * 2 + 1] = points[j * 2 + 1]; }
    let opposite = 1, farthest = 0;
    for (let i = 1; i < length; i++) { const distance = (ordered[i * 2] - ordered[0]) ** 2 + (ordered[i * 2 + 1] - ordered[1]) ** 2; if (distance > farthest) { farthest = distance; opposite = i; } }
    const keep = new Uint8Array(length + 1); keep[0] = keep[opposite] = keep[length] = 1;
    const stack = [0, opposite, opposite, length];
    while (stack.length) {
      const last = stack.pop(), first = stack.pop();
      const ax = ordered[first * 2], ay = ordered[first * 2 + 1];
      const dx = ordered[last * 2] - ax, dy = ordered[last * 2 + 1] - ay;
      const square = dx * dx + dy * dy;
      let maximum = toleranceSquared, split = -1;
      for (let i = first + 1; i < last; i++) {
        const px = ordered[i * 2] - ax, py = ordered[i * 2 + 1] - ay;
        const t = square ? Math.max(0, Math.min(1, (px * dx + py * dy) / square)) : 0;
        const distance = (px - t * dx) ** 2 + (py - t * dy) ** 2;
        if (distance > maximum) { maximum = distance; split = i; }
        if (++simplifyWork >= 32768) { simplifyWork = 0; check(); await tick(); check(); }
      }
      if (split >= 0) { keep[split] = 1; stack.push(first, split, split, last); }
    }
    const result = [], indices = [];
    for (let i = 0; i < length; i++) if (keep[i]) { result.push(ordered[i * 2], ordered[i * 2 + 1]); indices.push(i); }
    if (result.length < 6) return { points, ordered: Float64Array.from([...points, points[0], points[1]]), indices: Array.from({ length }, (_, i) => i) };
    return { points: result, ordered, indices };
  };
  const visited = new Uint8Array(count), paths = [];
  const number = value => String(Math.round(value * 10000) / 10000);
  const segmentDistanceSquared = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, square = dx * dx + dy * dy;
    const t = square ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / square)) : 0;
    return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
  };
  let curveWork = 0;
  const curvedPath = async ({ points, ordered, indices }) => {
    const length = points.length / 2;
    const tx = new Float64Array(length), ty = new Float64Array(length), lengths = new Float64Array(length);
    const sharp = new Uint8Array(length);
    const boundary = (x, y) => x === 0 || y === 0 || x === width || y === height;
    for (let i = 0; i < length; i++) {
      const before = (i + length - 1) % length, after = (i + 1) % length;
      const x = points[i * 2], y = points[i * 2 + 1];
      const ix = x - points[before * 2], iy = y - points[before * 2 + 1];
      const ox = points[after * 2] - x, oy = points[after * 2 + 1] - y;
      const incoming = Math.hypot(ix, iy), outgoing = Math.hypot(ox, oy);
      lengths[i] = outgoing;
      const turnCosine = incoming && outgoing ? (ix * ox + iy * oy) / (incoming * outgoing) : -1;
      const clippingJoin = boundary(x, y) && (!boundary(points[before * 2], points[before * 2 + 1]) || !boundary(points[after * 2], points[after * 2 + 1]));
      sharp[i] = turnCosine <= .5 || clippingJoin ? 1 : 0;
      if (!sharp[i]) {
        const tangentX = ix / incoming + ox / outgoing, tangentY = iy / incoming + oy / outgoing;
        const size = Math.hypot(tangentX, tangentY);
        if (size) { tx[i] = tangentX / size; ty[i] = tangentY / size; } else sharp[i] = 1;
      }
    }
    const commands = [`M${number(points[0])} ${number(points[1])}`];
    const fitsArc = (ax, ay, cax, cay, cbx, cby, bx, by, first, last) => {
      const samples = new Float64Array(26);
      for (let s = 0; s <= 12; s++) {
        const t = s / 12, u = 1 - t;
        const x = u ** 3 * ax + 3 * u * u * t * cax + 3 * u * t * t * cbx + t ** 3 * bx;
        const y = u ** 3 * ay + 3 * u * u * t * cay + 3 * u * t * t * cby + t ** 3 * by;
        samples[s * 2] = x; samples[s * 2 + 1] = y;
        let distance = Infinity;
        for (let p = first; p < last; p++) { distance = Math.min(distance, segmentDistanceSquared(x, y, ordered[p * 2], ordered[p * 2 + 1], ordered[p * 2 + 2], ordered[p * 2 + 3])); curveWork++; }
        if (distance > toleranceSquared) return false;
      }
      for (let p = first + 1; p < last; p++) {
        let distance = Infinity;
        for (let s = 0; s < 12; s++) { distance = Math.min(distance, segmentDistanceSquared(ordered[p * 2], ordered[p * 2 + 1], samples[s * 2], samples[s * 2 + 1], samples[s * 2 + 2], samples[s * 2 + 3])); curveWork++; }
        if (distance > toleranceSquared) return false;
      }
      return true;
    };
    const fitMergedArc = (firstVertex, lastVertex) => {
      const end = lastVertex % length;
      const first = indices[firstVertex], last = lastVertex === length ? ordered.length / 2 - 1 : indices[end];
      const ax = points[firstVertex * 2], ay = points[firstVertex * 2 + 1], bx = points[end * 2], by = points[end * 2 + 1];
      const distances = new Float64Array(last - first + 1);
      for (let p = first + 1; p <= last; p++) distances[p - first] = distances[p - first - 1] + Math.hypot(ordered[p * 2] - ordered[p * 2 - 2], ordered[p * 2 + 1] - ordered[p * 2 - 1]);
      const arcLength = distances[distances.length - 1];
      if (!arcLength) return null;
      let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
      for (let p = first + 1; p < last; p++) {
        const t = distances[p - first] / arcLength, u = 1 - t;
        const b0 = u ** 3, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t ** 3;
        const a0x = b1 * tx[firstVertex], a0y = b1 * ty[firstVertex], a1x = -b2 * tx[end], a1y = -b2 * ty[end];
        const dx = ordered[p * 2] - (b0 + b1) * ax - (b2 + b3) * bx;
        const dy = ordered[p * 2 + 1] - (b0 + b1) * ay - (b2 + b3) * by;
        c00 += a0x * a0x + a0y * a0y; c01 += a0x * a1x + a0y * a1y; c11 += a1x * a1x + a1y * a1y;
        x0 += a0x * dx + a0y * dy; x1 += a1x * dx + a1y * dy;
      }
      const determinant = c00 * c11 - c01 * c01;
      if (Math.abs(determinant) < 1e-12) return null;
      const alpha = (x0 * c11 - x1 * c01) / determinant, beta = (c00 * x1 - c01 * x0) / determinant;
      const chord = Math.hypot(bx - ax, by - ay);
      if (!(alpha > 0 && beta > 0 && alpha < chord * 2 && beta < chord * 2)) return null;
      const cax = Math.max(0, Math.min(width, ax + tx[firstVertex] * alpha));
      const cay = Math.max(0, Math.min(height, ay + ty[firstVertex] * alpha));
      const cbx = Math.max(0, Math.min(width, bx - tx[end] * beta));
      const cby = Math.max(0, Math.min(height, by - ty[end] * beta));
      if (!fitsArc(ax, ay, cax, cay, cbx, cby, bx, by, first, last)) return null;
      return `C${number(cax)} ${number(cay)} ${number(cbx)} ${number(cby)} ${number(bx)} ${number(by)}`;
    };
    for (let i = 0; i < length;) {
      // Merge only low-turn spans, stopping well before a half-circle or any
      // sharp/clipping join. Fit handles by least squares against arc length,
      // then validate both directions against the original contour corridor.
      if (!sharp[i]) {
        let maximum = i + 1, turn = 0;
        for (let end = i + 2; end <= length; end++) {
          const middle = (end - 1) % length, endpoint = end % length;
          if (sharp[middle] || sharp[endpoint]) break;
          const before = (middle + length - 1) % length;
          const ux = (points[middle * 2] - points[before * 2]) / lengths[before], uy = (points[middle * 2 + 1] - points[before * 2 + 1]) / lengths[before];
          const vx = (points[endpoint * 2] - points[middle * 2]) / lengths[middle], vy = (points[endpoint * 2 + 1] - points[middle * 2 + 1]) / lengths[middle];
          turn += Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
          if (turn > Math.PI * .4) break;
          maximum = end;
        }
        let merged = null, end = maximum;
        for (; end > i + 1; end--) { merged = fitMergedArc(i, end); if (merged) break; }
        if (merged) {
          commands.push(merged); i = end;
          if (curveWork >= 32768) { curveWork = 0; check(); await tick(); check(); }
          continue;
        }
      }
      const j = (i + 1) % length;
      const ax = points[i * 2], ay = points[i * 2 + 1], bx = points[j * 2], by = points[j * 2 + 1];
      const sameBoundary = (ax === 0 && bx === 0) || (ay === 0 && by === 0) || (ax === width && bx === width) || (ay === height && by === height);
      if ((sharp[i] && sharp[j]) || sameBoundary) { commands.push(`L${number(bx)} ${number(by)}`); i++; continue; }
      const chordX = (bx - ax) / 3, chordY = (by - ay) / 3;
      const handleA = Math.min(lengths[(i + length - 1) % length], lengths[i]) / 3;
      const handleB = Math.min(lengths[i], lengths[j]) / 3;
      const fullAX = sharp[i] ? ax + chordX : ax + tx[i] * handleA;
      const fullAY = sharp[i] ? ay + chordY : ay + ty[i] * handleA;
      const fullBX = sharp[j] ? bx - chordX : bx - tx[j] * handleB;
      const fullBY = sharp[j] ? by - chordY : by - ty[j] * handleB;
      const first = indices[i], last = j ? indices[j] : ordered.length / 2 - 1;
      const samples = new Float64Array(26);
      let accepted = false, cax = 0, cay = 0, cbx = 0, cby = 0;
      // Conservative fitting against the original unsimplified arc. Both the
      // curve samples and original vertices must stay inside the same error
      // corridor used for simplification. Reducing handles approaches the
      // already-validated straight chord; sharp turns never get rounded.
      for (const amount of [1, .5, .25, .125]) {
        cax = Math.max(0, Math.min(width, ax + chordX + (fullAX - ax - chordX) * amount));
        cay = Math.max(0, Math.min(height, ay + chordY + (fullAY - ay - chordY) * amount));
        cbx = Math.max(0, Math.min(width, bx - chordX + (fullBX - bx + chordX) * amount));
        cby = Math.max(0, Math.min(height, by - chordY + (fullBY - by + chordY) * amount));
        accepted = true;
        for (let s = 0; s <= 12; s++) {
          const t = s / 12, u = 1 - t;
          const x = u ** 3 * ax + 3 * u * u * t * cax + 3 * u * t * t * cbx + t ** 3 * bx;
          const y = u ** 3 * ay + 3 * u * u * t * cay + 3 * u * t * t * cby + t ** 3 * by;
          samples[s * 2] = x; samples[s * 2 + 1] = y;
          let distance = Infinity;
          for (let p = first; p < last; p++) { distance = Math.min(distance, segmentDistanceSquared(x, y, ordered[p * 2], ordered[p * 2 + 1], ordered[p * 2 + 2], ordered[p * 2 + 3])); curveWork++; }
          if (distance > toleranceSquared) { accepted = false; break; }
        }
        if (accepted) for (let p = first + 1; p < last; p++) {
          let distance = Infinity;
          for (let s = 0; s < 12; s++) { distance = Math.min(distance, segmentDistanceSquared(ordered[p * 2], ordered[p * 2 + 1], samples[s * 2], samples[s * 2 + 1], samples[s * 2 + 2], samples[s * 2 + 3])); curveWork++; }
          if (distance > toleranceSquared) { accepted = false; break; }
        }
        if (accepted) break;
      }
      if (accepted && (segmentDistanceSquared(cax, cay, ax, ay, bx, by) > 1e-14 || segmentDistanceSquared(cbx, cby, ax, ay, bx, by) > 1e-14)) commands.push(`C${number(cax)} ${number(cay)} ${number(cbx)} ${number(cby)} ${number(bx)} ${number(by)}`);
      else commands.push(`L${number(bx)} ${number(by)}`);
      if (curveWork >= 32768) { curveWork = 0; check(); await tick(); check(); }
      i++;
    }
    commands.push('Z');
    return commands.join('');
  };
  let traceWork = 0;
  for (let start = 0; start < count; start++) {
    if (visited[start]) continue;
    const points = [];
    let previous = -1, current = start;
    do {
      if (current < 0 || visited[current]) throw new Error('Halftone contour did not form a closed loop.');
      visited[current] = 1;
      const x = vx[current], y = vy[current];
      if (points.length < 2 || points[points.length - 2] !== x || points[points.length - 1] !== y) points.push(x, y);
      const next = neighborA[current] === previous ? neighborB[current] : neighborA[current];
      previous = current; current = next;
      if (++traceWork >= 16384) { traceWork = 0; check(); await tick(); check(); }
    } while (current !== start);
    if (points.length >= 4 && points[0] === points[points.length - 2] && points[1] === points[points.length - 1]) points.length -= 2;
    if (points.length < 6) continue;
    const reduced = await simplify(points);
    paths.push(await curvedPath(reduced));
    if ((paths.length & 127) === 0) { check(); await tick(); check(); }
  }
  check();
  return paths.join('');
}
