const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the production open handler with stale saved/browser data, errors,
// and overlapping title requests rather than duplicating its decision logic.
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'openTitle') handler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler);
const compiled = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const old = { id: 'tmdb-movie-71679', name: 'Saved title', offers: [{ key: 'disney' }] };
const fresh = { ...old, offers: [] };
const state = { results: [old], browse: { titles: [old] } };
let requests = [], writes = [], saved = [], pending = [];
const context = {
  modal: { current: { scrollTop: 20 } }, detailRequest: { current: 0 },
  setDirectOffers() {}, setDirectBusy() {}, setDirectMessage() {}, setDialog() {},
  setDetail: value => state.detail = value,
  setDetailBusy: value => state.busy = value,
  setDetailError: value => state.error = value,
  setResults: update => state.results = update(state.results),
  setBrowse: update => state.browse = update(state.browse),
  titleEndpoint: title => `/api/title/${title.id}?kind=movie`,
  cachedJSON: (...args) => { requests.push(args); return pending.shift()(); },
  writeCache: (...args) => writes.push(args),
  library: { refreshTitles: titles => saved.push(titles) },
};
vm.createContext(context);
vm.runInContext(compiled, context);
(async () => {
  pending.push(async () => ({ title: fresh }));
  await context.openTitle(old);
  assert.match(requests[0][0], /&refresh=1$/);
  assert.equal(requests[0][2], true, 'normal open bypasses browser cache');
  assert.equal(state.detail.offers.length, 0);
  assert.equal(state.results[0].offers.length, 0);
  assert.equal(state.browse.titles[0].offers.length, 0);
  assert.equal(saved[0][0].offers.length, 0);
  assert.equal(writes[0][0], context.titleEndpoint(old), 'normal cache is updated too');
  assert.equal(state.busy, false);

  pending.push(async () => { throw Error('offline'); });
  await context.openTitle(old);
  assert.equal(state.detail, old, 'failed checks retain saved details');
  assert.match(state.error, /could not be refreshed/);
  assert.equal(state.busy, false);
  assert.equal(saved.length, 1, 'failed checks never overwrite saved availability');

  let resolveOld;
  pending.push(() => new Promise(resolve => resolveOld = resolve));
  const slow = context.openTitle(old);
  const other = { ...fresh, id: 'tmdb-movie-2' };
  pending.push(async () => ({ title: other }));
  await context.openTitle(other);
  resolveOld({ title: fresh });
  await slow;
  assert.equal(state.detail.id, other.id, 'an older request cannot replace the latest title');
  assert.equal(saved.length, 2, 'superseded requests do not update the library or cache');
  assert.match(source, /detailError && !detailBusy && <button/);
  assert.doesNotMatch(source, /"Refresh availability"/);
  console.log('PASS: opening auto-refreshes, updates saved/card/browser data, retains details on error, offers retry, and ignores superseded requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
