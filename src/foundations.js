import { sanitizeSVG } from './vector.js';

// Original supplied grayscale vectors, before any halftone treatment.
export const FOUNDATION_REVISION = 'supplied-vectors-1';
export const FOUNDATIONS = [
  { id: 'strengthen', name: 'Strengthen', src: './assets/foundations/strengthen.svg', width: 888, height: 497 },
  { id: 'reshape', name: 'Reshape', src: './assets/foundations/reshape.svg', width: 1040, height: 836 },
  { id: 'reorganize', name: 'Reorganize', src: './assets/foundations/reorganize.svg', width: 887, height: 893 },
  { id: 'optimize', name: 'Optimize', src: './assets/foundations/optimize.svg', width: 1171, height: 888 },
];
const sources = new Map();
export function loadFoundation(id) {
  const foundation = FOUNDATIONS.find(item => item.id === id);
  if (!foundation) return Promise.reject(new Error('Unknown foundation vector.'));
  if (!sources.has(id)) {
    const pending = fetch(foundation.src).then(response => {
      if (!response.ok) throw new Error(`Could not load the ${foundation.name} vector.`);
      return response.text();
    }).then(sanitizeSVG).catch(error => { sources.delete(id); throw error; });
    sources.set(id, pending);
  }
  return sources.get(id);
}
