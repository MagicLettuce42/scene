// Compile application modules to CommonJS in a temporary directory before running.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]);
const get=p=>require(path.join(root,p));
const state=get('lib/library-state.js'),home=get('lib/home-preferences.js'),filters=get('lib/catalogue-filters.js');
const personal=get('lib/personal-recommendations.js'),calendar=get('lib/episode-calendar.js'),loading=get('lib/browse-loading.js');
const title=(id,fields={})=>({id:'tmdb-movie-'+id,tmdbId:id,name:'Film '+id,kind:'movie',year:2021,genres:['Drama'],summary:'',poster:null,runtime:90,originalLanguage:'en',rating:8,voteCount:300,offers:[{key:'netflix',name:'Netflix',type:'sub',url:'https://example.com'}],...fields});
const first=title(101),second=title(102),third=title(103),series=title(104,{id:'tmdb-tv-104',kind:'series'});
const valid=operations=>state.validateMutation({revision:0,id:'valid-test-mutation',operations});
const initial=state.applyOperations(state.emptyLibrary(),[{type:'theme',value:'yellow'},{type:'service',key:'netflix',value:true},{type:'title',title:first,fields:{saved:true,liked:true}},{type:'episode',title:series,season:1,episodes:[1],value:true}]);
const settings={startView:'films',density:'comfortable',sections:[...home.defaultHome().sections].reverse(),hidden:['tonight']};
const changed=state.applyOperations(initial,[{type:'home',fields:settings},{type:'review',title:first,fields:{rating:5,note:'A private note <script>hello</script>'}}]);
const projected=state.projectLibrary(changed);assert.deepEqual(projected.home,settings);assert.equal(projected.theme,'yellow');assert.equal(projected.tracking.length,1);assert.equal(projected.saved.length,1);assert.equal(projected.reviews[0].rating,5);
assert.equal(initial.preferences.home,undefined,'source document stays immutable');
const merged=state.applyOperations(changed,[{type:'home',fields:{density:'compact'}},{type:'review',title:first,fields:{note:'Edited on another device'}}]);
assert.equal(state.projectLibrary(merged).home.startView,'films');assert.equal(state.projectLibrary(merged).reviews[0].rating,5);
const cleared=state.applyOperations(merged,[{type:'review',title:first,fields:{rating:null,note:''}}]);assert.equal(state.projectLibrary(cleared).reviews.length,0);assert.equal(state.projectLibrary(cleared).saved.length,1);
for(const op of [{type:'review',title:first,fields:{rating:0}},{type:'review',title:first,fields:{rating:6}},{type:'review',title:first,fields:{rating:4.5}},{type:'review',title:first,fields:{note:'x'.repeat(2001)}},{type:'review',title:first,fields:{private:false}},{type:'home',fields:{startView:'admin'}},{type:'home',fields:{sections:['personal','personal']}},{type:'home',fields:{hidden:['unknown']}},{type:'home',fields:{density:'huge'}}])assert.equal(valid([op]),null,'invalid personal update rejected');
assert.ok(valid([{type:'home',fields:settings},{type:'review',title:first,fields:{rating:5,note:'Fine'}}]));
const doc=state.applyOperations(changed,[{type:'review',title:second,fields:{rating:4}},{type:'title',title:third,fields:{liked:true,hidden:true}},{type:'review',title:series,fields:{rating:1}}]);
const seeds=personal.recommendationSeeds(doc);assert.deepEqual(seeds.map(e=>e.title.tmdbId),[101,102]);
const fresh=title(201),fresh2=title(202),watched=title(203),hidden=title(204),saved=title(205);
const entries=[...Object.values(doc.entries),{title:watched,watched:true},{title:hidden,hidden:true},{title:saved,saved:true}];
const picks=personal.combineRecommendations([{seed:seeds[0],titles:[first,watched,fresh,hidden,fresh2]},{seed:seeds[1],titles:[saved,fresh2,fresh]}],entries);
assert.deepEqual(picks.map(p=>p.title.tmdbId),[202,201]);assert.match(picks[0].reason,/rated Film 102 4\/5/);assert.equal(new Set(picks.map(p=>p.title.id)).size,picks.length);
const extra=filters.parseExtraFilters(new URLSearchParams({runtimeMax:'100',yearFrom:'2020',yearTo:'2024',minRating:'7',language:'en'}));assert.ok(extra);
assert.ok(filters.matchesExtra(first,extra));for(const t of [title(1,{runtime:101}),title(1,{year:2019}),title(1,{year:null}),title(1,{rating:6.9}),title(1,{voteCount:49}),title(1,{originalLanguage:'fr'})])assert.equal(filters.matchesExtra(t,extra),false);
assert.ok(filters.matchesExtra({...first,kind:'series',runtime:120},extra),'film length does not hide TV in mixed results');
assert.equal(filters.parseExtraFilters(new URLSearchParams({yearFrom:'2025',yearTo:'2020'})),null);assert.equal(filters.parseExtraFilters(new URLSearchParams({minRating:'NaN'})),null);
assert.equal(calendar.londonDate(new Date('2026-07-01T23:30:00Z')),'2026-07-02');assert.equal(calendar.weekStart('2026-10-18'),'2026-10-12');assert.equal(calendar.addDays('2026-10-25',1),'2026-10-26');assert.equal(calendar.validCalendarDate('2026-02-30'),false);
const seasons=[{number:0,airDate:'2026-10-12'},{number:1,airDate:'2024-01-01'},{number:2,airDate:'2026-10-01'},{number:3,airDate:'2026-10-15'},{number:4,airDate:'2027-01-01'}];
assert.deepEqual(calendar.calendarSeasons(seasons,'2026-10-12','2026-10-18').seasons.map(s=>s.number),[2,3]);

let identity='alice';const rows=new Map(),auth=get('lib/auth/server.js');
const client={from(){const q={};const api={select(){return api},eq(k,v){q[k]=v;return api},async insert(row){if(rows.has(row.user_id))return {error:{code:'23505'}};rows.set(row.user_id,structuredClone(row));return {error:null}},update(payload){q.payload=payload;return api},async maybeSingle(){const row=rows.get(q.user_id);if(q.payload){if(!row||row.revision!==q.revision)return {data:null,error:null};Object.assign(row,structuredClone(q.payload));return {data:{revision:row.revision},error:null};}return {data:row?structuredClone(row):null,error:null}}};return api}};
auth.requireSceneMember=async()=>identity?{error:null,client,user:{id:identity}}:{error:Response.json({error:'Sign in'},{status:401})};
const library=get('app/api/library/route.js'),forYou=get('app/api/for-you/route.js'),browse=get('app/api/browse/route.js'),dates=get('app/api/title/[id]/calendar/route.js');
const request=(url,body)=>new Request('https://scene.test'+url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
async function save(id,revision,operations){const r=await library.POST(request('/api/library',{id,revision,operations}));return {status:r.status,body:await r.json()};}

(async()=>{
 const seen=[],updates=[];
 await loading.loadBrowseBatches({page:1,append:false,key:'kind=movie',signal:new AbortController().signal,force:false,onAttempt:p=>seen.push(p),onPage:(data,append)=>updates.push({data,append}),request:async url=>({titles:Array.from({length:20},(_,i)=>title((url.endsWith('=1')?100:120)+i)),page:url.endsWith('=1')?1:2,hasMore:true,capped:false,genres:[],message:null})});
 assert.deepEqual(seen,[1,2]);assert.deepEqual(updates.map(u=>u.append),[false,true]);assert.equal(loading.mergeBrowseTitles(updates[0].data.titles,updates[1].data.titles).length,40);
 let pageOne=false;await assert.rejects(loading.loadBrowseBatches({page:1,append:false,key:'kind=movie',signal:new AbortController().signal,force:false,onAttempt:()=>{},onPage:()=>pageOne=true,request:async url=>{if(url.endsWith('=2'))throw Error('Temporary issue');return {titles:[first],hasMore:true};}}));assert.ok(pageOne,'first page is shown even when page two fails');
 const controller=new AbortController();let requests=0;await loading.loadBrowseBatches({page:1,append:false,key:'kind=movie',signal:controller.signal,force:false,onAttempt:()=>{},onPage:()=>controller.abort(),request:async()=>{requests++;return {titles:[first],hasMore:true};}});assert.equal(requests,1,'tab changes cancel further loading');
 console.log('PASS: 40-title progressive default, partial failure and cancellation.');

 const a=await save('personal-settings-a',0,[{type:'home',fields:settings},{type:'review',title:first,fields:{rating:5,note:'Private to Alice'}},{type:'service',key:'netflix',value:true}]);assert.equal(a.status,200);
 const b=await save('personal-note-edit',1,[{type:'review',title:first,fields:{note:'New private note'}}]);assert.equal(b.status,200);
 const conflict=await save('personal-rate-edit',1,[{type:'review',title:first,fields:{rating:4}}]);assert.equal(conflict.status,409);
 const rebased=await save('personal-rate-edit',conflict.body.revision,[{type:'review',title:first,fields:{rating:4}}]);assert.equal(rebased.status,200);assert.equal(state.projectLibrary(rebased.body.document).reviews[0].note,'New private note');
 const retry=await save('personal-rate-edit',0,[{type:'review',title:first,fields:{rating:4}}]);assert.equal(retry.body.revision,3);
 identity='bob';const other=await library.GET(request('/api/library'));assert.equal(state.projectLibrary((await other.json()).document).reviews.length,0);assert.equal(state.projectLibrary(state.emptyLibrary()).home.density,'compact');
 identity=null;assert.equal((await forYou.GET(request('/api/for-you?services=netflix'))).status,401);assert.equal((await dates.GET(request('/api/title/tmdb-tv-104/calendar?from=2026-10-12'),{params:Promise.resolve({id:'tmdb-tv-104'})})).status,401);identity='alice';
 assert.equal((await forYou.GET(request('/api/for-you?services=netflix&language=invalid'))).status,400);
 assert.equal((await dates.GET(request('/api/title/tmdb-tv-104/calendar?from=2026-02-30'),{params:Promise.resolve({id:'tmdb-tv-104'})})).status,400);
 console.log('PASS: private ratings, notes, account preferences, conflict rebase and API validation.');

 const called=[];process.env.TMDB_API_KEY='fixture-only';
 global.fetch=async input=>{const u=new URL(input),p=u.pathname.slice(2);called.push(u);
  if(p.startsWith('/genre/'))return Response.json({genres:[{id:18,name:'Drama'}]});
  if(p.startsWith('/watch/providers/'))return Response.json({results:[{provider_id:8,provider_name:'Netflix'},{provider_id:9,provider_name:'Amazon Prime Video'}]});
  if(p.startsWith('/discover/'))return Response.json({page:1,total_pages:2,results:[{id:301},{id:302},{id:303},{id:304}]});
  if(p.endsWith('/recommendations'))return Response.json({results:[{id:301},{id:302},{id:303},{id:101}]});
  if(p==='/tv/104')return Response.json({seasons:[{season_number:1,episode_count:2,air_date:'2026-10-12'}]});
  if(p==='/tv/104/season/1')return Response.json({episodes:[{episode_number:1,name:'One',air_date:'2026-10-12'},{episode_number:2,name:'Two',air_date:'2026-10-19'}]});
  if(/^\/movie\/\d+$/.test(p)){const id=Number(p.split('/').pop());return Response.json({id,title:'Film '+id,release_date:'2021-01-01',runtime:90,vote_average:8,vote_count:300,original_language:'en',genres:[{name:'Drama'}],'watch/providers':{results:{GB:{link:'https://example.com/watch',...(id===302?{free:[{provider_id:8,provider_name:'Netflix'}]}:id===303?{rent:[{provider_id:8,provider_name:'Netflix'}],flatrate:[{provider_id:9,provider_name:'Amazon Prime Video'}]}:{flatrate:[{provider_id:8,provider_name:'Netflix'}]})}}}});}
  throw Error('Unexpected fixture request '+p);
 };
 const rb=await browse.GET(request('/api/browse?kind=movie&services=netflix&mine=1&offer=all&sort=rating&runtimeMax=100&yearFrom=2020&yearTo=2024&minRating=7&language=en'));
 assert.equal(rb.status,200);const body=await rb.json();assert.deepEqual(body.titles.map(t=>t.tmdbId),[301,302,304],'subscription and free match; rental plus other-provider subscription does not');
 const discovery=called.find(u=>u.pathname.endsWith('/discover/movie')).searchParams;for(const [k,v] of Object.entries({'with_runtime.lte':'100','primary_release_date.gte':'2020-01-01','primary_release_date.lte':'2024-12-31','vote_average.gte':'7','vote_count.gte':'200','with_original_language':'en','with_watch_monetization_types':'flatrate|free|ads'}))assert.equal(discovery.get(k),v,k);
 const rp=await forYou.GET(request('/api/for-you?services=netflix&offer=all'));assert.equal(rp.status,200);assert.equal(rp.headers.get('Cache-Control'),'no-store');const personalBody=await rp.json();assert.deepEqual(personalBody.picks.map(p=>p.title.tmdbId),[301,302]);assert.match(personalBody.picks[0].reason,/rated Film 101 4\/5/);assert.ok(!JSON.stringify(personalBody).includes('private note'));
 identity='bob';const emptyResponse=await forYou.GET(request('/api/for-you?services=netflix&offer=all'));assert.equal((await emptyResponse.json()).seedCount,0);identity='alice';
 const rd=await dates.GET(request('/api/title/tmdb-tv-104/calendar?from=2026-10-12'),{params:Promise.resolve({id:'tmdb-tv-104'})});assert.equal(rd.status,200);assert.deepEqual((await rd.json()).episodes.map(e=>e.number),[1]);
 assert.ok(called.every(u=>u.hostname==='api.themoviedb.org'),'new features never spend Watchmode credits');
 console.log('PASS: TMDB query mapping, merged offers, service isolation, recommendation reasons and calendar week bounds.');

 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Review=get('app/components/personal-review.js').default,Settings=get('app/components/home-settings.js').default;
 const markup=renderToStaticMarkup(React.createElement(Review,{title:first,rating:4,note:'<script>alert(1)</script>',onChange:()=>{}}));assert.ok(!markup.includes('<script>'));assert.ok(markup.includes('&lt;script&gt;'));assert.ok(markup.includes('Rate 4 out of 5'));assert.ok(markup.includes('database administrators'));
 const settingsHtml=renderToStaticMarkup(React.createElement(Settings,{value:settings,onChange:()=>{}}));assert.ok(settingsHtml.includes('Move For you up'));assert.ok(settingsHtml.includes('Starting tab'));
 console.log('PASS: accessible rating controls, settings structure and escaped private notes (server rendering; not browser QA).');
 console.log('Personalisation checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
