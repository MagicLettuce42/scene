const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Load the production components and the actual page filtering callback.
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => {
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText, file);
};
const { filterTitles } = require('../lib/catalogue.ts');
const { visibleSuggestions } = require('../lib/preferences.ts');
const { matchesExtra, noExtraFilters } = require('../lib/catalogue-filters.ts');
const source = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'filtered') callback = node.initializer.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback);
const title = { id: 'tmdb-tv-999999', name: 'Blue Planet III', kind: 'series', year: 2026,
  genres: ['Documentary'], summary: '', poster: null, offers: [], live: true };
const confirmed = { ...title, id: 'confirmed', offers: [{ key: 'bbc', name: 'BBC iPlayer', type: 'free', url: 'https://www.bbc.co.uk/iplayer' }] };
const elsewhere = { ...title, id: 'elsewhere', offers: [{ key: 'netflix', name: 'Netflix', type: 'sub', url: 'https://www.netflix.com' }] };
const context = { filterTitles, visibleSuggestions, matchesExtra, base: [title, confirmed, elsewhere],
  view: 'discover', submitted: 'Blue Planet', kind: 'all', genre: 'all', offer: 'all',
  activeServices: ['bbc'], activeProvider: 'mine', feedback: [], hideWatched: true,
  extra: noExtraFilters(), browsing: false, sort: 'relevance', availability: 'all', watchlistTab: 'saved' };
const filter = (changes = {}) => vm.runInNewContext(`(${callback})()`, { ...context, ...changes });
assert.deepEqual(Array.from(filter(), t => t.id), [title.id, 'confirmed', 'elsewhere']);
assert.equal(filter({ activeServices: [] }).length, 3);
assert.equal(filter({ offer: 'sub' }).length, 3);
assert.equal(filter({ genre: 'Comedy' }).length, 0);
assert.equal(filter({ extra: { ...noExtraFilters(), yearTo: 2025 } }).length, 0);
assert.equal(filter({ feedback: [{ title, hidden: true }] }).some(t => t.id === title.id), false);
assert.deepEqual(Array.from(filter({ submitted: '' }), t => t.id), ['confirmed']);

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const SearchResults = require('../app/components/search-results.tsx').default;
const WatchOptions = require('../app/components/watch-options.tsx').default;
const actions = { selected: ['bbc'], offer: 'all', feedback: [], isSaved: () => false,
  onSave() {}, onOpen() {}, onFeedback() {}, onServices() {}, onPerson() {}, onMorePeople() {} };
const render = (titles, query = 'Blue Planet III') => renderToStaticMarkup(React.createElement(SearchResults,
  { ...actions, titles, query, people: [], peopleHasMore: false, peopleMessage: '', busy: false }));
const html = render([title]);
assert.match(html, /Availability not confirmed/);
assert.match(html, /Save Blue Planet III to watchlist/);
assert.match(html, /iplayer\/search\?q=Blue%20Planet%20III/);
assert.doesNotMatch(html, /Unavailable on your services/);
assert.doesNotMatch(render([confirmed]), /class="unknown-availability"/);
assert.match(render([], 'Blue & Ocean?'), /iplayer\/search\?q=Blue%20%26%20Ocean%3F/);
assert.match(render([]), /No films or series match this search/);
const details = renderToStaticMarkup(React.createElement(WatchOptions, { title, offers: [], selected: ['bbc'] }));
assert.match(details, /No subscription or free options are confirmed/);
assert.match(details, /Search BBC iPlayer/);
console.log('PASS: unconfirmed and other-service search matches stay visible/saveable; browsing and title filters remain scoped; BBC search works with empty results and details.');
