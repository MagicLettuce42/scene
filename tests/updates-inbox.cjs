const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, f);
const React = require('react'), originals = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
let hooks = [], index = 0, effects = [], dirty = false, output, account = 'a';
React.useState = initial => { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; dirty = true; }]; };
React.useRef = initial => { const i = index++; return hooks[i] ||= { current: initial }; };
React.useEffect = (fn, deps) => { const i = index++, old = hooks[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { hooks[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); }); } };
const stored = new Map(); global.localStorage = { getItem: k => stored.get(k) || null, setItem: (k, v) => stored.set(k, v) };
global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const title = { id: 'title-a', name: 'Account A title', kind: 'movie', year: 2026, offers: [], genres: [], summary: '' };
const pending = []; const client = require.resolve('../lib/auth/client.ts');
require.cache[client] = { id: client, filename: client, loaded: true, exports: { sceneFetch: (url, options, expectedId) => new Promise(resolve => pending.push({ url, options, expectedId, resolve })) } };
const { useSceneUpdates } = require('../app/components/updates-inbox.tsx');
async function render() { for (let attempts = 0; attempts < 20; attempts++) { index = 0; effects = []; dirty = false; output = useSceneUpdates(account); effects.forEach(fn => fn()); await new Promise(r => setImmediate(r)); if (!dirty) return; } throw Error('Hook did not settle'); }
function respond(id, path, body, status = 200) { const request = pending.find(p => p.expectedId === id && p.url.startsWith(path) && !p.done); assert.ok(request); request.done = true; request.resolve(Response.json(body, { status })); return request; }
(async () => {
  await render(); assert.equal(pending.length, 3); assert.ok(pending.every(p => p.expectedId === 'a' && p.options.cache === 'no-store'));
  respond('a', '/api/availability-alerts', { events: [{ id: 'one', title, detectedAt: '2026-11-08', serviceKey: 'netflix' }] });
  respond('a', '/api/reminders', { error: 'temporary failure' }, 503);
  await render(); assert.equal(output.rows[0].name, title.name, 'a slow source does not block successful updates'); assert.deepEqual(output.errors, ['Release reminders']);
  output.mark([output.rows[0].id]); await render(); assert.equal(output.unread, 0); assert.ok(stored.has('scene.updates.read.a'));
  account = 'b'; await render(); assert.equal(output.rows.length, 0, 'account switches clear prior updates');
  assert.ok(pending.filter(p => p.expectedId === 'a').every(p => p.options.signal.aborted));
  respond('a', '/api/people/following', { updates: [{ title, date: '2026-11-08', people: [], unread: true }], failedPeople: [], hasMore: false });
  respond('b', '/api/availability-alerts', { events: [] }); respond('b', '/api/reminders', { reminders: [] }); respond('b', '/api/people/following', { updates: [], failedPeople: [], hasMore: false });
  await render(); assert.equal(output.rows.length, 0, 'late A responses cannot populate B'); assert.equal(output.busy, false); assert.deepEqual(output.errors, []);
  console.log('PASS: independent inbox sources, partial failure, explicit account binding, read marks, cancellation and late-response isolation.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { hooks.forEach(h => h?.cleanup?.()); Object.assign(React, originals); });
