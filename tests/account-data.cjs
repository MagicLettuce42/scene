const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]),get=file=>require(path.join(root,file));
const {handleAccountDeletion}=get('supabase/functions/_shared/account-data-handler.js');
const user={id:'fixture-a',email:'fixture@example.invalid'};
function fixture(change={}){
 const calls=[];const state={canDelete:true,requiresMfa:false,allowed:true,ownedLists:0,sharedContributions:0,...change};
 const factory=mode=>mode==='admin'?{auth:{getUser:async()=>({data:{user:state.noUser?null:user},error:null}),admin:{
  signOut:async(jwt,scope)=>{calls.push(['revoke',jwt,scope]);return{error:state.revokeError?{}:null};},
  deleteUser:async(id,soft)=>{calls.push(['delete',id,soft]);return{error:state.deleteError?{}:null};}
 }}}:mode==='caller'?{rpc:async(name,{p_action})=>{calls.push([p_action]);return{data:p_action==='summary'?{...state,...state.latest}:state,error:state.rpcError?{}:null};}}:{auth:{
  signInWithPassword:async data=>{calls.push(['password',data.email]);return{data:{user:{id:state.wrongIdentity?'fixture-b':user.id},session:state.badPassword?null:{}},error:state.badPassword?{}:null};},
  signOut:async()=>{calls.push(['temporary-signout']);return{error:null};}
 }};
 return{factory,calls};
}
function request(body={action:'delete',password:'fixture-password-only',confirmation:'DELETE'},headers={}){return new Request('https://scene.invalid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-jwt',...headers},body:JSON.stringify(body)});}
(async()=>{
 let f=fixture();let r=await handleAccountDeletion(request({action:'delete',password:'fixture-password-only',confirmation:'DELETE',userId:'someone-else'}),f.factory);assert.equal(r.status,400);assert.deepEqual(f.calls,[]);
 assert.equal((await handleAccountDeletion(request({action:'delete',password:'x',confirmation:'delete'}),f.factory)).status,400);
 assert.equal((await handleAccountDeletion(request(undefined,{'Content-Type':'text/plain'}),f.factory)).status,415);
 assert.equal((await handleAccountDeletion(request(undefined,{Origin:'https://evil.invalid'}),f.factory)).status,403);
 assert.equal((await handleAccountDeletion(request(undefined,{Authorization:''}),f.factory)).status,401);
 assert.equal((await handleAccountDeletion(request({action:'delete',password:'x'.repeat(4096),confirmation:'DELETE'}),f.factory)).status,413);
 for(const [changes,status] of [[{noUser:true},401],[{rpcError:true},403],[{canDelete:false},409],[{requiresMfa:true},403],[{allowed:false},429],[{badPassword:true},400],[{wrongIdentity:true},400],[{latest:{requiresMfa:true}},403],[{revokeError:true},503]]){
  f=fixture(changes);r=await handleAccountDeletion(request(),f.factory);assert.equal(r.status,status,JSON.stringify(changes));assert.ok(!f.calls.some(c=>c[0]==='delete'),'failed checks never delete');
 }
 f=fixture({deleteError:true});r=await handleAccountDeletion(request(),f.factory);assert.equal(r.status,503);assert.equal((await r.json()).code,'SESSION_REVOKED');
 f=fixture();r=await handleAccountDeletion(request(),f.factory);assert.deepEqual(await r.json(),{deleted:true});assert.deepEqual(f.calls,[['delete-attempt'],['password',user.email],['summary'],['revoke','fixture-jwt','global'],['delete',user.id,false],['temporary-signout']]);assert.equal(r.headers.get('Cache-Control'),'no-store');
 const auth=get('lib/auth/server.js');let allowed=true;auth.requireSceneMember=async()=>allowed?{error:null,user:{id:user.id},client:{rpc:async()=>({data:{format:'scene-account-export',library:{entries:{private:{note:'own note'}}}},error:null})}}:{error:Response.json({error:'Denied'},{status:401})};auth.authConfigured=()=>true;
 const route=get('app/api/account/data/route.js');
 r=await route.GET(new Request('https://scene.invalid/api/account/data?action=export'));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(r.headers.get('Content-Disposition'),/attachment/);assert.equal((await r.json()).library.entries.private.note,'own note');
 assert.equal((await route.GET(new Request('https://scene.invalid/api/account/data?action=delete'))).status,400);
 allowed=false;assert.equal((await route.GET(new Request('https://scene.invalid/api/account/data?action=export'))).status,401);
 allowed=true;process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='fixture-public-key';let forwarded;
 global.fetch=async(url,options)=>{forwarded={url,options};return Response.json({deleted:true,unwanted:'excluded'});};
 r=await route.POST(request());assert.deepEqual(await r.json(),{deleted:true});assert.equal(forwarded.url,'https://fixture.invalid/functions/v1/scene-account-data');assert.equal(forwarded.options.headers.Authorization,'Bearer fixture-jwt');
 assert.equal((await route.POST(request(undefined,{Origin:'https://evil.invalid'}))).status,403);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Component=get('app/components/account-data-controls.js').default;
 const html=renderToStaticMarkup(React.createElement(Component,{accountId:'fixture-a',pending:2}));assert.match(html,/Download my data/);assert.match(html,/Review account deletion/);assert.match(html,/2 pending changes/);assert.ok(!html.includes('type="password"'),'destructive form opens only after review');assert.equal((html.match(/disabled=""/g)||[]).length,2);
 console.log('PASS: bounded deletion requests, no target-ID override, password and identity verification, fresh MFA, last-owner guard, quotas, fail-closed cleanup ordering, auth revocation, private export API, proxy filtering and pending-sync UI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
