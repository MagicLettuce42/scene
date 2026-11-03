const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText, file);
process.env.TMDB_API_KEY = 'fictional-test-key';
const calls = [];
let failProvider = false;
global.fetch = async input => {
  const url = new URL(input); calls.push(url.pathname);
  if (url.pathname.endsWith('/search/multi')) return Response.json({ total_pages: 2, results: [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, media_type: i ? 'movie' : 'tv',
      name: i ? undefined : 'Blue Planet III', title: i ? 'Film ' + i : undefined,
      first_air_date: '2026-11-01', release_date: '2026-01-01', genre_ids: [99],
      original_language: 'en', vote_average: 8, vote_count: 100, poster_path: '/sample.jpg' })),
    { id: 901, name: 'Fictional actor', media_type: 'person', known_for_department: 'Acting' },
    { id: 902, name: 'Excluded adult', adult: true, media_type: 'person' },
    { id: 903, title: 'Excluded adult film', adult: true, media_type: 'movie' },
    { id: -1, name: 'Invalid record', media_type: 'tv' },
  ] });
  if (url.pathname.endsWith('/tv/1')) return Response.json({ id: 1, name: 'Blue Planet III',
    first_air_date: '2026-11-01', genres: [{ name: 'Documentary' }], episode_run_time: [60],
    'watch/providers': { results: { GB: { free: [{ provider_name: 'BBC iPlayer', provider_id: 38 }] } } } });
  if (failProvider && url.pathname.endsWith('/movie/20/watch/providers')) return Response.json({}, {status:503});
  if (/\/(movie|tv)\/\d+\/watch\/providers$/.test(url.pathname)) return Response.json({ results: {
    GB: { free: [{ provider_name: 'BBC iPlayer', provider_id: 38 }] },
    US: { flatrate: [{ provider_name: 'Netflix', provider_id: 8 }] },
  } });
  throw Error('Unexpected upstream request: ' + url.pathname);
};
(async () => {
  const { searchTMDB, tmdbDetails } = require('../lib/tmdb.ts');
  const first = await searchTMDB('Blue Planet');
  assert.equal(calls.length, 21, 'twenty bounded provider-only lookups accompany one metadata/people request');
  assert.equal(calls.filter(p=>p.endsWith('/watch/providers')).length,20,'search never fetches full title details per result');
  assert.equal(first.titles.length, 20);
  assert.equal(first.people.length, 1);
  assert.equal(first.people[0].name, 'Fictional actor');
  assert.deepEqual(first.titles[0].genres, ['Documentary']);
  assert.ok(first.titles[0].checked, 'availability is fetched before displaying service-scoped search');
  assert.deepEqual(first.titles[0].offers.map(o=>o.key), ['bbc'], 'only UK offers are used');
  assert.equal(first.titles[0].year, 2026);
  assert.equal(first.hasMore, true);
  const detail = await tmdbDetails('tv', 1);
  assert.equal(detail.offers[0].key, 'bbc', 'opening the title still fetches confirmed offers');
  assert.equal(detail.runtime, 60);
  const next = await searchTMDB('Blue Planet again', 2);
  assert.equal(calls.length, 23, 'pagination adds one request, without repeating availability checks');
  assert.equal(next.titles[0].offers[0].key, 'bbc', 'fresh cached details remain usable');
  assert.deepEqual(next.people, []);
  const repeat = await searchTMDB('Blue Planet');
  assert.equal(calls.length, 23, 'repeating a search reuses metadata and provider caches');
  assert.equal(repeat.titles[0].offers[0].key, 'bbc');
  assert.equal(repeat.titles[1].checked, first.titles[1].checked,'cached availability retains its retrieval time');
  const authFile = require.resolve('../lib/auth/server.ts');
  let member = true;
  require.cache[authFile] = { id: authFile, filename: authFile, loaded: true,
    exports: { requireSceneMember: async () => member ? { error: null } : { error: Response.json({}, { status: 401 }) } } };
  const route = require('../app/api/search/route.ts');
  const request = page => new Request('https://scene.invalid/api/search?q=route-speed&page=' + page);
  member = false;
  assert.equal((await route.GET(request(1))).status, 401);
  member = true;
  for (const page of ['0', '501', '-1', '1.5']) assert.equal((await route.GET(request(page))).status, 400);
  const before = calls.length;
  const response = await route.GET(request(1));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.titles.length, 20);
  assert.equal(body.people.length, 1);
  assert.equal(calls.length - before, 1, 'the API route does not add a blocking people request');
  assert.ok(response.headers.get('Server-Timing'));
  const clock = Date.now, future = clock()+900001;
  Date.now = () => future; failProvider = true;
  try {
    const partial = await searchTMDB('provider outage');
    assert.equal(partial.titles.at(-1).checked,undefined,'failed availability is never presented as confirmed');
    assert.deepEqual(partial.titles.at(-1).offers,[]);
    assert.match(partial.message,/availability checks could not complete/);
  } finally { Date.now = clock; }
  console.log('PASS: bounded lightweight UK availability hydration, metadata and people retained, pagination/provider cache reuse, and full details on opening.');
})().catch(error => { console.error(error); process.exitCode = 1; });
