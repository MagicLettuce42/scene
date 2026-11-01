const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]), get = file => require(path.join(root, file));
const library = get('lib/library-state.js'), presets = get('lib/filter-presets.js'), filters = get('lib/catalogue-filters.js');
const id = '11111111-1111-4111-8111-111111111111';
const preset = { id, name: 'Friday night', view: 'films', provider: 'netflix', genre: 'all', sort: 'recommended', hideWatched: true, extra: { ...filters.noExtraFilters(), runtimeMax: 100 } };
for (const patch of [{ name: '' }, { name: 'x'.repeat(41) }, { view: 'gaming' }, { provider: 'unknown' }, { extra: { runtimeMax: -5 } }]) assert.equal(presets.cleanPreset({ ...preset, ...patch }), null);
let doc = library.applyOperations(library.emptyLibrary(), [{ type: 'filter-preset', id, value: preset }]);
assert.deepEqual(library.projectLibrary(JSON.parse(JSON.stringify(doc))).filterPresets, [preset], 'presets survive account payload persistence');
const original = doc; doc = library.applyOperations(doc, [{ type: 'filter-preset', id, value: null }]);
assert.equal(library.projectLibrary(doc).filterPresets.length, 0); assert.equal(doc.preferences.filterPresets[id], null);
assert.equal(library.projectLibrary(original).filterPresets.length, 1, 'mutation does not alter prior documents');
assert.equal(library.projectLibrary(library.emptyLibrary()).filterPresets.length, 0, 'separate library has no presets');
for (let n = 0; n < 12; n++) { const key = `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`; doc = library.applyOperations(doc, [{ type:'filter-preset', id:key, value:{...preset,id:key} }]); }
assert.throws(()=>library.applyOperations(doc,[{type:'filter-preset',id,value:preset}]));
assert.equal(library.validateMutation({id:'valid-operation-1234',revision:0,operations:[{type:'filter-preset',id,value:{...preset,id:'22222222-1111-4111-8111-111111111111'}}]}),null);
assert.equal(library.projectLibrary(library.emptyLibrary()).sharePerformance, false);
const metrics = get('lib/quality.js'), product = get('lib/product-feedback.js');
metrics.recordQuality('load',100);assert.deepEqual(metrics.takeQualitySamples('a'),[]);
metrics.setQualityConsent('a',true);metrics.recordQuality('search_ok',1234);assert.deepEqual(metrics.takeQualitySamples('b'),[]);
assert.deepEqual(metrics.takeQualitySamples('a'),[{metric:'search_ok',ms:1234}]);
metrics.recordQuality('load',200);metrics.setQualityConsent('b',true);assert.deepEqual(metrics.takeQualitySamples('b'),[],'account change clears pending diagnostics');
metrics.recordQuality('load',200);metrics.setQualityConsent('b',false);assert.deepEqual(metrics.takeQualitySamples('b'),[],'opt out clears queue');
assert.deepEqual(product.cleanSamples([{metric:'load',ms:100,email:'unwanted@example.invalid',query:'private'}]),[{metric:'load',ms:100}]);
assert.equal(product.cleanSamples([{metric:'private-query',ms:1}]),null);
const report=product.cleanReport({id,kind:'availability',message:'Wrong service',email:'private@example.invalid',title:{id:'tmdb-movie-1',name:'Example',kind:'movie',note:'private'},service:'netflix'});
assert.ok(report);assert.equal('email' in report,false);assert.equal('note' in report.title,false);
assert.equal(product.cleanReport({...report,message:'x'.repeat(1501)}),null);
const gaming=get('lib/gaming.js'),core=get('lib/gaming-state.js');for(const game of gaming.games)assert.equal(core.isGameId(game.id),true);
assert.equal(core.isGameId('unknown-game'),false);
const personal=get('lib/personal-recommendations.js');
const film=n=>({id:'tmdb-movie-'+n,tmdbId:n,name:'Film '+n,year:2024,kind:'movie',genres:[n%2?'Drama':'Comedy'],summary:'',poster:null,rating:5+n/10,offers:[]});
const entries=Object.fromEntries(Array.from({length:10},(_,n)=>[String(n),{title:film(n+1),liked:true}]));
assert.equal(personal.recommendationSeeds({entries,services:{},receipts:[]}).length,8);
const groups=[{seed:{title:film(100),liked:true},titles:Array.from({length:12},(_,n)=>film(n+1))}];
const adventurous=personal.combineRecommendations(groups,[],12,'adventurous');
assert.ok(adventurous.filter(p=>p.title.genres[0]==='Drama').length<=3);
const familiar=personal.combineRecommendations(groups,[],12,'familiar');assert.ok(familiar[0].title.rating>=familiar.at(-1).title.rating);
console.log('PASS: preset validation/persistence/deletion/limits; preference isolation; diagnostics opt-in, bounded payloads and privacy; feedback sanitization; gaming validation parity; varied recommendation modes.');
(async()=>{
 const auth=get('lib/auth/server.js');let member=true;auth.requireSceneMember=async()=>member?{error:null,client:{},member:{role:'member'},user:{id:'fixture'}}:{error:Response.json({},{status:401})};
 process.env.TMDB_API_KEY='fixture-only';const calls=[];
 global.fetch=async input=>{
  const u=new URL(input);calls.push(u);let data;
  if(u.pathname.endsWith('/search/multi')) {const page=Number(u.searchParams.get('page'));data={total_pages:2,results:Array.from({length:20},(_,n)=>({id:n+1+(page-1)*20,media_type:'movie'}))};}
  else if(u.pathname.endsWith('/search/person')) data={results:[],total_pages:0};
  else {const id=Number(u.pathname.split('/').at(-1));data={id,title:'Title '+id,release_date:'2024-01-01',genres:[],'watch/providers':{results:{GB:{flatrate:[{provider_name:'Netflix'}]}}}};}
  return Response.json(data);
 };
 const route=get('app/api/search/route.js'),request=page=>new Request('https://scene.invalid/api/search?q=fixture&page='+page);
 member=false;assert.equal((await route.GET(request(1))).status,401);member=true;
 for(const invalid of ['0','501','-1','1.5','word'])assert.equal((await route.GET(request(invalid))).status,400);
 let response=await route.GET(request(1)),data=await response.json();assert.equal(data.titles.length,20,'all candidates on the upstream page are retained');assert.equal(data.hasMore,true);assert.ok(response.headers.get('Server-Timing'));
 const peopleCalls=calls.filter(u=>u.pathname.endsWith('/search/person')).length;
 data=await(await route.GET(request(2))).json();assert.equal(data.page,2);assert.equal(data.hasMore,false);assert.equal(data.titles[0].tmdbId,21);
 assert.equal(calls.filter(u=>u.pathname.endsWith('/search/person')).length,peopleCalls,'title pagination never repeats people search');
 console.log('PASS: authenticated search pagination, invalid-page rejection, complete upstream pages, no repeated people requests and response timings.');
})().catch(error=>{console.error(error);process.exitCode=1;});
