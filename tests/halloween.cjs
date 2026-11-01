const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]), get = p => require(path.join(root, p));
const seasonal = get('lib/seasonal.js'), state = get('lib/library-state.js');
const home = get('lib/home-preferences.js'), picks = get('lib/halloween.js');
for (const [date, active] of [
  ['2026-09-30T22:59:00Z', false], ['2026-09-30T23:00:00Z', true],
  ['2026-10-31T23:59:00Z', true], ['2026-11-01T23:59:00Z', true], ['2026-11-02T00:00:00Z', false],
]) assert.equal(seasonal.halloweenActive(new Date(date)), active, 'London seasonal boundary ' + date);
const october = new Date('2026-10-20T12:00:00Z'), november = new Date('2026-11-02T12:00:00Z');
const appManifest = get('lib/app-manifest.js').appManifest;
const octoberManifest = appManifest(october), novemberManifest = appManifest(november);
assert.equal(octoberManifest.id, novemberManifest.id, 'the installed app identity remains stable');
assert.equal(octoberManifest.start_url, novemberManifest.start_url);
assert.deepEqual(octoberManifest.icons, novemberManifest.icons, 'standard icons remain in use during Halloween');
assert.ok(octoberManifest.icons.every(icon => !icon.src.includes('halloween')));
for (const icon of octoberManifest.icons) {
  const png = require('node:fs').readFileSync('public' + icon.src), size = Number(icon.sizes.split('x')[0]);
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
}
const apple = require('node:fs').readFileSync('public/icons/apple-touch-icon.png');
assert.equal(apple.readUInt32BE(16), 180);
assert.equal(seasonal.effectiveTheme('daylight', true, october), 'halloween');
assert.equal(seasonal.effectiveTheme('daylight', false, october), 'daylight');
assert.equal(seasonal.effectiveTheme('daylight', true, november), 'daylight', 'usual theme returns after the event');
const original = state.applyOperations(state.emptyLibrary(), [{ type: 'theme', value: 'daylight' }]);
assert.equal(state.projectLibrary(original).seasonal, true, 'existing accounts default to seasonal themes');
const disabled = state.applyOperations(original, [{ type: 'seasonal', value: false }]);
assert.equal(state.projectLibrary(disabled).theme, 'daylight');
assert.equal(state.projectLibrary(JSON.parse(JSON.stringify(disabled))).seasonal, false, 'preference round-trip');
assert.equal(state.projectLibrary(original).seasonal, true, 'no source mutation');
for (const value of ['false', null, 1]) assert.equal(state.validateMutation({ id: 'halloween-test-123', revision: 0, operations: [{ type: 'seasonal', value }] }), null);
assert.ok(state.validateMutation({ id: 'halloween-test-123', revision: 0, operations: [{ type: 'seasonal', value: false }] }));
const custom = home.resolveHome({ sections: ['next', 'personal'], hidden: ['halloween'] });
assert.deepEqual(custom.sections.slice(0, 3), ['halloween', 'next', 'personal']);
assert.ok(custom.hidden.includes('halloween'), 'shelf can stay hidden');

const hints = picks.halloweenSelections('all');
assert.equal(hints.length, 23, 'All chills includes the complete curated catalogue');
assert.equal(new Set(hints.map(h => h.name + h.year)).size, hints.length);
assert.ok(hints.some(h => h.kind === 'series'));
const allPicks = [...new Map(['horror', 'supernatural', 'family'].flatMap(picks.halloweenSelections).map(p => [p.kind + p.tmdbId, p])).values()];
assert.equal(allPicks.length, 23);
assert.ok(allPicks.every(p => Number.isSafeInteger(p.tmdbId) && p.tmdbId > 0));
const fixtures = new Map(allPicks.map(hint => [hint.tmdbId, { ...hint, id: hint.tmdbId }]));
for (let id = 90001; id <= 90005; id++) fixtures.set(id, { id, tmdbId: id, name: 'Extra Halloween film ' + id, kind: 'movie', year: 2020,
  genres: id === 90004 ? ['Family', 'Fantasy'] : ['Horror', 'Fantasy'],
  summary: id === 90004 ? 'A family investigates a haunted house.' : '' });
fixtures.set(90006, { id: 90006, tmdbId: 90006, name: 'Shrek Forever After', kind: 'movie', year: 2010,
  genres: ['Family', 'Fantasy'], summary: 'An ogre enters an alternate kingdom ruled by witches.' });
fixtures.set(90007, { id: 90007, tmdbId: 90007, name: 'The Chronicles of Narnia', kind: 'movie', year: 2005,
  genres: ['Family', 'Fantasy'], summary: 'Children discover a magical kingdom and challenge a witch.' });
const topicNames = ['halloween', 'ghost', 'vampire', 'werewolf', 'zombie', 'haunted house'];
let missingTopics = false;
const auth = get('lib/auth/server.js');
let member = false;
auth.requireSceneMember = async () => member ? { error: null, user: { id: 'halloween-member' } } : { error: Response.json({}, { status: 401 }) };
process.env.TMDB_API_KEY = 'fixture-only';
const calls = [], failures = new Map();
let mismatch = false;
global.fetch = async input => {
  const url = new URL(input); calls.push(url);
  assert.equal(url.hostname, 'api.themoviedb.org', 'existing TMDB integration only');
  if (url.pathname === '/3/search/keyword') {
    const topic = url.searchParams.get('query'), index = topicNames.indexOf(topic);
    assert.ok(index >= 0);
    return Response.json({ results: missingTopics ? [] : [{ id: 99999, name: topic + ' unrelated' }, { id: index + 1, name: topic }] });
  }
  if (url.pathname === '/3/genre/movie/list') return Response.json({ genres: [{ id: 14, name: 'Fantasy' }, { id: 27, name: 'Horror' }, { id: 10751, name: 'Family' }] });
  if (url.pathname === '/3/watch/providers/movie') return Response.json({ results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 337, provider_name: 'Disney Plus' }] });
  if (url.pathname === '/3/discover/movie') {
    assert.equal(url.searchParams.get('watch_region'), 'GB');
    assert.equal(url.searchParams.get('with_watch_providers'), '8');
    assert.equal(url.searchParams.get('include_adult'), 'false');
    assert.ok(url.searchParams.get('with_keywords').split('|').every(id => Number(id) >= 1 && Number(id) <= topicNames.length), 'only exact topic matches are used');
    return Response.json({ total_pages: 2, results: url.searchParams.get('page') === '2'
      ? [{ id: 90005 }] : [{ id: 10439 }, { id: 90001 }, { id: 90002 }, { id: 90003 }, { id: 90004 }, { id: 90006 }, { id: 90007 }, { id: 99999, adult: true }] });
  }
  assert.ok(!url.pathname.includes('/search/'), 'curated picks never depend on display-name searches');
  const fixture = fixtures.get(Number(url.pathname.split('/').at(-1)));
  assert.ok(fixture);
  assert.equal(url.pathname.split('/')[2], fixture.kind === 'movie' ? 'movie' : 'tv');
  if (failures.get(fixture.id) > 0) {
    failures.set(fixture.id, failures.get(fixture.id) - 1);
    return Response.json({}, { status: 503 });
  }
  const netflix = { provider_id: 8, provider_name: 'Netflix' }, disney = { provider_id: 337, provider_name: 'Disney Plus' };
  const providers = fixture.name === 'Halloween' || fixture.id === 90002 ? { rent: [netflix], flatrate: [disney] }
    : fixture.name === 'Scream' || fixture.id === 90003 ? null
    : fixture.name === 'Coraline' ? { free: [netflix] }
    : ['The Nightmare Before Christmas', 'The Others', 'Ghostbusters'].includes(fixture.name) ? { flatrate: [disney] }
    : { flatrate: [netflix] };
  return Response.json({
    id: mismatch && fixture.id === 10439 ? 999 : fixture.id,
    title: fixture.name === 'The Haunting of Hill House' ? 'The Haunting' : fixture.name,
    name: fixture.name, release_date: fixture.year + '-01-01', first_air_date: fixture.year + '-01-01',
    overview: fixture.summary || '',
    genres: (fixture.genres || [fixture.kind === 'series' ? 'Mystery' : 'Fantasy']).map(name => ({ name })), runtime: 100,
    'watch/providers': { results: { ...(providers ? { GB: providers } : {}), US: { flatrate: [netflix] } } },
  });
};
const freshRoute = () => {
  for (const file of ['app/api/discover/route.js', 'lib/tmdb.js']) delete require.cache[path.join(root, file)];
  return get('app/api/discover/route.js');
};
let route = freshRoute();
const req = extra => {
  const params = new URLSearchParams('section=halloween&services=netflix&offer=all');
  for (const [key, value] of new URLSearchParams(extra || '')) params.set(key, value);
  return new Request('https://scene.test/api/discover?' + params);
};
(async () => {
  assert.equal((await route.GET(req())).status, 401); assert.equal(calls.length, 0);
  member = true;
  for (const extra of ['&mood=invalid', '&runtimeMax=-1', '&services=unknown', '&page=-1', '&page=501', '&page=1.5', '&page=garbage']) assert.equal((await route.GET(req(extra))).status, 400);
  assert.equal(calls.length, 0, 'invalid requests do not make catalogue calls');
  const response = await route.GET(req()), data = await response.json();
  assert.equal(response.status, 200);
  const names = data.titles.map(t => t.name);
  for (const name of ['Hocus Pocus', 'Coraline', 'Wednesday', 'The Conjuring', 'The Haunting']) assert.ok(names.includes(name), 'fixed IDs survive renamed/ambiguous display names');
  for (const name of ['Halloween', 'Scream', 'The Nightmare Before Christmas']) assert.ok(!names.includes(name), 'excludes other services, rental-only and overseas offers');
  assert.equal(data.message, null);
  assert.equal(calls.length, 23, 'one detail request per unique curated pick');
  const oldShortlist = ['horror', 'supernatural', 'family'].flatMap(mood => picks.halloweenSelections(mood).slice(0, 4));
  const oldIds = new Set(oldShortlist.map(p => p.tmdbId));
  assert.equal(data.titles.filter(t => oldIds.has(t.tmdbId)).length, 7, 'reproduces the old seven-result service-filtered shelf');
  assert.equal(data.titles.length, 18, 'full catalogue continues beyond the old shortlist');
  assert.equal(data.page, 0); assert.equal(data.hasMore, true, 'live discovery is available after curated picks');
  assert.match(response.headers.get('Cache-Control'), /max-age=300/);
  assert.ok(data.titles.every(t => t.offers.some(o => o.key === 'netflix' && ['sub', 'free'].includes(o.type))));
  const subscription = await (await route.GET(req('&offer=sub'))).json();
  assert.ok(!subscription.titles.some(t => t.name === 'Coraline'), 'subscription filter remains exact');
  const genre = await (await route.GET(req('&genre=Mystery'))).json();
  assert.ok(genre.titles.length && genre.titles.every(t => t.kind === 'series'));
  for (const mood of ['horror', 'supernatural', 'family']) {
    const category = await (await route.GET(req('&mood=' + mood))).json();
    assert.equal(category.message, null, mood + ' resolves every configured pick');
    assert.ok(category.titles.every(t => picks.halloweenSelections(mood).some(p => p.tmdbId === t.tmdbId)));
  }
  assert.equal(calls.length, 23, 'overlapping categories share cached details');
  const more = await (await route.GET(req('&page=1'))).json();
  assert.equal(more.page, 1); assert.equal(more.hasMore, true);
  assert.ok(more.titles.some(t => t.tmdbId === 90001));
  assert.ok(!more.titles.some(t => [90002, 90003, 99999].includes(t.tmdbId)), 'live discovery rechecks rental-only, overseas and adult results');
  assert.ok(!more.titles.some(t => [90006, 90007].includes(t.tmdbId)), 'live discovery rejects Shrek/Narnia even when the upstream themed query returns them');
  const merge = get('lib/browse-loading.js').mergeBrowseTitles;
  const merged = merge(data.titles, more.titles);
  assert.equal(merged.length, 20, 'additional films append without repeating a curated pick');
  const end = await (await route.GET(req('&page=2'))).json();
  assert.equal(end.hasMore, false); assert.equal(end.page, 2);
  const family = await (await route.GET(req('&page=1&mood=family&genre=Fantasy'))).json();
  assert.ok(family.titles.length && family.titles.every(t => t.genres.includes('Family') && t.genres.includes('Fantasy')));
  assert.ok(!family.titles.some(t => [90006, 90007].includes(t.tmdbId)), 'Family friendly still requires a spooky story');
  const familyQuery = calls.filter(u => u.pathname === '/3/discover/movie').at(-1);
  assert.equal(familyQuery.searchParams.get('with_genres'), '14,10751', 'category and user genres are ANDed');
  const horror = await (await route.GET(req('&page=1&mood=horror'))).json();
  assert.ok(horror.titles.length && horror.titles.every(t => t.genres.includes('Horror')));
  assert.equal(calls.filter(u => u.pathname === '/3/search/keyword').length, 6, 'narrower keyword metadata is cached across pages/categories');
  const exact = get('lib/tmdb.js').exactTitleMatch;
  const duplicate = { title: 'The Conjuring', release_date: '2013-01-01' };
  assert.equal(exact([{ ...duplicate, id: 1 }, { ...duplicate, id: 2 }], { name: 'The Conjuring', year: 2013, kind: 'movie' }), undefined, 'general title resolution still rejects ambiguous searches');

  route = freshRoute(); calls.length = 0; failures.set(138843, 1);
  const automatic = await (await route.GET(req())).json();
  assert.equal(automatic.message, null);
  assert.ok(automatic.titles.some(t => t.name === 'The Conjuring'));
  assert.equal(calls.filter(u => u.pathname === '/3/movie/138843').length, 2, 'a transient failure recovers automatically');

  const warn = console.warn, warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    route = freshRoute(); calls.length = 0; failures.set(138843, 2);
    const partialResponse = await route.GET(req()), partial = await partialResponse.json();
    assert.ok(partial.message); assert.ok(partial.titles.some(t => t.name === 'Hocus Pocus'));
    assert.ok(!partial.titles.some(t => t.name === 'The Conjuring'));
    assert.match(partialResponse.headers.get('Cache-Control'), /no-store/, 'browser cannot retain incomplete responses');
    const callsBeforeRetry = calls.length;
    const recovered = await (await route.GET(req())).json();
    assert.equal(recovered.message, null);
    assert.ok(recovered.titles.some(t => t.name === 'The Conjuring'));
    assert.equal(calls.length, callsBeforeRetry + 1, 'Retry recovers failed picks while reusing successful details');
    assert.ok(warnings.every(args => !JSON.stringify(args).includes('fixture-only') && !JSON.stringify(args).includes('api_key')));

    route = freshRoute(); mismatch = true;
    const guarded = await (await route.GET(req())).json();
    assert.ok(guarded.message); assert.ok(!guarded.titles.some(t => t.tmdbId === 999));
    mismatch = false;
    route = freshRoute();
    for (const pick of hints) failures.set(pick.tmdbId, 2);
    const unavailable = await route.GET(req());
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.headers.get('Cache-Control'), /no-store/);
  } finally { console.warn = warn; }
  route = freshRoute(); missingTopics = true;
  const beforeMissing = calls.filter(u => u.pathname === '/3/discover/movie').length;
  assert.equal((await route.GET(req('&page=1'))).status, 503);
  assert.equal(calls.filter(u => u.pathname === '/3/discover/movie').length, beforeMissing, 'missing topic metadata never falls back to an unthemed feed');
  missingTopics = false;

  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const Shelf = get('app/components/halloween.js').default;
  const filters = get('lib/catalogue-filters.js'), extra = filters.noExtraFilters(), noop = () => {};
  const shelfProps = { genre: 'all', extra, hideWatched: true, onGenres: noop, onFilters: noop,
    filtersExpanded: false, filtersActive: false, selected: ['netflix'], offer: 'all', feedback: [],
    isSaved: () => false, onSave: noop, onOpen: noop, onFeedback: noop };
  const shelfUrl = '/api/discover?' + new URLSearchParams({ section: 'halloween', v: picks.halloweenCatalogueVersion,
    mood: 'all', services: 'netflix', offer: 'all', genre: 'all', ...filters.extraParams(extra) });
  const originalUseState = React.useState;
  let shelfState = { url: shelfUrl, pages: [{ ...data, message: 'Some Halloween picks are temporarily unavailable.' }], error: '', busy: true, attempt: 0 };
  React.useState = initial => originalUseState(initial && typeof initial === 'object' && 'url' in initial ? shelfState : initial);
  try {
    const retrying = renderToStaticMarkup(React.createElement(Shelf, shelfProps));
    assert.match(retrying, /Hocus Pocus/); assert.match(retrying, /Retrying picks/);
    assert.match(retrying, /class="text-button" disabled=""/, 'repeat Retry is disabled while refreshing');
    shelfState = { ...shelfState, busy: false, error: 'Retry could not load.' };
    const retryFailed = renderToStaticMarkup(React.createElement(Shelf, shelfProps));
    assert.match(retryFailed, /Hocus Pocus/); assert.match(retryFailed, /Retry could not load/);
    assert.ok(!retryFailed.includes('No matches in this category'), 'retains successful cards after a failed Retry');
    shelfState = { ...shelfState, pages: [data, more, end], error: '', busy: false };
    const expanded = renderToStaticMarkup(React.createElement(Shelf, shelfProps));
    assert.match(expanded, /21 picks on your services/);
    assert.equal((expanded.match(/class="title-card"/g) || []).length, 21, 'UI merges all pages without duplicate cards');
    assert.ok(!expanded.includes('Load more Halloween films'), 'load more stops at the last page');
    shelfState = { ...shelfState, pages: [data], error: '', busy: false };
    assert.match(renderToStaticMarkup(React.createElement(Shelf, shelfProps)), /Load more Halloween films/);
    const hiddenProps = { ...shelfProps, feedback: [{ title: data.titles[0], watched: true, liked: false, hidden: false }] };
    const hidden = renderToStaticMarkup(React.createElement(Shelf, hiddenProps));
    assert.match(hidden, /17 picks on your services/); assert.equal((hidden.match(/class="title-card"/g) || []).length, 17);
  } finally { React.useState = originalUseState; }
  const hooks = get('app/components/seasonal.js');
  hooks.useHalloween = () => true;
  const Access = get('app/components/scene-access.js').default;
  const useState = React.useState;
  let slot = 0;
  React.useState = initial => useState(slot++ === 1 ? false : initial);
  let login;
  try { login = renderToStaticMarkup(React.createElement(Access, null)); } finally { React.useState = useState; }
  assert.match(login, /seasonal-login/); assert.match(login, /A good night for a fright/);
  for (const text of ['Halloween on Scene', 'type="email"', 'type="password"', 'Show password', 'Sign in']) assert.ok(login.includes(text));
  hooks.useHalloween = () => false;
  const normal = renderToStaticMarkup(React.createElement(Access, null));
  assert.match(normal, /Welcome back/); assert.ok(!normal.includes('seasonal-login'));
  console.log('PASS: seven-pick regression, full curated catalogue, live themed pagination, deduplication, category/user filters, UK offer checks, watched counts, retries/recovery, cache guards, auth and seasonal sign-in.');
})().catch(error => { console.error(error); process.exitCode = 1; });
