const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText, file);
const React = require('react');
const savedHooks = { useState: React.useState, useEffect: React.useEffect };
let slots = [], cursor = 0, effects = [];
React.useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
  return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; };
React.useEffect = (effect, deps) => { const i = cursor++, old = slots[i];
  if (!old || deps.some((value, j) => value !== old.deps[j])) {
    slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); });
  }
};
const entries = new Map();
global.sessionStorage = { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) };
const title = { id: 'tmdb-movie-335797', name: 'Sing', kind: 'movie', year: 2016, offers: [], genres: [] };
const cacheFile = require.resolve('../lib/client-cache.ts');
require.cache[cacheFile] = { id: cacheFile, filename: cacheFile, loaded: true,
  exports: { cachedJSON: async () => ({ titles: [title] }) } };
const Suggestions = require('../app/components/search-suggestions.tsx').default;
let active = true, chosen = [], searched = [], query = 'Sing';
const render = () => { cursor = 0; effects = []; const tree = Suggestions({ query, accountId: 'fictional', active,
  onChoose: value => { chosen.push(value); active = false; }, onSearch: value => searched.push(value) });
  effects.forEach(effect => effect()); return tree; };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
  ? [tree, ...nodes(tree.props?.children)] : [];
(async () => {
  render(); render(); await new Promise(resolve => setTimeout(resolve, 400));
  let tree = render();
  assert.equal(tree.props.onPointerDown, undefined, 'suggestions use normal button activation; dismissal belongs to the enclosing search region');
  nodes(tree).find(node => node.type === 'button' && node.props.children?.[0]?.type === 'strong').props.onClick();
  assert.deepEqual(chosen, [title], 'a normal click opens the exact selected title once');
  assert.equal(render(), null, 'choosing a title dismisses suggestions');
  assert.deepEqual(JSON.parse(entries.get('scene.recent-searches.fictional')), ['Sing']);
  active = true; render(); render(); await new Promise(resolve => setTimeout(resolve, 400)); tree = render();
  nodes(tree).find(node => node.props?.className === 'all-search-results').props.onClick();
  assert.deepEqual(searched, ['Sing'], 'keyboard-generated click works without pointerdown');
  active = false; render();
  console.log('PASS: exact suggestion selected once, recent query saved, selection dismisses suggestions and keyboard-generated search click works. Browser pointer activation is checked separately.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => Object.assign(React, savedHooks));
