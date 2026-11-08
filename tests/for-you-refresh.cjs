const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, f);
const React = require('react'), original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
let slots = [], index = 0, effects = [], dirty = false, tree, now = 1800000000000;
React.useState = initial => { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; };
React.useRef = initial => { const i = index++; return slots[i] ||= { current: initial }; };
React.useEffect = (fn, deps) => { const i = index++, old = slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); } };
const listeners = new Map(), timers = new Map(), realNow = Date.now, realInterval = setInterval, realClear = clearInterval;
Date.now = () => now; global.setInterval = fn => { const id = timers.size + 1; timers.set(id, fn); return id; }; global.clearInterval = id => timers.delete(id);
global.document = { visibilityState: 'visible', addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) };
global.window = { addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) };
Object.defineProperty(global, 'navigator', { configurable: true, value: { onLine: true } });
const requests = [];
function stub(file, exports) { const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/auth/client.ts', { sceneFetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
stub('../app/components/discover-variety.tsx', { useDiscoverVariety: (_id, items) => items });
const ForYou = require('../app/components/for-you.tsx').default;
const props = { selected: ['netflix'], offer: 'all', feedback: [], likedTitles: [], syncMessage: '', storageWarning: false, signature: 'likes-a', syncStatus: 'saved', exclude: [], genre: 'all', extra: {}, mode: 'balanced', isSaved: () => false, onSave() {}, onOpen() {}, onFeedback() {} };
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const names = () => nodes(tree).filter(n => n.props?.title).map(n => n.props.title.name);
async function render() { for (let n = 0; n < 20; n++) { index = 0; effects = []; dirty = false; tree = ForYou(props); effects.forEach(fn => fn()); await new Promise(r => setImmediate(r)); if (!dirty) return; } throw Error('Render did not settle'); }
function answer(i, name, status = 200) { requests[i].resolve(Response.json(status === 200 ? { seedCount: 1, message: null, picks: [{ title: { id: name, name, kind: 'movie', genres: [], offers: [] }, reason: 'Because you liked a film' }] } : { error: 'Unavailable' }, { status })); }
(async () => {
  await render(); assert.equal(requests.length, 1); answer(0, 'First pick'); await render(); assert.ok(names().includes('First pick'));
  props.syncStatus = 'connecting'; await render(); props.syncStatus = 'saved'; await render(); assert.equal(requests.length, 1, 'routine sync does not refetch unchanged recommendations');
  props.selected = ['disney']; await render(); assert.equal(requests.length, 2);
  props.selected = ['netflix']; await render(); assert.equal(requests.length, 3, 'returning to a successful filter after cancelling another must load again');
  assert.ok(requests[1].options.signal.aborted); answer(1, 'Stale Disney pick'); answer(2, 'Netflix restored'); await render(); assert.deepEqual(names(), ['Netflix restored']);
  props.signature = 'likes-b'; props.syncStatus = 'saving'; await render(); assert.equal(requests.length, 3, 'wait for favourites to sync');
  props.syncStatus = 'saved'; await render(); answer(3, 'New favourite pick'); await render(); assert.deepEqual(names(), ['New favourite pick']);
  props.mode = 'adventurous'; await render(); answer(4, 'Adventurous pick'); await render();
  now += 16 * 60000; document.visibilityState = 'hidden'; listeners.get('visibilitychange')(); await render(); assert.equal(requests.length, 5);
  document.visibilityState = 'visible'; listeners.get('visibilitychange')(); listeners.get('focus')(); await render(); assert.equal(requests.length, 6, 'stale foreground recommendations refresh once');
  assert.deepEqual(names(), ['Adventurous pick'], 'background refresh keeps current cards visible');
  answer(5, '', 503); await render(); assert.deepEqual(names(), ['Adventurous pick'], 'refresh failure keeps usable suggestions');
  nodes(tree).find(n => n.type === 'button' && n.props.children === 'Retry').props.onClick(); await render(); answer(6, 'Recovered pick'); await render(); assert.deepEqual(names(), ['Recovered pick']);
  now += 16 * 60000; for (const tick of timers.values()) tick(); await render(); assert.equal(requests.length, 8, 'a visible open page periodically rechecks'); answer(7, 'Timed pick'); await render();
  assert.ok(requests.every(r => r.options.cache === 'no-store'));
  assert.ok(nodes(tree).some(n => n.type === 'p' && JSON.stringify(n.props.children).includes('Last checked')));
  console.log('PASS: synced preference changes, service switches, A→B→A cancellation, modes, foreground/periodic refresh, duplicate-event suppression and retained suggestions on failure.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { slots.forEach(s => s?.cleanup?.()); Object.assign(React, original); Date.now = realNow; global.setInterval = realInterval; global.clearInterval = realClear; });
