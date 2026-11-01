// Stdin-only public configuration and disposable QA invitations; no credentials are saved.
const {execFileSync}=require('node:child_process');
const readline=require('node:readline');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]);
const {createClient}=require('@supabase/supabase-js');
const sessions=[];
if(process.stdin.isTTY)execFileSync('stty',['-echo'],{stdio:'inherit'});
console.log('Ready for QA configuration on stdin (input is hidden).');
const rl=readline.createInterface({input:process.stdin,terminal:false});
rl.once('line',async line=>{rl.close();if(process.stdin.isTTY)execFileSync('stty',['echo'],{stdio:'inherit'});
 try{
 const config=JSON.parse(line);process.env.SUPABASE_URL=config.url;process.env.SUPABASE_PUBLISHABLE_KEY=config.key;
 const library=require(path.join(root,'app/api/library/route.js'));
 const shared=require(path.join(root,'app/api/shared/route.js'));
 const state=require(path.join(root,'lib/library-state.js'));
 const base='https://scene-streaming.airyokapi2.chatgpt.site';
 const request=(endpoint,token,body)=>new Request(base+endpoint,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 for(const account of config.accounts){
  const inspected=await fetch(config.url+'/functions/v1/scene-access',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({action:'inspect',token:account.token}),signal:AbortSignal.timeout(25000)});assert.equal(inspected.status,200,'test invitation can be inspected');
  const joined=await fetch(config.url+'/functions/v1/scene-access',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({action:'join',token:account.token,email:account.email,name:account.name,password:account.password}),signal:AbortSignal.timeout(25000)});assert.equal(joined.status,200,'test member joins through the existing invitation function');
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const signed=await client.auth.signInWithPassword({email:account.email,password:account.password});assert.equal(Boolean(signed.error),false,'invited member can sign in');assert.ok(signed.data.session);
  sessions.push({client,userId:signed.data.user.id,token:signed.data.session.access_token});
 }
 console.log('PASS: two disposable members accepted invitations and signed in.');
 const [a,b]=sessions;
 async function save(session,id,revision,operations){const r=await library.POST(request('/api/library',session.token,{id,revision,operations}));const body=await r.json();return {status:r.status,body};}
 const aSetup=await save(a,'live-setup-alice-001',0,[{type:'service',key:'netflix',value:true},{type:'theme',value:'yellow'},{type:'onboard',value:true}]);assert.equal(aSetup.status,200);
 const bSetup=await save(b,'live-setup-bob-00001',0,[{type:'service',key:'disney',value:true},{type:'theme',value:'daylight'},{type:'onboard',value:true}]);assert.equal(bSetup.status,200);
 const title={id:'tmdb-tv-1399',tmdbId:1399,name:'QA series',kind:'series',year:2011,genres:[],summary:'Disposable QA title',poster:null,runtime:null,rating:null,offers:[]};
 assert.equal((await save(a,'live-episode-device1',1,[{type:'episode',title,season:1,episodes:[1],value:true}])).status,200);
 const conflict=await save(a,'live-episode-device2',1,[{type:'episode',title,season:1,episodes:[2],value:true}]);assert.equal(conflict.status,409);
 assert.equal((await save(a,'live-episode-device2',conflict.body.revision,[{type:'episode',title,season:1,episodes:[2],value:true}])).status,200);
 const again=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});const secondDevice=await again.auth.signInWithPassword({email:config.accounts[0].email,password:config.accounts[0].password});assert.ok(secondDevice.data.session);
 const reread=await library.GET(request('/api/library',secondDevice.data.session.access_token));const projection=state.projectLibrary((await reread.json()).document);assert.equal(projection.theme,'yellow');assert.equal(projection.onboarded,true);assert.deepEqual(projection.selected,['netflix']);assert.deepEqual(projection.tracking[0].progress.episodes['1'],{1:true,2:true});
 const bobRead=await library.GET(request('/api/library',b.token));const bob=state.projectLibrary((await bobRead.json()).document);assert.equal(bob.theme,'daylight');assert.equal(bob.tracking.length,0);
 const leaked=await b.client.from('scene_libraries').select('user_id').eq('user_id',a.userId);assert.equal(leaked.data.length,0,'database hides another account library');
 console.log('PASS: welcome preferences and episodes survive a fresh sign-in; separate libraries and conflict rebase verified.');
 const id=require('node:crypto').randomUUID();
 async function action(session,body){const r=await shared.POST(request('/api/shared',session?.token,body));return {status:r.status,body:await r.json()};}
 assert.equal((await action(a,{action:'create',id,name:'Disposable QA film night'})).status,200);
 assert.equal((await action(a,{action:'add',listId:id,title})).status,200);
 const blocked=await shared.GET(request('/api/shared?id='+id,b.token));assert.equal(blocked.status,403);
 const invite=await action(a,{action:'invite',listId:id,email:config.accounts[1].email});assert.equal(invite.status,200);const token=new URL(invite.body.url).hash.slice(8);
 assert.equal((await action(b,{action:'inspect',token})).status,200);assert.equal((await action(b,{action:'join',token})).status,200);
 assert.equal((await action(b,{action:'vote',listId:id,key:'tmdb-tv-1399',value:true})).status,200);assert.equal((await action(b,{action:'vote',listId:id,key:'tmdb-tv-1399',value:true})).status,200);
 const detail=await shared.GET(request('/api/shared?id='+id,a.token));assert.equal(detail.status,200);const value=await detail.json();assert.equal(value.items[0].votes,1);assert.equal(value.people.length,2);
 assert.equal((await action(a,{action:'remove-person',listId:id,userId:b.userId})).status,200);assert.equal((await shared.GET(request('/api/shared?id='+id,b.token))).status,403);
 assert.equal((await action(b,{action:'join',token})).status,403);assert.equal((await shared.GET(request('/api/shared'))).status,401);
 console.log('PASS: live shared-list create/add/invite/accept/vote, duplicate retry, removal, old-link denial and anonymous denial.');
 await again.auth.signOut({scope:'global'});
 console.log('QA complete. Disposable member records require cleanup.');
 }catch(e){console.error('QA FAILED:',e instanceof assert.AssertionError?e.message:'The live test could not complete.');process.exitCode=1;}
 finally{for(const session of sessions)try{await session.client.auth.signOut({scope:'global'});}catch{}process.exit(process.exitCode||0);}
});
