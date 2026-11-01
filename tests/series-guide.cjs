const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]), get = p => require(path.join(root, p));
const { normalizeSeasons } = get('lib/episodes.js');
const { seriesGuide, seriesStatus, durationLabel } = get('lib/series-guide.js');
const state = get('lib/library-state.js');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const Spoiler = get('app/components/spoiler-content.js').default;
const secret = 'The secret ending is revealed';
const protectedHtml = renderToStaticMarkup(React.createElement(Spoiler, {hidden:true,identity:'episode-1',label:'episode title'}, secret));
assert.ok(!protectedHtml.includes(secret), 'concealed text is absent from HTML and accessibility labels');
assert.ok(protectedHtml.includes('Show episode title'));
assert.ok(renderToStaticMarkup(React.createElement(Spoiler,{hidden:false,identity:'episode-1'},secret)).includes(secret));
const catalogue = normalizeSeasons({status:'Ended',episode_run_time:[45,0,-1,50,'60',Infinity,900],seasons:[
  {season_number:0,episode_count:5},{season_number:1,episode_count:3},{season_number:2,episode_count:2},
  {season_number:2,episode_count:500},
]});
const progress={tracking:true,episodes:{0:{1:true},1:{1:true,2:false,9:true},2:{1:true},99:{1:true}}};
const guide=seriesGuide(catalogue,progress);
assert.equal(guide.seasons,2);assert.equal(guide.episodeCount,5);assert.equal(guide.watched,2);
assert.equal(guide.remaining,3);assert.equal(guide.totalMinutes,250);assert.equal(guide.remainingMinutes,150);
assert.equal(durationLabel(150),'2h 30m');assert.equal(durationLabel(60),'1h');assert.equal(durationLabel(25),'25m');
assert.equal(guide.status,'Ended');assert.equal(seriesStatus('Canceled'),'Cancelled');assert.equal(seriesStatus('invented'),'Status not listed');
const missing=normalizeSeasons({seasons:[{season_number:1,episode_count:2},{season_number:2,episode_count:0}]});
assert.equal(seriesGuide(missing,progress,45).totalMinutes,null, 'incomplete counts cannot produce a whole-series total');
assert.equal(seriesGuide(missing,progress,45).remaining,null);
assert.equal(seriesGuide(normalizeSeasons({seasons:[]}),undefined,40).totalMinutes,null);
assert.equal(seriesGuide({...catalogue,typicalRuntime:null}).totalMinutes,null,'missing runtime is not zero');
assert.equal(seriesGuide({...catalogue,typicalRuntime:null},undefined,30).totalMinutes,150);
assert.equal(normalizeSeasons({episode_run_time:[],last_episode_to_air:{runtime:42}}).typicalRuntime,42);
const done={tracking:true,episodes:{1:{1:true,2:true,3:true},2:{1:true,2:true}}};
assert.equal(seriesGuide({...catalogue,typicalRuntime:null},done).remainingMinutes,0);
assert.equal(seriesGuide(catalogue,done).remaining,0);
assert.equal(seriesGuide(catalogue).hasProgress,false);
const future=normalizeSeasons({episode_run_time:[30],status:'Planned',seasons:[{season_number:1,episode_count:8,air_date:'2099-01-01'}]});
assert.equal(seriesGuide(future).totalMinutes,240, 'listed future episodes form part of the explicitly labelled estimate');
for(const value of ['true',1,null,{}])assert.equal(state.validateMutation({id:'spoiler-invalid-1234',revision:0,operations:[{type:'spoiler-free',value}]}),null);
const before=state.applyOperations(state.emptyLibrary(),[{type:'theme',value:'daylight'}]);
const changed=state.applyOperations(before,[{type:'spoiler-free',value:true}]);
assert.equal(state.projectLibrary(JSON.parse(JSON.stringify(changed))).spoilerFree,true);
assert.equal(state.projectLibrary(before).spoilerFree,false);
assert.equal(state.projectLibrary(changed).theme,'daylight');
assert.equal(state.projectLibrary(state.applyOperations(changed,[{type:'spoiler-free',value:false}])).spoilerFree,false);

let identity='member-a';const rows=new Map();
const client={from(table){const q={};const api={select(){return api},eq(k,v){q[k]=v;return api},order(){return api},
  then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)},
  async insert(row){rows.set(row.user_id,structuredClone(row));return {error:null}},
  update(payload){q.payload=payload;return api},async maybeSingle(){
    if(table!=='scene_libraries')return {data:null,error:null};
    const row=rows.get(q.user_id);if(q.payload){if(!row||row.revision!==q.revision)return {data:null,error:null};Object.assign(row,structuredClone(q.payload));return {data:{revision:row.revision},error:null};}
    return {data:row?structuredClone(row):null,error:null};}};return api;}};
get('lib/auth/server.js').requireSceneMember=async()=>identity?{error:null,client,user:{id:identity}}:{error:Response.json({},{status:401})};
const route=get('app/api/library/route.js');
const request=body=>new Request('https://scene.test/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
  let r=await route.POST(request({id:'spoiler-member-a-1',revision:0,operations:[{type:'spoiler-free',value:true}]}));
  assert.equal(r.status,200);assert.equal((await r.json()).document.preferences.spoilerFree,true);
  r=await route.POST(request({id:'spoiler-member-a-2',revision:0,operations:[{type:'theme',value:'cinema'}]}));assert.equal(r.status,409);
  const latest=await r.json();r=await route.POST(request({id:'spoiler-member-a-2',revision:latest.revision,operations:[{type:'theme',value:'cinema'}]}));assert.equal(r.status,200);
  const persisted=await r.json();assert.equal(persisted.document.preferences.spoilerFree,true);assert.equal(persisted.document.preferences.theme,'cinema');
  identity='member-b';r=await route.GET(new Request('https://scene.test/api/library'));assert.equal(state.projectLibrary((await r.json()).document).spoilerFree,false);
  identity=null;assert.equal((await route.POST(request({id:'spoiler-anon-123',revision:0,operations:[{type:'spoiler-free',value:true}]}))).status,401);
  console.log('PASS: spoiler concealment, strict preference validation, account persistence/isolation/conflicts; series status, unknown metadata, specials, progress gaps and time estimates.');
})().catch(e=>{console.error(e);process.exitCode=1;});
