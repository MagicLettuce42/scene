// Run against the temporary CommonJS application build. All account rows are fixtures.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(process.argv[2]),get=p=>require(path.join(root,p));
const state=get('lib/library-state.js'),gaming=get('lib/gaming.js'),tabs=get('lib/tab-memory.js');
const fresh=state.emptyLibrary(),old=JSON.parse(JSON.stringify(fresh));
assert.equal(state.projectLibrary(fresh).gamingEnabled,false);
assert.deepEqual(state.projectLibrary(fresh).games,{});
const ops=[{type:'gaming',value:true},{type:'game-platform',key:'ps5',value:true},{type:'game-status',id:'astro-bot',value:'later'}];
const enabled=state.applyOperations(fresh,ops),off=state.applyOperations(enabled,[{type:'gaming',value:false}]);
assert.deepEqual(fresh,old,'updates must not mutate another document');
assert.deepEqual(off.games,enabled.games,'turning off preserves games');
assert.deepEqual(state.projectLibrary(off).gamingPlatforms,['ps5']);
assert.equal(tabs.availableView('gaming',false),'discover');
assert.equal(tabs.availableView('gaming',true),'gaming');
assert.equal(tabs.availableView('films',false),'films');
const changed=state.applyOperations(off,[{type:'theme',value:'yellow'},{type:'game-status',id:'astro-bot',value:'finished'},{type:'gaming',value:true}]);
assert.equal(changed.games['astro-bot'],'finished');assert.equal(enabled.games['astro-bot'],'later');
const removed=state.applyOperations(changed,[{type:'game-status',id:'astro-bot',value:null}]);assert.deepEqual(removed.games,{});
const validate=operations=>state.validateMutation({id:'gaming-fixture-valid',revision:0,operations});
assert.ok(validate(ops));
for(const op of [{type:'gaming',value:'true'},{type:'game-platform',key:'__proto__',value:true},{type:'game-platform',key:'pc',value:1},{type:'game-status',id:'__proto__',value:'playing'},{type:'game-status',id:'astro-bot',value:'owned'},{type:'game-status',id:'astro-bot'}])assert.equal(validate([op]),null);
assert.deepEqual(gaming.searchGames('astro',false),[],'disabled accounts get no game search results');
assert.equal(gaming.searchGames('baldurs gate',true)[0].id,'baldurs-gate-3');
assert.equal(gaming.searchGames('Baldur’s Gate',true)[0].id,'baldurs-gate-3');
assert.equal(gaming.searchGames('ASTRO',true)[0].id,'astro-bot');
const filters={tab:'explore',platform:'mine',genre:'all',status:'all'};
assert.equal(gaming.filterGames(filters,[],{}).length,gaming.games.length);
assert.ok(gaming.filterGames(filters,['ps5'],{}).every(g=>g.platforms.includes('ps5')));
assert.ok(gaming.filterGames({...filters,platform:'pc'},['ps5'],{}).every(g=>g.platforms.includes('pc')));
assert.equal(gaming.filterGames({...filters,platform:'all'},['ps5'],{}).length,gaming.games.length);
assert.deepEqual(gaming.filterGames({...filters,tab:'collection'},[],enabled.games).map(g=>g.id),['astro-bot']);
assert.equal(gaming.filterGames({...filters,tab:'collection',status:'playing'},[],enabled.games).length,0);
const upcoming=gaming.filterGames({...filters,tab:'upcoming'},[],{});assert.ok(upcoming.length>0&&upcoming.every(g=>!g.released));assert.deepEqual(upcoming.map(g=>g.date),upcoming.map(g=>g.date).sort());
assert.match(gaming.gameReleaseLabel(upcoming[0],'2099-01-01'),/Announced for.*check release/,'elapsed announcements never become confirmed releases automatically');
assert.equal(new Set(gaming.games.map(g=>g.id)).size,gaming.games.length);
for(const game of gaming.games){assert.ok(game.name&&game.summary&&game.genre);assert.ok(game.platforms.length&&game.platforms.every(gaming.isGamePlatform));assert.ok(game.sourceUrl.startsWith('https://'));assert.ok(game.released||/^\d{4}-\d{2}-\d{2}$/.test(game.date));assert.ok(fs.existsSync(path.join(process.cwd(),'public',game.image)),'artwork exists: '+game.id);}

const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const SearchResults=get('app/components/search-results.js').default,GameSettings=get('app/components/gaming-settings.js').default,GameScreen=get('app/components/gaming.js').default;
const searchProps={titles:[],people:[],peopleHasMore:false,peopleMessage:'',busy:false,selected:['netflix'],feedback:[],offer:'all',isSaved:()=>false,onSave(){},onOpen(){},onFeedback(){},onPerson(){},onMorePeople(){},onServices(){}};
const plain=renderToStaticMarkup(React.createElement(SearchResults,searchProps));assert.ok(!plain.includes('game-search-card'));assert.match(plain,/Films &amp; TV series/);
const combined=renderToStaticMarkup(React.createElement(SearchResults,{...searchProps,gameResults:gaming.searchGames('astro',true),gameCollection:enabled.games,onGameStatus(){}}));assert.match(combined,/ASTRO BOT/);assert.match(combined,/Play later/);
const sampleTitle=get('lib/catalogue.js').titles[0];
const mergedSearch=renderToStaticMarkup(React.createElement(SearchResults,{...searchProps,titles:[sampleTitle],people:[{id:1,name:'Example Actor',photo:null,department:'Acting'}],gameResults:gaming.searchGames('astro',true),gameCollection:{},onGameStatus(){}}));
assert.match(mergedSearch,/Films, TV series &amp; games/);
assert.equal((mergedSearch.match(/class="poster-grid"/g)||[]).length,1,'films, TV and games share one results grid');
assert.ok(mergedSearch.indexOf('game-search-card')<mergedSearch.indexOf('people-results-heading'),'all title and game cards precede people');
assert.ok(!mergedSearch.includes('game-results-heading'),'no separate games section remains');
assert.match(mergedSearch,/GAME<\/span>/);assert.match(mergedSearch,/Add ASTRO BOT to Play later/);
const noGameMatches=renderToStaticMarkup(React.createElement(SearchResults,{...searchProps,gameResults:[],onGameStatus(){}}));assert.match(noGameMatches,/Films, TV series &amp; games/);assert.match(noGameMatches,/No matching films or series/);
const settings=renderToStaticMarkup(React.createElement(GameSettings,{gamingEnabled:false,gamingPlatforms:[],onGamingChange(){},onGamePlatform(){},onOpenGaming(){}}));assert.match(settings,/role="switch"/);assert.ok(!settings.includes('checked=""'));assert.ok(!settings.includes('Open Gaming'));
const screen=renderToStaticMarkup(React.createElement(GameScreen,{platforms:['pc'],collection:{},onStatus(){},onPlatform(){}}));assert.ok(screen.includes('Forza Horizon 6'));assert.ok(!screen.includes('ASTRO BOT'));assert.match(screen,/<details class="game-options">/);assert.ok(!screen.includes('<details open'));

// Exercise the real Explore controls across pages and filter changes.
// The small hook harness supplies state; child components still use the React SSR renderer.
function gamingHarness(initialPlatforms=[]){
 const values=[];let props={platforms:initialPlatforms,collection:{},onStatus(){},onPlatform(){}};
 function render(){
  let cursor=0;const original=React.useState, originalRef=React.useRef;
  React.useRef=initial=>({current:initial});
  React.useState=initial=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];};
  let tree;try{tree=GameScreen(props);}finally{React.useState=original;React.useRef=originalRef;}
  const nodes=[];function walk(value){if(Array.isArray(value)){value.forEach(walk);return;}if(value&&typeof value==='object'&&value.props){nodes.push(value);walk(value.props.children);}}walk(tree);
  return {html:renderToStaticMarkup(tree),nodes};
 }
 return {render,setPlatforms(platforms){props={...props,platforms};}};
}
const browse=gamingHarness();
let page=browse.render();const cardCount=html=>(html.match(/<article class="[^"]*\bgame-card\b[^"]*"/g)||[]).length;
assert.equal(cardCount(page.html),12);assert.match(page.html,/Load more games/);assert.match(page.html,new RegExp('12 of '+gaming.games.length+' matching games'));
const moreButton=nodes=>nodes.find(n=>n.type==='button'&&n.props['aria-controls']==='gaming-results');
moreButton(page.nodes).props.onClick();page=browse.render();assert.equal(cardCount(page.html),24);
while(moreButton(page.nodes)){moreButton(page.nodes).props.onClick();page=browse.render();}
assert.equal(cardCount(page.html),gaming.games.length);assert.match(page.html,/reached the end/);
const platformSelect=page.nodes.find(n=>n.type===get('app/components/select-control.js').default);platformSelect.props.onChange({target:{value:'pc'}});
page=browse.render();assert.equal(cardCount(page.html),12);assert.ok(!page.html.includes('ASTRO BOT'));
const pcCount=gaming.filterGames({...filters,platform:'pc'},[],{}).length;assert.match(page.html,new RegExp('12 of '+pcCount+' matching games'));
assert.ok(!page.nodes.some(n=>n.type==='button'&&n.props.children==='Upcoming'),'Gaming only contains Explore and My games');
const Upcoming=get('app/components/upcoming.js').default,upcomingFilters=get('lib/upcoming.js');
const gameProps={platforms:['pc'],collection:{},onStatus(){},onPlatform(){}};
const upcomingProps={...searchProps,filters:upcomingFilters.cleanUpcomingFilters({section:'games'}),onFilters(){},onServices(){}};
assert.equal(upcomingProps.filters.section,'games','saved Games selection survives sanitisation');
const gameReleases=renderToStaticMarkup(React.createElement(Upcoming,{...upcomingProps,gaming:gameProps}));
assert.match(gameReleases,/>Games<\/button>/);assert.match(gameReleases,/Soonest first/);assert.ok(!gameReleases.includes('Gaming views'));assert.ok(!gameReleases.includes('Load more games'));assert.equal(cardCount(gameReleases),gaming.filterGames({...filters,tab:'upcoming'},['pc'],{}).length);
const gamingOff=renderToStaticMarkup(React.createElement(Upcoming,upcomingProps));assert.ok(!gamingOff.includes('game-card'));assert.ok(!gamingOff.includes('>Games</button>'));assert.match(gamingOff,/Streaming/,'stale Games selection falls back to Streaming when disabled');
const upcomingAll=renderToStaticMarkup(React.createElement(Upcoming,{...upcomingProps,gaming:{...gameProps,platforms:[]}}));assert.equal(cardCount(upcomingAll),gaming.filterGames({...filters,tab:'upcoming'},[],{}).length,'no saved platforms includes all upcoming games');
assert.equal(gaming.searchGames('halo infinite',true)[0].id,'halo-infinite','main search includes games beyond the first page');
assert.ok(validate([{type:'game-status',id:'halo-infinite',value:'later'}]),'new catalogue entries can be saved');

// Saved preferences must not look like active platform filters in the All view.
const ActivePlatforms=get('app/components/gaming.js').ActiveGamePlatforms;
const platformProps={platforms:['ps5'],onPlatform(){},onUseMine(){}};
const allPlatforms=renderToStaticMarkup(React.createElement(ActivePlatforms,{...platformProps,mode:'all'}));
assert.match(allPlatforms,/Showing games from every platform/);assert.ok(!allPlatforms.includes('type="checkbox"'));assert.match(allPlatforms,/Use my platforms/);
const minePlatforms=renderToStaticMarkup(React.createElement(ActivePlatforms,{...platformProps,mode:'mine'}));
assert.match(minePlatforms,/checked=""/);assert.match(minePlatforms,/Tick a platform to filter the games below/);
const anotherPlatform=renderToStaticMarkup(React.createElement(ActivePlatforms,{...platformProps,mode:'pc'}));
assert.match(anotherPlatform,/Showing games for PC/);assert.ok(!anotherPlatform.includes('checked=""'));

// Exercise the actual library API with per-user fixtures, revision conflicts and retries.
let identity='alice';const rows=new Map(),auth=get('lib/auth/server.js');
get('lib/release-feed.js').readReleaseFeed=async()=>({entries:[]});
const client={from(table){const q={};const api={select(){return api},eq(k,v){q[k]=v;return api},async insert(row){if(rows.has(row.user_id))return {error:{code:'23505'}};rows.set(row.user_id,structuredClone(row));return {error:null}},update(payload){q.payload=payload;return api},async maybeSingle(){const row=rows.get(q.user_id);if(q.payload){if(!row||row.revision!==q.revision)return {data:null,error:null};Object.assign(row,structuredClone(q.payload));return {data:{revision:row.revision},error:null};}return {data:row?structuredClone(row):null,error:null}}};return api}};
auth.requireSceneMember=async()=>identity?{error:null,client,user:{id:identity}}:{error:Response.json({error:'Sign in'},{status:401})};
const api=get('app/api/library/route.js');
const request=body=>new Request('https://scene.test/api/library',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
async function save(id,revision,operations){const response=await api.POST(request({id,revision,operations}));return {status:response.status,body:await response.json()};}
(async()=>{
 let a=await save('gaming-alice-start',0,ops);assert.equal(a.status,200);assert.equal(a.body.document.games['astro-bot'],'later');
 const updated=await save('gaming-alice-progress',1,[{type:'game-status',id:'astro-bot',value:'playing'}]);assert.equal(updated.status,200);
 const conflict=await save('gaming-other-device',1,[{type:'game-platform',key:'pc',value:true}]);assert.equal(conflict.status,409);
 const rebased=await save('gaming-other-device',conflict.body.revision,[{type:'game-platform',key:'pc',value:true}]);assert.equal(rebased.status,200);assert.equal(rebased.body.document.games['astro-bot'],'playing');assert.deepEqual(state.projectLibrary(rebased.body.document).gamingPlatforms,['ps5','pc']);
 const retry=await save('gaming-other-device',0,[{type:'game-platform',key:'pc',value:true}]);assert.equal(retry.body.revision,3);
 const disabled=await save('gaming-alice-disable',3,[{type:'gaming',value:false}]);assert.equal(disabled.status,200);assert.equal(disabled.body.document.games['astro-bot'],'playing');
 identity='bob';const b=await (await api.GET(request())).json();assert.equal(b.userId,'bob');assert.equal(state.projectLibrary(b.document).gamingEnabled,false);assert.deepEqual(state.projectLibrary(b.document).games,{});
 await save('gaming-bob-private',0,[{type:'gaming',value:true},{type:'game-status',id:'astro-bot',value:'finished'}]);
 identity='alice';const restored=await (await api.GET(request())).json();assert.equal(state.projectLibrary(restored.document).gamingEnabled,false);assert.equal(restored.document.games['astro-bot'],'playing');
 identity=null;assert.equal((await api.GET(request())).status,401);assert.equal((await api.POST(request({id:'gaming-bad-user',revision:0,operations:ops}))).status,401);
 console.log('PASS: Gaming defaults, disable/re-enable retention, account isolation, API validation, conflict rebase, idempotent retry, platforms, search gating, release dates and SSR controls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
