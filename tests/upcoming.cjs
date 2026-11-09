// Compile the application to a temporary CommonJS directory before running.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]),get=p=>require(path.join(root,p));
const upcoming=get('lib/upcoming.js'),calendar=get('lib/episode-calendar.js'),state=get('lib/library-state.js');
const query=(params,now=new Date('2026-10-24T23:30:00Z'))=>upcoming.parseUpcomingQuery(new URLSearchParams(params),now);
assert.deepEqual(query({days:'7'}),{kind:'movie',format:'all',days:7,page:1,from:'2026-10-25',to:'2026-10-31'});
assert.equal(query({days:'30'},new Date('2026-12-20T12:00:00Z')).to,'2027-01-18');
for(const p of [{kind:'person'},{format:'physical'},{days:'365'},{page:'0'},{page:'501'},{page:'1.5'}])assert.equal(query(p),null);
const gb=rows=>({release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2026-10-25T00:00:00Z'}]},{iso_3166_1:'GB',release_dates:rows}]}});
const source=gb([{type:1,release_date:'2026-10-25T00:00:00Z'},{type:3,release_date:'2026-10-26T00:00:00Z'},{type:4,release_date:'2026-10-28T00:00:00Z'},{type:5,release_date:'2026-10-25T00:00:00Z'}]);
assert.deepEqual(upcoming.selectUpcomingRelease(source,'movie','2026-10-25','2026-10-31'),{date:'2026-10-26',kind:'cinema',region:'GB'});
assert.equal(upcoming.selectUpcomingRelease(source,'movie','2026-10-25','2026-10-31','digital').date,'2026-10-28');
assert.equal(upcoming.selectUpcomingRelease(source,'movie','2026-10-27','2026-10-31','cinema'),undefined);
assert.equal(upcoming.selectUpcomingRelease({release_date:'2026-10-26'},'movie','2026-10-25'),undefined,'never substitute worldwide date for missing UK date');
assert.equal(upcoming.selectUpcomingRelease(gb([{type:3,release_date:'2026-02-30'}]),'movie','2026-01-01'),undefined);
assert.equal(upcoming.selectUpcomingRelease({first_air_date:'2024-01-01',next_episode_to_air:{air_date:'2026-10-25'}},'tv','2026-10-25'),undefined,'returning episodes are not new series premieres');
assert.equal(upcoming.selectUpcomingRelease({first_air_date:'2026-10-25'},'tv','2026-10-25').region,'original');
for(const value of [{date:'2026-02-30',kind:'cinema',region:'GB'},{date:'2026-10-25',kind:'cinema',region:'CA'},{date:'2026-10-25',kind:'series',region:'GB'}])assert.equal(upcoming.cleanUpcomingRelease(value),undefined);
const release={date:'2099-10-25',kind:'digital',region:'GB'};
const title={id:'tmdb-movie-5',tmdbId:5,name:'Upcoming film',kind:'movie',year:2099,genres:[],summary:'',poster:null,offers:[],upcomingRelease:release};
const mutation=state.validateMutation({id:'upcoming-save-test',revision:0,operations:[{type:'title',title,fields:{saved:true}}]});
assert.ok(mutation);const saved=state.projectLibrary(state.applyOperations(state.emptyLibrary(),mutation.mutation.operations)).saved;
assert.deepEqual(saved[0].upcomingRelease,release,'announced date survives validated account save');
assert.equal(state.cleanTitle({...title,kind:'series'}).upcomingRelease,undefined,'wrong media release metadata is removed');
assert.ok(get('lib/home-preferences.js').validHomePatch({startView:'upcoming'}));
const storage=new Map();global.sessionStorage={getItem:k=>storage.get(k)||null};
const tabs=get('lib/tab-memory.js');storage.set(tabs.tabMemoryKey('alice'),JSON.stringify({view:'upcoming',tabs:{upcoming:{upcoming:{kind:'tv',format:'all',days:90},genre:'all',offer:'all',sort:'recommended',query:'',submitted:'',results:[],scroll:50}}}));
assert.equal(tabs.readTabs('alice').tabs.upcoming.upcoming.days,90);
assert.equal(tabs.readTabs('alice').tabs.upcoming.upcoming.kind,'movie','legacy premiere filters restore to the film-only cinema view');
assert.equal(upcoming.cleanUpcomingFilters({section:'services',serviceKind:'tv'}).serviceKind,'tv','streaming retains its TV series filter');assert.equal(tabs.readTabs('bob').restored,false);

let member=false,calls=[];const auth=get('lib/auth/server.js');
auth.requireSceneMember=async()=>member?{error:null,user:{id:'member'}}:{error:Response.json({error:'Sign in'},{status:401})};
const api=get('app/api/upcoming/route.js'),details=get('app/api/title/[id]/route.js');
const request=params=>new Request('https://scene.test/api/upcoming?'+new URLSearchParams(params));
const today=calendar.londonDate(),date=offset=>calendar.addDays(today,offset);
process.env.TMDB_API_KEY='fixture-only';
global.fetch=async input=>{
 const url=new URL(input);calls.push(url);const p=url.pathname;
 if(p==='/3/discover/movie'){
  const page=Number(url.searchParams.get('page'));
  return Response.json({total_pages:3,results:(page===1?[1,2,3,4,5,6,7,8,1]:page===2?[9,1]:[8]).map(id=>({id,adult:id===7}))});
 }
 if(p==='/3/discover/tv')return Response.json({total_pages:1,results:[{id:101},{id:102},{id:103}]});
 if(p.startsWith('/3/tv/')){const id=Number(p.split('/').pop());return Response.json({id,name:'Series '+id,first_air_date:id===101?date(2):id===102?date(-100):null,next_episode_to_air:{air_date:date(3)}});}
 if(p.startsWith('/3/movie/')){
  const id=Number(p.split('/').pop());if(id===8)return new Response('Unavailable',{status:503});
  const rows=id===1?[{type:3,release_date:date(0)}]:id===2?[{type:3,release_date:date(30)}]:id===4?[{type:3,release_date:date(-1)}]:id===5?[{type:3,release_date:date(1)},{type:4,release_date:date(5)}]:id===6?[{type:5,release_date:date(2)}]:id===9?[{type:4,release_date:date(3)}]:[];
  return Response.json({id,title:'Film '+id,release_date:date(1),...gb(rows)});
 }
 throw Error('Unexpected fixture request');
};
(async()=>{
 assert.equal((await api.GET(request({kind:'bad'}))).status,401);assert.equal(calls.length,0,'authentication precedes upstream calls');member=true;
 assert.equal((await api.GET(request({days:'365'}))).status,400);assert.equal(calls.length,0);
 const response=await api.GET(request({kind:'movie',days:'7'})),body=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, max-age=300');
 assert.deepEqual(body.titles.map(t=>t.tmdbId),[1,5]);assert.equal(body.hasMore,true);assert.match(body.message,/could not load/);
 const movieParams=calls.find(u=>u.pathname==='/3/discover/movie').searchParams;
 for(const [key,value] of Object.entries({region:'GB',with_release_type:'2|3|4','release_date.gte':today,'release_date.lte':date(6),sort_by:'popularity.desc'}))assert.equal(movieParams.get(key),value);
 assert.equal(movieParams.has('with_watch_providers'),false,'unannounced providers do not hide future releases');
 assert.ok(!calls.some(u=>u.pathname==='/3/movie/7'),'adult rows excluded before detail calls');
 const digital=await (await api.GET(request({kind:'movie',days:'7',format:'digital'}))).json();assert.deepEqual(digital.titles.map(t=>t.tmdbId),[5]);assert.equal(digital.titles[0].upcomingRelease.date,date(5));
 const second=await (await api.GET(request({kind:'movie',days:'7',page:'2'}))).json();assert.equal(second.page,2);assert.deepEqual(second.titles.map(t=>t.tmdbId),[9,1]);
 const failure=await api.GET(request({kind:'movie',days:'7',page:'3'}));assert.equal(failure.status,503);assert.ok(!JSON.stringify(await failure.json()).includes('fixture-only'));
 const tv=await (await api.GET(request({kind:'tv',days:'7'}))).json();assert.deepEqual(tv.titles.map(t=>t.tmdbId),[101]);assert.equal(tv.titles[0].upcomingRelease.region,'original');
 const tvParams=calls.find(u=>u.pathname==='/3/discover/tv').searchParams;assert.equal(tvParams.get('first_air_date.gte'),today);assert.equal(tvParams.has('air_date.gte'),false);
 const refreshed=await details.GET(new Request('https://scene.test/api/title/tmdb-movie-5?releaseFormat=digital'),{params:Promise.resolve({id:'tmdb-movie-5'})});
 assert.equal((await refreshed.json()).title.upcomingRelease.date,date(5),'detail refresh retains selected digital release type');
 delete process.env.TMDB_API_KEY;assert.equal((await api.GET(request({}))).status,503);
 assert.ok(calls.every(u=>u.hostname==='api.themoviedb.org'),'no Watchmode calls');
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Badge=get('app/components/release-badge.js').default,{TitleCard}=get('app/components/catalogue-cards.js');
 const badge=renderToStaticMarkup(React.createElement(Badge,{release,detail:true}));assert.match(badge,/dateTime="2099-10-25"/);assert.match(badge,/UK digital/);assert.match(badge,/Subscription availability is not confirmed/);
 assert.equal(renderToStaticMarkup(React.createElement(Badge,{release:{...release,date:'2001-01-01'}})),'','expired dates are not presented as upcoming');
 const card=renderToStaticMarkup(React.createElement(TitleCard,{title,selected:[],offer:'all',feedback:[],isSaved:()=>false,onSave:()=>{},onOpen:()=>{},onFeedback:()=>{}}));assert.match(card,/Save Upcoming film to watchlist/);assert.match(card,/UK digital/);
 console.log('PASS: UK release types, calendar boundaries, original TV premieres, input validation, account save and tab isolation, authenticated API, pagination, partial and total failures, detail refresh, accessible date and save labels.');
})().catch(error=>{console.error(error);process.exitCode=1;});
