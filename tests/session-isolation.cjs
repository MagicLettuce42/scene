// Run after compiling the client modules into the directory supplied as argv[2].
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]);
class Storage{constructor(){this.data=new Map();}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
global.localStorage=new Storage();global.sessionStorage=new Storage();global.window={};
const boundary=require(path.join(root,'lib/auth/session-boundary.js'));
const {fetchForSession}=require(path.join(root,'lib/auth/session-request.js'));
const clientPath=path.join(root,'lib/auth/client.js');let cachedTransport=async()=>Response.json({fixture:true});
require.cache[clientPath]={id:clientPath,filename:clientPath,loaded:true,exports:{sceneFetch:(...args)=>cachedTransport(...args)}};
const cache=require(path.join(root,'lib/client-cache.js'));
const {readTabs,tabMemoryKey}=require(path.join(root,'lib/tab-memory.js'));
const session=id=>({user:{id},access_token:'disposable-token-'+id});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const abort=error=>error.name==='AbortError';
(async()=>{
 // A tab reopened after another account signed in must remove its stale device copy.
 sessionStorage.setItem('scene.browser-account.v1','previous');localStorage.setItem('scene.library.previous','private fixture');
 sessionStorage.setItem('scene.tabs.v1','unscoped search');sessionStorage.setItem('scene.catalogue-cache.v1','unscoped interests');
 boundary.setSessionAccount('a');assert.equal(localStorage.getItem('scene.library.previous'),null);assert.equal(sessionStorage.getItem('scene.tabs.v1'),null);
 let calls=0;
 const transport=async(_url,options)=>{calls++;assert.equal(options.headers.get('Authorization'),'Bearer disposable-token-a');return Response.json({ok:true});};
 assert.equal((await fetchForSession(async()=>session('a'),'/api/library',{},'a',transport)).status,200);assert.equal(calls,1);
 const lookup=deferred();calls=0;
 const staleLookup=fetchForSession(()=>lookup.promise,'/api/library',{method:'POST',body:'old-account-save'},'a',transport);
 boundary.setSessionAccount('b');lookup.resolve(session('b'));await assert.rejects(staleLookup,abort);assert.equal(calls,0,'old pending save must not be sent using B credentials');
 await assert.rejects(fetchForSession(async()=>session('b'),'/api/library',{},'a',transport),abort);assert.equal(calls,0);
 boundary.setSessionAccount('a');let started=deferred(),cancelled=false;
 const pending=fetchForSession(async()=>session('a'),'/api/library',{},'a',async(_url,options)=>{
  started.resolve();return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('cancelled','AbortError'));},{once:true}));
 });
 await started.promise;boundary.setSessionAccount('b');await assert.rejects(pending,abort);assert.equal(cancelled,true);
 boundary.setSessionAccount('a');const response=deferred();started=deferred();
 const ignoresAbort=fetchForSession(async()=>session('a'),'/api/library',{},'a',async()=>{started.resolve();return response.promise;});
 await started.promise;boundary.setSessionAccount('b');boundary.setSessionAccount('a');response.resolve(Response.json({private:'old-session'}));
 await assert.rejects(ignoresAbort,abort,'switching away and back must not resurrect a stale response');
 // Cache and tab snapshots remain scoped, and a normal token refresh keeps them.
 cache.writeCache('/api/search?q=fixture-a',{for:'a'});
 const snapshot={view:'films',tabs:{films:{offer:'all',sort:'recommended',genre:'all',query:'fixture-a',submitted:'fixture-a',results:[],scroll:120}}};
 sessionStorage.setItem(tabMemoryKey('a'),JSON.stringify(snapshot));localStorage.setItem('scene.library.a','private fixture');
 const epoch=boundary.sessionBoundary().epoch;boundary.setSessionAccount('a');assert.equal(boundary.sessionBoundary().epoch,epoch);
 assert.deepEqual(cache.readCache('/api/search?q=fixture-a'),{for:'a'});assert.equal(readTabs('a').tabs.films.query,'fixture-a');
 // Explicit Retry must bypass both the account cache and the browser HTTP cache.
 let retryOptions;
 cachedTransport=async(_url,options)=>{retryOptions=options;return Response.json({for:'a',fresh:true});};
 const refreshed=await cache.cachedJSON('/api/search?q=fixture-a',undefined,true);
 assert.equal(retryOptions.cache,'no-store');assert.equal(refreshed.fresh,true);
 assert.equal(cache.readCache('/api/search?q=fixture-a').fresh,true);
 boundary.setSessionAccount('b');assert.equal(cache.readCache('/api/search?q=fixture-a'),null);assert.equal(readTabs('b').restored,false);
 assert.equal(localStorage.getItem('scene.library.a'),null);assert.equal(sessionStorage.getItem(tabMemoryKey('a')),null);assert.equal(sessionStorage.getItem('scene.catalogue-cache.v2.a'),null);
 // Switching after headers arrive but before JSON finishes cannot populate B's cache.
 boundary.setSessionAccount('a');const body=deferred();started=deferred();
 cachedTransport=async()=>({ok:true,json:()=>{started.resolve();return body.promise;}});
 const staleJson=cache.cachedJSON('/api/search?q=late');await started.promise;boundary.setSessionAccount('b');body.resolve({for:'a'});
 await assert.rejects(staleJson,abort);assert.equal(cache.readCache('/api/search?q=late'),null);
 cache.writeCache('/api/search?q=fixture-b',{for:'b'});localStorage.setItem('scene.library.b','private fixture');
 boundary.setSessionAccount(null);assert.equal(cache.readCache('/api/search?q=fixture-b'),null);assert.equal(localStorage.getItem('scene.library.b'),null);
 // The same boundary callback is invoked by the SDK for local and cross-tab sign-out.
 const blockedStorage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
 global.localStorage=blockedStorage;global.sessionStorage=blockedStorage;
 assert.doesNotThrow(()=>boundary.setSessionAccount('a'));assert.doesNotThrow(()=>boundary.setSessionAccount(null));
 console.log('PASS: delayed save identity, explicit account binding, in-flight cancellation, stale response rejection, A→B→A protection, cache/tab isolation, token-refresh retention, sign-out cleanup and disabled storage.');
})().catch(e=>{console.error(e);process.exitCode=1;});
