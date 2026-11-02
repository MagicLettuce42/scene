const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(process.argv[2]), get = p => require(path.join(root, p));
const React = require('react');
const original = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map(k => [k, React[k]]));
const storage = () => { const entries = new Map(); return { getItem: k => entries.get(k) || null,
  setItem: (k, v) => entries.set(k, v), removeItem: k => entries.delete(k) }; };
global.sessionStorage = storage(); global.localStorage = storage();
global.location = { search: '', hash: '', pathname: '/' }; global.history = { replaceState() {} };
global.window = { scrollY: 0, innerHeight: 800, addEventListener() {}, removeEventListener() {}, scrollTo() {} };
global.document = { documentElement: { dataset: {}, scrollHeight: 800 }, body: { style: {} }, getElementById() { return null; } };
global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
global.ResizeObserver = class { observe() {} disconnect() {} };
const boundary = get('lib/auth/session-boundary.js'); boundary.setSessionAccount('filter-a');
const account = { id: 'filter-a', name: 'Fixture', role: 'member' };
get('app/components/scene-access.js').useAccount = () => account;
get('lib/use-mobile-viewport.js').useMobileViewport = () => {};
let halloweenActive = true;
get('app/components/seasonal.js').useHalloween = () => halloweenActive;
const { titles, filterTitles } = get('lib/catalogue.js');
const library = { ...get('lib/library-state.js').projectLibrary(get('lib/library-state.js').emptyLibrary()),
  ready: true, loaded: true, onboarded: true, selected: ['netflix', 'disney'], saved: titles.slice(0, 10),
  status: 'saved', home: { startView: 'discover', sections: ['personal', 'arrivals', 'leaving', 'tonight', 'popular'], hidden: [], density: 'comfortable' } };
get('lib/use-library-sync.js').useLibrarySync = () => library;
get('lib/auth/client.js').sceneFetch = async () => Response.json({ live: true, source: 'tmdb' });
const calls = [];
const cache = get('lib/client-cache.js'); cache.readCache = () => null; cache.writeCache = () => {};
cache.cachedJSON = async url => {
  calls.push(url);
  const p = new URL(url, 'https://fixture.invalid').searchParams;
  return { titles: filterTitles(titles, { kind: p.get('kind') === 'tv' ? 'series' : p.get('kind') || 'all',
    genre: 'all', offer: 'all', provider: 'all', mine: true, selected: (p.get('services') || 'netflix,disney').split(',') }),
    people: [], page: 1, hasMore: false, capped: false, genres: [], message: null };
};
const Home = get('app/page.js').default;
const Catalogue = Home().props.children.props.children.type;
let hooks = [], index = 0, pending = [], dirty = false;
React.useState = initial => {
  const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
  return [hooks[i], next => { const value = typeof next === 'function' ? next(hooks[i]) : next;
    if (!Object.is(value, hooks[i])) { hooks[i] = value; dirty = true; } }];
};
React.useRef = initial => { const i = index++; return hooks[i] ||= { current: initial }; };
React.useMemo = fn => { index++; return fn(); };
React.useCallback = fn => { index++; return fn; };
React.useEffect = (fn, deps) => {
  const i = index++, old = hooks[i];
  if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps?.[j]))) {
    hooks[i] = { deps, cleanup: old?.cleanup }; pending.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); });
  }
};
let tree;
async function render() {
  for (let attempts = 0; attempts < 12; attempts++) {
    index = 0; dirty = false; pending = []; tree = Catalogue();
    for (const effect of pending) effect();
    await new Promise(resolve => setImmediate(resolve));
    if (!dirty) return;
  }
  throw Error('Render did not settle');
}
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  // Watchlist controls now live in explicit disclosure-panel slots.
  const slots = value.type === get('app/components/watchlist-toolbar.js').default
    ? ['filters', 'collections', 'sort', 'settings', 'syncDetails'].flatMap(key => nodes(value.props[key])) : [];
  return [value, ...nodes(value.props?.children), ...slots];
}
const node = predicate => { const found = nodes(tree).find(predicate); assert.ok(found, 'expected UI node'); return found; };
const scope = () => node(n => n.type === get('app/components/service-scope.js').default);
async function openFilters() {
  const button = nodes(tree).find(n => n.type === 'button' && n.props['aria-controls'] === 'catalogue-filters');
  if (button && !button.props['aria-expanded']) { button.props.onClick(); await render(); }
}
const navigate = label => node(n => n.type === 'button' && (n.props.children === label || n.props.children?.[0] === label)).props.onClick();
async function choose(value) { scope().props.onChange(value); await render(); }
(async () => {
  try {
    await render();
    assert.ok(scope(), 'service scope is visible without expanding Filters');
    assert.equal(scope().props.provider, 'mine');
    assert.deepEqual(scope().props.selected, ['netflix', 'disney']);
    const homeOrder = () => nodes(tree).filter(n => n.props?.className === 'home-section').map(n => n.key);
    const initialHome = library.home;
    assert.deepEqual(homeOrder(), initialHome.sections.slice(0, 4), 'collapsed Discover respects saved order');
    library.home = { ...initialHome, sections: ['tonight', 'popular', 'leaving', 'arrivals', 'personal'] };
    await render();
    assert.deepEqual(homeOrder(), ['tonight', 'popular', 'leaving', 'arrivals'], 'moving a secondary section to the top makes it visible immediately');
    const HomeSettings = get('app/components/home-settings.js').default;
    const settings = HomeSettings({ value: library.home, onChange: fields => { library.home = { ...library.home, ...fields }; } });
    nodes(settings).find(n => n.props?.['aria-label'] === 'Move Popular on your services up').props.onClick();
    await render();
    assert.deepEqual(homeOrder(), ['popular', 'tonight', 'leaving', 'arrivals'], 'settings move buttons update the rendered order');
    node(n => n.type === 'button' && n.props.children === 'More to explore').props.onClick(); await render();
    assert.deepEqual(homeOrder(), library.home.sections, 'expanded Discover preserves the complete saved order');
    assert.deepEqual(node(n => n.type === get('app/components/discover-variety.js').DiscoverVariety).props.order, homeOrder(), 'duplicate-title priority follows the rendered order');
    node(n => n.type === 'button' && n.props.children === 'Show fewer sections').props.onClick();
    library.home = { ...library.home, hidden: ['popular', 'leaving'] }; halloweenActive = false; await render();
    assert.deepEqual(homeOrder(), ['tonight', 'arrivals', 'personal'], 'hidden and unavailable seasonal rows do not occupy the first four slots');
    assert.ok(!nodes(tree).some(n => n.type === 'button' && n.props.children === 'More to explore'), 'no empty expansion when at most four sections are available');
    library.home = initialHome; halloweenActive = true; await render();
    await choose('netflix');
    node(n=>n.type==='button'&&n.props.children==='More to explore').props.onClick(); await render();
    for (const filename of ['for-you', 'service-activity', 'tonight', 'discover']) {
      const Component = get('app/components/' + filename + '.js').default;
      const sections = nodes(tree).filter(n => n.type === Component);
      assert.ok(sections.length, filename + ' section is present');
      for (const section of sections) assert.deepEqual(section.props.selected, ['netflix'], filename);
    }
    navigate('Films'); await render(); await openFilters();
    assert.equal(scope().props.provider, 'netflix', 'navigation preserves the global selection');
    let request = new URL(calls.findLast(u => u.startsWith('/api/browse?')), 'https://fixture.invalid');
    assert.equal(request.searchParams.get('services'), 'netflix');
    assert.equal(request.searchParams.get('kind'), 'movie');
    assert.equal(library.selected.length, 2, 'temporary filter never changes saved services');
    await choose('disney');
    request = new URL(calls.findLast(u => u.startsWith('/api/browse?')), 'https://fixture.invalid');
    assert.equal(request.searchParams.get('services'), 'disney', 'service changes refetch the catalogue');
    navigate('TV series'); await render();
    request = new URL(calls.findLast(u => u.startsWith('/api/browse?')), 'https://fixture.invalid');
    assert.equal(request.searchParams.get('services'), 'disney'); assert.equal(request.searchParams.get('kind'), 'tv');
    navigate('Upcoming'); await render();
    const upcoming = node(n => n.props?.filters && n.props?.onFilters && n.props?.serviceFilter);
    assert.equal(upcoming.props.filters.provider, 'disney'); assert.deepEqual(upcoming.props.selected, ['disney']);
    node(n => n.props?.id === 'search').props.onChange({ target: { value: 'fixture' } }); await render();
    await node(n => n.type === 'form' && n.props.role === 'search').props.onSubmit({ preventDefault() {} }); await render();
    const results = node(n => n.type === get('app/components/search-results.js').default);
    await openFilters();
    assert.deepEqual(results.props.selected, ['disney']);
    assert.ok(results.props.titles.length, 'search keeps matches visible when availability is unconfirmed or on another service');
    const tabs = get('lib/tab-memory.js');
    assert.equal(tabs.readTabs(account.id).provider, 'disney', 'refresh restores the selected service');
    assert.equal(tabs.readTabs('another-account').provider, 'mine', 'filter state is account scoped');
    library.selected = ['netflix']; await render();
    assert.equal(scope().props.provider, 'mine', 'removing the filtered service resets safely');
    library.selected = ['netflix', 'disney']; await choose('netflix');
    await choose('mine'); assert.equal(scope().props.provider, 'mine');
    navigate('Watchlist'); await render();
    const Cards = get('app/components/catalogue-cards.js').TitleCard;
    assert.equal(nodes(tree).filter(n => n.type === Cards).length, library.saved.length, 'default retains all saved history');
    await choose('netflix');
    const savedCards = nodes(tree).filter(n => n.type === Cards);
    assert.ok(savedCards.length > 0);
    assert.ok(savedCards.every(n => n.props.title.offers.some(o => o.key === 'netflix' && ['sub', 'free'].includes(o.type))));
    node(n => n.type === 'button' && n.props.children === 'Clear filters').props.onClick(); await render();
    assert.equal(scope().props.provider, 'mine', 'Clear filters also resets the service scope');
    sessionStorage.setItem(tabs.tabMemoryKey(account.id), JSON.stringify({ view: 'films', provider: 'invalid', tabs: {} }));
    assert.equal(tabs.readTabs(account.id).provider, 'mine', 'unknown stored services are rejected');
    if (process.argv[3]) {
      await choose('netflix'); navigate('Films'); await render(); await openFilters();
      Object.assign(React, original);
      const markup = require('react-dom/server').renderToStaticMarkup(tree);
      fs.writeFileSync(process.argv[3], '<!doctype html><html data-theme="halloween"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/globals.css?direct"><body>' + markup + '</body></html>');
    }
    console.log('PASS: service scope across Films/TV, search, discovery, Halloween and arrivals; refetch, navigation, refresh, account isolation, reset and saved-service preservation.');
  } finally { Object.assign(React, original); }
})().catch(error => { console.error(error); process.exitCode = 1; });
