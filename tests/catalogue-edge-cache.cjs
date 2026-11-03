const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { runWithCatalogueEdgeCache: run, publicCatalogueCacheKey: keyFor, withPublicCatalogueCache: cached } = require('../lib/catalogue-edge-cache.ts');
const origin = 'https://scene.example.invalid', tasks = [], records = new Map(), writes = [], reads = [];
const context = { waitUntil: promise => tasks.push(promise) };
const request = host => new Request((host || origin) + '/api/title/film', { headers: { Authorization: 'Bearer private-session', Cookie: 'private-cookie=secret' } });
const edge = {
  async match(key) { reads.push(key); return records.get(key.url)?.clone(); },
  async put(key, response) { writes.push(key); records.set(key.url, response.clone()); },
};
global.caches = { default: edge };
const flush = async () => { await Promise.all(tasks.splice(0)); };
const inRequest = (load, host) => run(request(host), context, load);
(async () => {
  for (const path of ['search/multi','search/person','search/keyword','discover/movie','account/1','authentication/session','movie/1/account_states','../account/1','https://evil.invalid/movie/1']) {
    assert.equal(await keyFor(origin, path, { query: 'private search' }), null, path);
  }
  for (const params of [{ api_key: 'server-secret' }, { query: 'private search' }, { session_id: 'private-session' }, { append_to_response: 'account_states' }, { language: 'en-GB&api_key=secret' }]) assert.equal(await keyFor(origin, 'movie/1', params), null);
  for (const host of ['http://localhost:4173','https://scene.example.workers.dev','https://terminal.local']) assert.equal(await keyFor(host, 'movie/1', {}), null);
  const first = await keyFor(origin, 'movie/1', { language: 'en-GB', append_to_response: 'credits' });
  const reordered = await keyFor(origin, 'movie/1', { append_to_response: 'credits', language: 'en-GB' });
  assert.equal(first.url, reordered.url);
  assert.equal(first.method, 'GET'); assert.equal([...first.headers].length, 0);
  assert.ok(!first.url.includes('credits') && !first.url.includes('api_key'));
  assert.notEqual(first.url, (await keyFor(origin, 'movie/1', { language: 'fr-FR', append_to_response: 'credits' })).url);
  assert.notEqual((await keyFor(origin,'watch/providers/movie',{watch_region:'GB'})).url,(await keyFor(origin,'watch/providers/movie',{watch_region:'US'})).url);
  assert.ok(await keyFor(origin,'movie/1/watch/providers',{}),'public title availability can be cached');
  assert.equal(await keyFor(origin,'movie/1/watch/providers',{api_key:'private'}),null);
  let loads = 0;
  const load = async () => { loads++; return { id: 1, title: 'Public film' }; };
  await cached('movie/1', {}, load); assert.equal(writes.length, 0, 'no request context means no shared cache');
  loads = 0;
  assert.deepEqual(await inRequest(() => cached('movie/1', {}, load)), { id: 1, title: 'Public film' });
  await flush(); assert.equal(loads, 1);
  const stored = [...records.values()][0]; assert.equal(stored.headers.get('Cache-Control'), 'public, max-age=900');
  assert.deepEqual(await inRequest(() => cached('movie/1', {}, load)), { id: 1, title: 'Public film' });
  assert.equal(loads, 1, 'another request reuses the edge entry');
  const lookupKey = await keyFor(origin,'movie/1',{});
  records.set(lookupKey.url, Response.json({ expiresAt: Date.now()-1, value: { id:1, title:'Expired' } }));
  await inRequest(() => cached('movie/1',{},load)); await flush(); assert.equal(loads,2,'expired entries refresh');
  records.set(lookupKey.url,new Response('broken json',{headers:{'Content-Type':'application/json'}}));
  await inRequest(() => cached('movie/1',{},load)); await flush(); assert.equal(loads,3,'corrupt entries refresh');
  const beforeWrites = writes.length;
  await assert.rejects(inRequest(() => cached('movie/2',{},async()=>{throw Error('upstream rejected');})),/upstream rejected/);
  await inRequest(() => cached('movie/2',{},async()=>({success:false,status_code:7}))); await flush();
  assert.equal(writes.length,beforeWrites,'upstream errors are never stored');
  for(const path of ['search/multi','discover/movie']) await inRequest(()=>cached(path,{query:'private'},load));
  await flush(); assert.equal(writes.length,beforeWrites,'searches and personalised discovery stay out of shared cache');
  global.caches={default:{match:async()=>{throw Error('cache offline')},put:async()=>{throw Error('cache offline')}}};
  assert.equal((await inRequest(()=>cached('movie/3',{},load))).title,'Public film'); await flush();
  delete global.caches; await inRequest(()=>cached('movie/4',{},load));
  global.caches={default:edge};
  await Promise.all(['https://one.example.invalid','https://two.example.invalid'].map(host=>inRequest(()=>cached('movie/5',{},async()=>{await new Promise(r=>setImmediate(r));return {id:5,host};}),host)));
  await flush();
  for(const host of ['https://one.example.invalid','https://two.example.invalid']) {
    const key=await keyFor(host,'movie/5',{});assert.equal((await records.get(key.url).json()).value.host,host,'request context must not cross hosts');
  }
  // Exercise the actual TMDB integration across two fresh module instances.
  let upstream = 0; process.env.TMDB_API_KEY = 'server-only-fixture-key';
  global.fetch=async()=>{upstream++;return Response.json({id:987654,title:'Fixture film',release_date:'2026-01-01',genres:[]});};
  const modulePath=require.resolve('../lib/tmdb.ts');
  await inRequest(()=>require(modulePath).tmdbDetails('movie',987654)); await flush();
  delete require.cache[modulePath];
  await inRequest(()=>require(modulePath).tmdbDetails('movie',987654));
  assert.equal(upstream,1,'a fresh isolate can reuse public TMDB data');
  const clock=Date.now, future=clock()+900001;
  Date.now=()=>future;
  try { await inRequest(()=>require(modulePath).tmdbDetails('movie',987654)); await flush(); }
  finally { Date.now=clock; }
  assert.equal(upstream,2,'layering memory and edge caches must not extend the freshness window');
  const { runWithFreshCatalogueData: fresh } = require('../lib/catalogue-edge-cache.ts');
  Date.now=()=>future+61000;
  try {
    const module=require(modulePath);
    const refreshed=await inRequest(()=>fresh(true,()=>module.tmdbDetails('movie',987654)));
    assert.equal(upstream,3,'manual refresh bypasses both older memory and shared edge entries');
    assert.equal(Date.parse(refreshed.checked),future+61000);
    await inRequest(()=>fresh(true,()=>module.tmdbDetails('movie',987654)));
    assert.equal(upstream,3,'repeat refreshes within a minute reuse recent upstream data');
    Date.now=()=>future+62000;
    const reused=await inRequest(()=>module.tmdbDetails('movie',987654));
    assert.equal(Date.parse(reused.checked),future+61000,'cache hits preserve the original retrieval time');
    assert.equal(upstream,3);
    assert.equal(require('../lib/catalogue-edge-cache.ts').catalogueRefreshRequested(),false,'refresh context must not leak to another request');
  } finally { Date.now=clock; }
  for(const key of [...reads,...writes]) {assert.equal(key.headers.get('Authorization'),null);assert.equal(key.headers.get('Cookie'),null);assert.ok(!key.url.includes('server-only-fixture-key'));}
  const { secureResponse }=require('../lib/http-security.ts');
  assert.equal(secureResponse(request(),Response.json({private:'account response'})).headers.get('Cache-Control'),'no-store');
  console.log('PASS: public endpoint allowlist, private/search exclusions, credential-free keys, locale/region isolation, TTL, corrupt-cache recovery, error bypass, cache outages, concurrent host isolation, TMDB reuse across fresh modules and private API no-store.');
})().catch(error=>{console.error(error);process.exitCode=1;});
