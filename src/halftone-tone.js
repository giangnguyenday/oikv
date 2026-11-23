/** Area-preserving tone levels for the supplied Euclidean halftone field. */
const TAU = Math.PI * 2;
const TABLE_STEPS = 1024;
const QUADRATURE_STEPS = 128; // Even, for composite Simpson integration.
let lowerAreaTable;

/** Visible area of a periodic circle clipped to its unit square cell. */
export function circleCellInkArea(radiusSquared) {
  const square = Math.max(0, Number(radiusSquared) || 0);
  if (square >= .5) return 1;
  const area = Math.PI * square;
  if (square <= .25) return area;
  // Once neighboring circles meet, subtract the four circular segments beyond
  // the cell edges so overlapping ink is counted once.
  const segment = square * Math.acos(.5 / Math.sqrt(square)) - .5 * Math.sqrt(square - .25);
  return area - 4 * segment;
}

function areaAtLowerLevel(level) {
  if (level <= 0) return 0;
  if (level >= .5) return .5;
  // G <= t gives y(x)=acos(2-4t-cos(2πx))/(2π) in one quadrant.
  // x=xMax(1-u²) removes its square-root endpoint; area=8xMax∫u·y(x)du.
  const xMax = Math.acos(1 - 4 * level) / TAU;
  const threshold = 2 - 4 * level;
  let sum = 0;
  for (let index = 1; index <= QUADRATURE_STEPS; index++) {
    const u = index / QUADRATURE_STEPS;
    const x = xMax * (1 - u * u);
    const argument = Math.max(-1, Math.min(1, threshold - Math.cos(TAU * x)));
    const value = u * Math.acos(argument) / TAU;
    sum += value * (index === QUADRATURE_STEPS ? 1 : index % 2 ? 4 : 2);
  }
  return 8 * xMax * sum / (3 * QUADRATURE_STEPS);
}

function areaTable() {
  if (lowerAreaTable) return lowerAreaTable;
  const table = new Float64Array(TABLE_STEPS + 1);
  for (let index = 1; index < TABLE_STEPS; index++) {
    table[index] = Math.max(table[index - 1], Math.min(.5, areaAtLowerLevel(index / (2 * TABLE_STEPS))));
  }
  table[TABLE_STEPS] = .5;
  lowerAreaTable = table;
  return table;
}

/** Invert area{.5-.25(cos(2πx)+cos(2πy)) <= level} on one unit cell. */
export function euclideanLevelForArea(area) {
  const value = Number(area);
  if (!Number.isFinite(value)) return value === Infinity ? 1 : 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  if (value === .5) return .5;
  // Translating both coordinates by half a cell sends G to 1-G, so its CDF
  // and inverse are symmetric. Store/integrate only the lower half.
  if (value > .5) return 1 - euclideanLevelForArea(1 - value);
  const table = areaTable();
  let low = 0, high = TABLE_STEPS;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (table[middle] < value) low = middle; else high = middle;
  }
  const span = table[high] - table[low];
  const fraction = span > 0 ? (value - table[low]) / span : 0;
  return (low + fraction) / (2 * TABLE_STEPS);
}
