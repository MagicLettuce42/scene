const assert = require('node:assert/strict'), path = require('node:path');
const React = require('react');
const { useMobileViewport } = require(path.resolve(process.argv[2], 'lib/use-mobile-viewport.js'));
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name) { for (const fn of this.listeners.get(name) || []) fn(); }
}
const styles = new Map(), frames = [];
const root = {
  dataset: {}, clientHeight: 800,
  style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
};
const viewport = Object.assign(new Events(), { height: 800, scale: 1 });
const document = Object.assign(new Events(), { documentElement: root, activeElement: null });
class Field { matches() { return true; } }
const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'requestAnimationFrame'].map(key => [key, global[key]]));
Object.assign(global, {
  window: { visualViewport: viewport, innerHeight: 800 }, document, HTMLElement: Field,
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
});
let cleanup;
const useEffect = React.useEffect;
React.useEffect = fn => { cleanup = fn(); };
const height = () => styles.get('--scene-visible-height');
try {
  useMobileViewport();
  assert.equal(root.dataset.keyboard, 'closed'); assert.equal(height(), undefined);
  for (const [scale, visible] of [[2, 400], [3, 800 / 3], [0.8, 1000], [1, 800]]) {
    Object.assign(viewport, { scale, height: visible }); viewport.emit('resize');
    assert.equal(root.dataset.keyboard, 'closed');
    assert.equal(height(), undefined, 'pinch zoom must not resize the modal to the magnified area');
  }
  document.activeElement = new Field();
  viewport.height = 500; document.emit('focusin');
  assert.equal(root.dataset.keyboard, 'open'); assert.equal(height(), '500px');
  Object.assign(viewport, { scale: 2, height: 250 }); viewport.emit('resize');
  assert.equal(root.dataset.keyboard, 'open'); assert.equal(height(), '500px', 'keyboard height remains stable during zoom');
  Object.assign(viewport, { scale: 1, height: 500 }); document.emit('focusout');
  document.activeElement = null; frames.shift()();
  assert.equal(root.dataset.keyboard, 'closed'); assert.equal(height(), undefined, 'normal CSS height returns after focus leaves');
  document.activeElement = new Field();
  Object.assign(viewport, { scale: 0, height: 0 }); viewport.emit('resize');
  assert.equal(root.dataset.keyboard, 'closed'); assert.equal(height(), undefined, 'inactive viewport must not collapse a dialog');
  Object.assign(viewport, { scale: 1, height: 660 }); viewport.emit('resize');
  assert.equal(root.dataset.keyboard, 'closed', 'browser chrome alone is not a keyboard');
  viewport.height = 659; viewport.emit('resize'); assert.equal(root.dataset.keyboard, 'open');
  cleanup();
  assert.equal(root.dataset.keyboard, undefined); assert.equal(height(), undefined);
  viewport.emit('resize'); assert.equal(root.dataset.keyboard, undefined, 'unmounted listeners do not change the page');
  console.log('PASS: pinch zoom in/out, keyboard plus zoom, focus changes, inactive viewports and viewport cleanup (event simulation, not browser QA).');
} finally {
  React.useEffect = useEffect;
  Object.assign(global, previous);
}
