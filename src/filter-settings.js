export const FILTER_VERSION = 3;
export const FILTER_DEFAULTS = {
  particlePattern: 'blended', minSize: 2.3, maxSize: 20, spacing: 23.5,
  dotScale: 1, filterSoftness: 0, screenRotation: 0,
  centerX: 50, centerY: 50, clipToAlpha: false, edgeSampling: 1,
};
export const FILTER_LIMITS = {
  minSize: [0, 240, .1], maxSize: [1, 240, .1], spacing: [4, 240, .1],
  dotScale: [0, 3, .01], filterSoftness: [0, 1, .01],
  screenRotation: [-180, 180, .5], centerX: [0, 100, .1], centerY: [0, 100, .1],
  edgeSampling: [0, 4, .05],
};
export const FILTER_KEYS = Object.keys(FILTER_DEFAULTS);
export const FILTER_PRESETS = [
  {id:'xl',preview:'./assets/filter-presets/xl.svg',name:'XL',...FILTER_DEFAULTS,minSize:5.5,maxSize:48,spacing:56.5},
  {id:'l',preview:'./assets/filter-presets/l.svg',name:'L',...FILTER_DEFAULTS,minSize:3.7,maxSize:32,spacing:37.6},
  {id:'m',preview:'./assets/filter-presets/m.svg',name:'M',...FILTER_DEFAULTS},
  {id:'s',preview:'./assets/filter-presets/s.svg',name:'S',...FILTER_DEFAULTS,minSize:1.4,maxSize:12,spacing:14.1},
  {id:'soft',preview:'./assets/filter-presets/soft.svg',name:'Soft',...FILTER_DEFAULTS,filterSoftness:.4},
  {id:'tilted',preview:'./assets/filter-presets/tilted.svg',name:'Tilted',...FILTER_DEFAULTS,minSize:3.2,maxSize:28,spacing:32.9,screenRotation:22.5},
];
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const finite = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeFilterSettings(input={}) {
  const settings = {...FILTER_DEFAULTS};
  for (const [key,[min,max]] of Object.entries(FILTER_LIMITS)) {
    settings[key] = clamp(finite(input[key],FILTER_DEFAULTS[key]),min,max);
  }
  settings.minSize = Math.min(settings.minSize,settings.maxSize);
  settings.particlePattern = input.particlePattern==='dot' ? 'dot' : 'blended';
  settings.clipToAlpha = input.clipToAlpha===true;
  return settings;
}

/** Keep older compositions at their existing screen period and ink density. */
export function ensureFilterSettings(layer) {
  if (layer.filterSettingsVersion!==FILTER_VERSION) {
    const period = 1000/Math.round(55+clamp(finite(layer.density,70),35,110));
    Object.assign(layer,normalizeFilterSettings({
      particlePattern:layer.particlePattern,minSize:0,maxSize:.85*period,spacing:period,
      dotScale:clamp(finite(layer.dotSize,1),.45,1.6),
      edgeSampling:clamp(finite(layer.softness,1),.4,1.8),
    }));
    layer.filterSettingsVersion=FILTER_VERSION;
  } else Object.assign(layer,normalizeFilterSettings(layer));
  return layer;
}

export function updateFilterSetting(layer,key,value) {
  const next = {...layer,[key]:value};
  if (key==='minSize' && Number(value)>layer.maxSize) next.maxSize=value;
  if (key==='maxSize' && Number(value)<layer.minSize) next.minSize=value;
  Object.assign(layer,normalizeFilterSettings(next));
  layer.filterSettingsVersion=FILTER_VERSION;
}

export function filterPresetMatches(layer,preset) {
  return FILTER_KEYS.every(key => typeof preset[key]==='number'
    ? Math.abs(layer[key]-preset[key])<1e-7 : layer[key]===preset[key]);
}

export function vectorFilterOptions(layer) {
  ensureFilterSettings(layer);
  return Object.fromEntries(FILTER_KEYS.map(key=>[key,layer[key]]));
}
