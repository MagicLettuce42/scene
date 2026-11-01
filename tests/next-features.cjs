const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=path.resolve(process.argv[2]),get=p=>require(path.join(root,p));
const {viewingStats}=get('lib/viewing-stats.js'),{creditCandidates,personSummary}=get('lib/people.js');
const movie={id:'movie',tmdbId:501,name:'A film',kind:'movie',year:2024,genres:['Drama','Drama','Comedy'],summary:'',poster:null,offers:[]},series={...movie,id:'series',tmdbId:502,name:'A series',kind:'series',genres:['Drama']};
const input={feedback:[{title:movie,watched:true},{title:{...movie,id:'duplicate'},watched:true},{title:series,watched:true},{title:{...movie,tmdbId:999},liked:true,watched:false}],reviews:[{title:movie,rating:5,note:'private'},{title:series,rating:3,note:''}],progressEntries:[{title:series,progress:{tracking:false,episodes:{1:{1:true,2:true,3:false},2:{1:true}}}}]};
const stats=viewingStats(input);assert.equal(stats.films,1);assert.equal(stats.series,1);assert.equal(stats.episodes,3);assert.equal(stats.averageRating,4);assert.deepEqual(stats.genres,[{name:'Drama',count:2},{name:'Comedy',count:1}]);assert.equal(viewingStats({feedback:[],reviews:[],progressEntries:[]}).averageRating,null);
assert.equal(personSummary({id:-1,name:'Bad'}),null);assert.equal(personSummary({id:1,name:'A',profile_path:'/../../bad'}).photo,null);
const credit={id:1,media_type:'movie',popularity:5};assert.deepEqual(creditCandidates({cast:[credit,{...credit,id:2,adult:true}],crew:[{...credit,job:'Director'},{...credit,id:3,job:'Writer'}]},'all').map(r=>r.id),[1]);assert.equal(creditCandidates({cast:[credit],crew:[{...credit,id:3,job:'Director'}]},'directing')[0].id,3);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),View=get('app/components/viewing-stats.js').default;
const html=renderToStaticMarkup(React.createElement(View,{...input,onOpen(){}}));assert.match(html,/Series marked watched/);assert.match(html,/Genres you watch/);assert.ok(!html.includes('private</'));assert.match(html,/A film/);
(async()=>{
 process.env.TMDB_API_KEY='fixture-only';const calls=[];
 global.fetch=async raw=>{const u=new URL(raw);calls.push(u);assert.equal(u.hostname,'api.themoviedb.org');let data;
  if(u.pathname.endsWith('/search/person')){assert.equal(u.searchParams.get('include_adult'),'false');data={results:[{id:10,name:'Example',known_for_department:'Acting'},{id:20,name:'Excluded',adult:true}],total_pages:2};}
  else if(u.pathname.endsWith('/person/10'))data={id:10,name:'Example',combined_credits:{cast:[{id:501,media_type:'movie'},{id:502,media_type:'movie'},{id:503,media_type:'tv'}]}};
  else {const id=Number(u.pathname.split('/').at(-1));data={id,title:'Title '+id,name:'Title '+id,genres:[],release_date:'2024-01-01',first_air_date:'2024-01-01','watch/providers':{results:{GB:id===501?{flatrate:[{provider_id:8,provider_name:'Netflix'}]}:id===502?{rent:[{provider_id:8,provider_name:'Netflix'}]}:{flatrate:[{provider_id:9,provider_name:'Amazon Prime Video'}]},US:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}}};}
  return Response.json(data);
 };
 const tmdb=get('lib/tmdb.js');const people=await tmdb.searchPeopleTMDB('Example',1);assert.equal(people.people.length,1);assert.equal(people.hasMore,true);
 const filmography=await tmdb.personFilmographyTMDB(10,['netflix'],'all',1);assert.deepEqual(filmography.titles.map(t=>t.tmdbId),[501]);assert.equal(filmography.hasMore,false);const before=calls.length;assert.equal((await tmdb.personFilmographyTMDB(10,[],'all',1)).titles.length,0);assert.equal(calls.length,before);
 const extras=tmdb.normalizeExtras({credits:{crew:[{id:8,name:'Director',job:'Director'},{id:9,name:'Writer',job:'Writer'}]}});assert.deepEqual(extras.directors.map(p=>p.id),[8]);
 const auth=get('lib/auth/server.js');auth.requireSceneMember=async()=>({error:Response.json({}, {status:401})});
 const peopleApi=get('app/api/people/route.js'),alertApi=get('app/api/availability-alerts/route.js'),adminApi=get('app/api/admin/releases/route.js');
 for(const [api,url] of [[peopleApi,'people'],[alertApi,'availability-alerts'],[adminApi,'admin/releases']])assert.equal((await api.GET(new Request('https://scene.test/api/'+url))).status,401);
 let saved;auth.requireSceneMember=async()=>({error:null,user:{id:'member'},member:{role:'member'},security:{adminReady:false},client:{rpc:async(name,args)=>{saved={name,args};return {error:null,data:null};}}});
 assert.equal((await adminApi.GET(new Request('https://scene.test/api/admin/releases'))).status,403);
 for(const q of ['person=-1','person=5&services=unknown','q=x','q=Actor&page=101'])assert.equal((await peopleApi.GET(new Request('https://scene.test/api/people?'+q))).status,400);
 for(const body of [null,[],{}, {action:'preference',enabled:'true'}])assert.equal((await alertApi.POST(new Request('https://scene.test/api/availability-alerts',{method:'POST',body:JSON.stringify(body)}))).status,400);
 assert.equal((await alertApi.POST(new Request('https://scene.test/api/availability-alerts',{method:'POST',body:JSON.stringify({action:'preference',enabled:true})}))).status,200);assert.deepEqual(saved,{name:'scene_availability_alert_action',args:{p_action:'preference',p_data:{enabled:true}}});
 const listeners={},shown=[],opened=[];vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://scene.test'},addEventListener:(key,fn)=>listeners[key]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}});let work;
 listeners.push({data:{json:()=>({type:'scene-now-streaming',title:'PRIVATE TITLE',url:'https://evil.test'})},waitUntil:p=>work=p});await work;assert.equal(shown[0][0],'Scene availability update');assert.ok(!JSON.stringify(shown).includes('PRIVATE TITLE'));
 listeners.notificationclick({notification:{close(){},data:shown[0][1].data},waitUntil:p=>work=p});await work;assert.equal(opened[0],'https://scene.test/?scene=availability');
 listeners.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>work=p});await work;assert.equal(opened[1],'https://scene.test/?scene=reminders');
 console.log('PASS: private stats, canonical deduplication, actor/director credits, UK subscription filtering, authenticated APIs, owner restriction, opt-in validation and generic safe notification routing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
