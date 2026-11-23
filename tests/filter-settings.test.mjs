import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_KEYS, FILTER_PRESETS, ensureFilterSettings, filterPresetMatches, normalizeFilterSettings, updateFilterSetting } from '../src/filter-settings.js';

test('XL matches the supplied reference without a color-mode override', () => {
  const xl = FILTER_PRESETS.find(preset=>preset.id==='xl');
  assert.deepEqual(Object.fromEntries(['particlePattern','minSize','maxSize','dotScale','filterSoftness','screenRotation','centerX','centerY','clipToAlpha'].map(key=>[key,xl[key]])), {
    particlePattern:'blended',minSize:5.5,maxSize:48,dotScale:1,filterSoftness:0,
    screenRotation:0,centerX:50,centerY:50,clipToAlpha:false,
  });
  assert.ok(!FILTER_KEYS.includes('color'));
  assert.ok(!FILTER_KEYS.includes('colorMode'));
});

test('all six presets survive renderer normalization and match every control', () => {
  assert.deepEqual(FILTER_PRESETS.map(preset=>preset.name),['XL','L','M','S','Soft','Tilted']);
  for (const preset of FILTER_PRESETS) {
    const settings = normalizeFilterSettings(preset);
    assert.ok(filterPresetMatches(settings,preset),preset.name);
    assert.ok(!filterPresetMatches({...settings,centerX:settings.centerX+1},preset));
  }
  const sizes = FILTER_PRESETS.slice(0,4).map(preset=>preset.maxSize);
  assert.deepEqual(sizes,[48,32,20,12]);
});

test('manual limits accept both zero and settings beyond the previous ranges', () => {
  const settings = normalizeFilterSettings({minSize:0,maxSize:240,spacing:4,dotScale:0,filterSoftness:0,screenRotation:-180,centerX:0,centerY:100,edgeSampling:0});
  assert.equal(settings.minSize,0);
  assert.equal(settings.maxSize,240);
  assert.equal(settings.spacing,4);
  assert.equal(settings.dotScale,0);
  assert.equal(settings.filterSoftness,0);
  assert.equal(settings.screenRotation,-180);
  assert.equal(settings.centerX,0);
  assert.equal(settings.edgeSampling,0);
  assert.equal(normalizeFilterSettings({dotScale:20,spacing:900}).dotScale,3);
  assert.equal(normalizeFilterSettings({dotScale:20,spacing:900}).spacing,240);
});

test('editing either size bound keeps the pair ordered', () => {
  const layer = {...FILTER_PRESETS[2]};
  updateFilterSetting(layer,'minSize',60);
  assert.equal(layer.minSize,60);
  assert.equal(layer.maxSize,60);
  updateFilterSetting(layer,'maxSize',10);
  assert.equal(layer.minSize,10);
  assert.equal(layer.maxSize,10);
});

test('migration preserves the old period, size response, pattern and colors', () => {
  const layer = {density:94,dotSize:1.6,softness:1.2,particlePattern:'dot',color:'#16365A'};
  ensureFilterSettings(layer);
  const priorPeriod = 1000/149;
  assert.equal(layer.spacing,priorPeriod);
  assert.equal(layer.minSize,0);
  assert.equal(layer.maxSize,.85*priorPeriod);
  assert.equal(layer.dotScale,1.6);
  assert.equal(layer.edgeSampling,1.2);
  assert.equal(layer.particlePattern,'dot');
  assert.equal(layer.color,'#16365A');
  for (const tone of [.01,.2,.67,1]) {
    const previousRadius = priorPeriod*.425*1.6*Math.sqrt(tone);
    const migratedRadius = layer.maxSize*Math.sqrt(tone)*layer.dotScale/2;
    assert.ok(Math.abs(previousRadius-migratedRadius)<1e-12);
  }
  const snapshot = {...layer};
  ensureFilterSettings(layer);
  assert.deepEqual(layer,snapshot);
});
