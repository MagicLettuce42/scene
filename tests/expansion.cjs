// Run after compiling the listed modules to a temporary CommonJS directory.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(process.argv[2]||'/tmp/scene-expansion-tests');
const lib=require(path.join(root,'lib/library-state.js'));
const episodes=require(path.join(root,'lib/episodes.js'));
const shared=require(path.join(root,'lib/shared-lists.js'));
const auth=require(path.join(root,'lib/auth/server.js'));
const movie={id:'tmdb-movie-157336',tmdbId:157336,name:'Interstellar',kind:'movie',year:2014,genres:[],summary:'',poster:null,runtime:169,rating:null,offers:[]};
const series={...movie,id:'tmdb-tv-1399',tmdbId:1399,name:'A series',kind:'series'};
const empty=lib.emptyLibrary();
const applied=lib.applyOperations(empty,[{type:'service',key:'netflix',value:true},{type:'theme',value:'yellow'},{type:'onboard',value:true},{type:'title',title:movie,fields:{saved:true}},{type:'episode',title:series,season:1,episodes:[1,3],value:true}]);
assert.equal(lib.projectLibrary(applied).onboarded,true);assert.equal(lib.projectLibrary(applied).theme,'yellow');assert.equal(lib.projectLibrary(applied).saved.length,1);assert.equal(lib.projectLibrary(applied).tracking.length,1);
assert.deepEqual(empty,lib.emptyLibrary(),'operations do not mutate the source');
const paused=lib.applyOperations(applied,[{type:'tracking',title:series,value:false}]);assert.equal(lib.projectLibrary(paused).tracking.length,0);assert.equal(lib.projectLibrary(paused).progressEntries[0].progress.episodes['1']['3'],true);
const resumed=lib.applyOperations(paused,[{type:'tracking',title:series,value:true},{type:'episode',title:series,season:1,episodes:[1],value:false},{type:'service',key:'netflix',value:false}]);
assert.equal(lib.projectLibrary(resumed).progressEntries[0].progress.episodes['1']['1'],false);assert.equal(lib.projectLibrary(resumed).theme,'yellow');assert.equal(lib.projectLibrary(resumed).saved.length,1);
const mutation=operation=>lib.validateMutation({revision:0,id:'valid-test-id-123',operations:[operation]});
for(const op of [{type:'onboard',value:false},{type:'episode',title:movie,season:1,episodes:[1],value:true},{type:'episode',title:series,season:-1,episodes:[1],value:true},{type:'episode',title:series,season:1,episodes:[0],value:true},{type:'episode',title:series,season:1,episodes:['1'],value:true},{type:'episode',title:series,season:1,episodes:Array(251).fill(1),value:true},{type:'tracking',title:{...series,tmdbId:null},value:true}])assert.equal(mutation(op),null,'bad progress update rejected');
const seasonData=episodes.normalizeSeasons({status:'Returning Series',seasons:[{season_number:2,name:'Season 2',episode_count:2},{season_number:1,name:'Season 1',episode_count:3},{season_number:0,name:'Specials',episode_count:1},{season_number:2,episode_count:99},{season_number:-1,episode_count:2}]});
assert.deepEqual(seasonData.seasons.map(s=>s.number),[0,1,2]);
const actual=episodes.normalizeEpisodes({episodes:[{episode_number:1,name:'One',air_date:'2020-01-01'},{episode_number:2,name:'Two',air_date:'2020-01-02'},{episode_number:3,name:'Three',air_date:'2999-01-01'},{episode_number:2,name:'Duplicate'},{episode_number:0,name:'Bad'}]});
assert.equal(actual.length,3);assert.equal(episodes.episodeReleased(actual[2],'2026-10-18'),false);
let progress=lib.projectLibrary(applied).tracking[0].progress;
assert.equal(episodes.nextEpisode(actual,1,progress).number,2,'next up finds an earlier gap');
assert.equal(episodes.firstIncompleteSeason(seasonData.seasons,progress).number,1,'specials do not obstruct next up');
progress={tracking:true,episodes:{1:{1:true,2:true,3:true}}};assert.equal(episodes.firstIncompleteSeason(seasonData.seasons,progress).number,2,'cross-season next up');
assert.equal(shared.rankSharedItems([{votes:1,title:{name:'Z'}},{votes:3,title:{name:'B'}},{votes:3,title:{name:'A'}}])[0].title.name,'A');
assert.ok(shared.validUuid(shared.newId()));

let identity='alice';const rows=new Map();let rpcCalls=[];
const snapshotReads=[];
const client={from(table){
 if(table!=='scene_libraries'){
  assert.ok(['scene_watchlist_snapshots','scene_releases','scene_release_status'].includes(table),'known read table');
  const query={select(){return query},eq(key,value){if(table==='scene_watchlist_snapshots'){assert.equal(key,'user_id');assert.equal(value,identity);snapshotReads.push(value);}return query},gte(){return query},order(){return query},limit(){return query},async maybeSingle(){return {data:null,error:null}},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};
  return query;
 }
 assert.equal(table,'scene_libraries');const q={filters:{},payload:null};const api={select(){return api},eq(k,v){q.filters[k]=v;return api},async insert(row){if(rows.has(row.user_id))return {error:{code:'23505'}};rows.set(row.user_id,structuredClone(row));return {error:null}},update(payload){q.payload=payload;return api},async maybeSingle(){const row=rows.get(q.filters.user_id);if(q.payload){if(!row||row.revision!==q.filters.revision)return {data:null,error:null};Object.assign(row,structuredClone(q.payload));return {data:{revision:row.revision},error:null};}return {data:row?structuredClone(row):null,error:null}}};return api},async rpc(name,args){rpcCalls.push({identity,name,args});return {data:{ok:true,id:args.p_data.id||args.p_data.listId},error:null}}};
auth.requireSceneMember=async()=>identity?{error:null,client,user:{id:identity},member:{active:true}}:{error:Response.json({error:'Sign in'},{status:401}),client:null,user:null,member:null};
const route=require(path.join(root,'app/api/library/route.js'));
const social=require(path.join(root,'app/api/shared/route.js'));
const episodeRoute=require(path.join(root,'app/api/title/[id]/episodes/route.js'));
const post=(endpoint,body)=>new Request('https://scene.test'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function save(id,revision,operations){const response=await route.POST(post('/api/library',{id,revision,operations}));return {status:response.status,body:await response.json()};}
(async()=>{
 const a=await save('onboard-alice-001',0,[{type:'service',key:'netflix',value:true},{type:'theme',value:'yellow'},{type:'seasonal',value:false},{type:'onboard',value:true},{type:'title',title:movie,fields:{saved:true}}]);assert.equal(a.status,200);assert.equal(a.body.document.preferences.seasonal,false,'seasonal preference saves through the account API');
 const b=await save('episode-device-1',1,[{type:'episode',title:series,season:1,episodes:[1],value:true}]);assert.equal(b.status,200);
 const stale=await save('episode-device-2',1,[{type:'episode',title:series,season:1,episodes:[2],value:true}]);assert.equal(stale.status,409);
 const rebase=await save('episode-device-2',stale.body.revision,[{type:'episode',title:series,season:1,episodes:[2],value:true}]);assert.equal(rebase.status,200);
 assert.deepEqual(lib.projectLibrary(rebase.body.document).tracking[0].progress.episodes['1'],{1:true,2:true});assert.equal(lib.projectLibrary(rebase.body.document).saved.length,1);assert.equal(lib.projectLibrary(rebase.body.document).theme,'yellow');
 const retry=await save('episode-device-2',0,[{type:'episode',title:series,season:1,episodes:[2],value:true}]);assert.equal(retry.status,200);assert.equal(retry.body.revision,3,'retry is idempotent');
 identity='bob';const bob=await route.GET(new Request('https://scene.test/api/library'));assert.equal(lib.projectLibrary((await bob.json()).document).tracking.length,0);
 await save('onboard-bob-0001',0,[{type:'service',key:'disney',value:true},{type:'theme',value:'daylight'},{type:'onboard',value:true}]);identity='alice';const restored=await route.GET(new Request('https://scene.test/api/library'));const restoredState=lib.projectLibrary((await restored.json()).document);assert.equal(restoredState.theme,'yellow');assert.equal(restoredState.onboarded,true);assert.equal(restoredState.tracking[0].progress.episodes['1']['2'],true);
 assert.ok(snapshotReads.includes('alice')&&snapshotReads.includes('bob'),'snapshot reads follow the active account');
 assert.equal(restoredState.seasonal,false,'seasonal opt-out survives other mutations and account changes');
 identity=null;assert.equal((await route.POST(post('/api/library',{}))).status,401);assert.equal((await social.GET(new Request('https://scene.test/api/shared'))).status,401);assert.equal((await episodeRoute.GET(new Request('https://scene.test/api/title/tmdb-tv-1399/episodes'),{params:Promise.resolve({id:'tmdb-tv-1399'})})).status,401);
 identity='alice';const id=shared.newId();assert.equal((await social.POST(post('/api/shared',{action:'vote',listId:id,key:'bad',value:true}))).status,400);assert.equal(rpcCalls.length,0);
 assert.equal((await social.POST(post('/api/shared',{action:'create',id,name:'Film night'}))).status,200);assert.equal(rpcCalls[0].identity,'alice');assert.equal(rpcCalls[0].args.p_action,'create');
 const invitation=await social.POST(post('/api/shared',{action:'invite',listId:id,email:'friend@example.invalid'}));assert.equal(invitation.status,200);const invitationBody=await invitation.json();const invitationURL=new URL(invitationBody.url);assert.equal(invitationURL.search,'');assert.match(invitationURL.hash,/^#shared=[a-f\d]{64}$/);assert.match(rpcCalls.at(-1).args.p_data.hash,/^[a-f\d]{64}$/);assert.notEqual(rpcCalls.at(-1).args.p_data.hash,invitationURL.hash.slice(8));
 assert.equal((await social.POST(post('/api/shared',{action:'join',token:'bad'}))).status,400);
 const fetched=[];process.env.TMDB_API_KEY='server-only-test-key';global.fetch=async url=>{fetched.push(String(url));return Response.json(String(url).includes('/season/1')?{episodes:[{episode_number:1,name:'Opening',air_date:'2020-01-01'}]}:{status:'Returning Series',seasons:[{season_number:1,name:'Season 1',episode_count:1}]});};
 const bad=await episodeRoute.GET(new Request('https://scene.test/api/title/tmdb-tv-1399/episodes?season=-1'),{params:Promise.resolve({id:'tmdb-tv-1399'})});assert.equal(bad.status,400);assert.equal(fetched.length,0);
 const good=await episodeRoute.GET(new Request('https://scene.test/api/title/tmdb-tv-1399/episodes?season=1'),{params:Promise.resolve({id:'tmdb-tv-1399'})});assert.equal(good.status,200);const data=await good.json();assert.equal(data.episodes[0].name,'Opening');assert.ok(!JSON.stringify(data).includes('server-only-test-key'));assert.equal(fetched.length,2);assert.ok(fetched.every(url=>url.startsWith('https://api.themoviedb.org/3/tv/1399')));
 const manifest=require(path.join(root,'lib/app-manifest.js')).appManifest(new Date('2026-09-01T12:00:00Z'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');for(const icon of manifest.icons){const png=fs.readFileSync(path.resolve('public'+new URL(icon.src,'https://scene.test').pathname));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}assert.ok(fs.existsSync('public/icons/apple-touch-icon.png'));
 console.log('PASS: welcome preferences; separate accounts; cross-device conflict rebase; episode reversals, gaps and next seasons; idempotent retries; shared request validation; hashed invitation links; authenticated TMDB season adapter; Home Screen assets.');
})().catch(e=>{console.error(e);process.exitCode=1});
