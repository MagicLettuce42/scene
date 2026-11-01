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
  throw Error('Unexpected upstream request: ' + url.pathname);
};
(async () => {
  const { searchTMDB, tmdbDetails } = require('../lib/tmdb.ts');
  const first = await searchTMDB('Blue Planet');
  assert.equal(calls.length, 1, 'twenty title matches and people require only one upstream request');
  assert.equal(first.titles.length, 20);
  assert.equal(first.people.length, 1);
  assert.equal(first.people[0].name, 'Fictional actor');
  assert.deepEqual(first.titles[0].genres, ['Documentary']);
  assert.equal(first.titles[0].checked, undefined, 'search must not claim offers were checked');
  assert.deepEqual(first.titles[0].offers, []);
  assert.equal(first.titles[0].year, 2026);
  assert.equal(first.hasMore, true);
  const detail = await tmdbDetails('tv', 1);
  assert.equal(detail.offers[0].key, 'bbc', 'opening the title still fetches confirmed offers');
  assert.equal(detail.runtime, 60);
  const next = await searchTMDB('Blue Planet again', 2);
  assert.equal(calls.length, 3, 'pagination adds one request, without repeating detail checks');
  assert.equal(next.titles[0].offers[0].key, 'bbc', 'fresh cached details remain usable');
  assert.deepEqual(next.people, []);
  const repeat = await searchTMDB('Blue Planet');
  assert.equal(calls.length, 3, 'repeating a search reuses the upstream cache');
  assert.equal(repeat.titles[0].offers[0].key, 'bbc');
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
  console.log('PASS: one upstream request for 20 search titles plus people; genre/year/rating metadata retained, no invented availability, pagination/cache reuse, and full offers on opening.');
})().catch(error => { console.error(error); process.exitCode = 1; });
