const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
process.env.TMDB_API_KEY='fictional-test-key';
const calls=[]; let releaseSlow;
const slow = new Promise(resolve=>releaseSlow=resolve);
global.fetch=async input=>{
  const u=new URL(input); calls.push(u.pathname);
  if(u.pathname.endsWith('/search/multi')) {
    const cancelled=u.searchParams.get('query')==='cancel', offset=cancelled?200:0;
    return Response.json({total_pages:2,results:Array.from({length:cancelled?20:4},(_,i)=>({id:offset+i+1,media_type:'movie',title:'Fixture café · '+i,genre_ids:[99]}))});
  }
  if(u.pathname.endsWith('/movie/4/watch/providers')) await slow;
  return Response.json({results:{GB:{free:[{provider_id:38,provider_name:'BBC iPlayer'}]}}});
};
const authFile=require.resolve('../lib/auth/server.ts');
require.cache[authFile]={id:authFile,filename:authFile,loaded:true,exports:{requireSceneMember:async()=>({error:null})}};
const route=require('../app/api/search/route.ts');
const storage=new Map(); global.window={}; global.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const boundary=require('../lib/auth/session-boundary.ts'); boundary.setSessionAccount('fictional-a');
const clientFile=require.resolve('../lib/auth/client.ts'); let override;
require.cache[clientFile]={id:clientFile,filename:clientFile,loaded:true,exports:{sceneFetch:async(url,init)=>override?override():route.GET(new Request('https://scene.invalid'+url,{signal:init.signal}))}};
const quality=require.resolve('../lib/quality.ts'); require.cache[quality]={id:quality,filename:quality,loaded:true,exports:{recordQuality(){}}};
const {streamSearch}=require('../lib/search-client.ts');
const {readCache}=require('../lib/client-cache.ts');
(async()=>{
  const {secureResponse}=require('../lib/http-security.ts');
  assert.equal(secureResponse(new Request('https://scene.invalid/api/search'),new Response('',{headers:{'Content-Type':'application/x-ndjson'}})).headers.get('Cache-Control'),'no-store, no-transform','stream delivery remains private and bypasses proxy transformation');
  const response=await route.GET(new Request('https://scene.invalid/api/search?q=preview&suggest=1'));
  assert.equal(response.status,200); assert.equal(calls.length,1,'autocomplete has no availability calls');
  const updates=[], url='/api/search?q=stream&stream=1&page=1';
  const watchdog=setTimeout(()=>{releaseSlow();throw Error('search withheld every result behind the slow provider');},5000);
  try {
    await streamSearch(url,new AbortController().signal,(data,complete)=>{
      updates.push({data,complete});
      if(data.titles.length && !complete) releaseSlow();
    });
  } finally { clearTimeout(watchdog); }
  assert.equal(updates[0].data.titles.length,0,'progress starts before provider responses');
  assert.ok(updates.some(u=>u.data.titles.length>0&&!u.complete),'checked results arrive before completion');
  assert.deepEqual(updates.at(-1).data.titles.map(t=>t.id),['tmdb-movie-1','tmdb-movie-2','tmdb-movie-3','tmdb-movie-4'],'final relevance order is preserved');
  assert.ok(readCache(url),'only a complete successful search is cached');
  const before=calls.length; await streamSearch(url,new AbortController().signal,()=>{});
  assert.equal(calls.length,before,'complete repeated searches reuse account cache');
  const cancel = new AbortController(), providerCount=()=>calls.filter(p=>p.endsWith('/watch/providers')).length, providersBefore=providerCount();
  const cancelledResponse=await route.GET(new Request('https://scene.invalid/api/search?q=cancel&stream=1',{signal:cancel.signal}));
  const cancelledReader=cancelledResponse.body.getReader(); await cancelledReader.read();
  cancel.abort(); await cancelledReader.cancel();
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.ok(providerCount()-providersBefore<=4,'cancelled searches cannot fan out to all twenty provider lookups');
  const events=[{type:'start',page:1},{type:'title',index:0,title:updates.at(-1).data.titles[0]}];
  override=()=>new Response(events.map(e=>JSON.stringify(e)+'\n').join(''),{headers:{'Content-Type':'application/x-ndjson'}});
  let partial=[];
  await assert.rejects(streamSearch('/api/search?q=truncated&stream=1',new AbortController().signal,d=>{partial=d.titles;}),/stopped before/);
  assert.equal(partial.length,1,'a failed stream retains results already checked');
  assert.equal(readCache('/api/search?q=truncated&stream=1'),null,'partial results are never cached');
  const encoded=events.map(e=>JSON.stringify(e)+'\n').join('')+JSON.stringify({type:'complete',result:{titles:updates.at(-1).data.titles}})+'\n';
  override=()=>new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(encoded);for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));
  const fragmented=[]; await streamSearch('/api/search?q=fragmented&stream=1',new AbortController().signal,(d,c)=>fragmented.push(c));
  assert.equal(fragmented.at(-1),true,'split UTF-8/JSON chunks are handled');
  const received=[];
  await assert.rejects(streamSearch('/api/search?q=session&stream=1',new AbortController().signal,(d)=>{received.push(d);if(d.titles.length)boundary.setSessionAccount('fictional-b');}),e=>e.name==='AbortError');
  assert.equal(readCache('/api/search?q=session&stream=1'),null,'account switching cannot write the previous user’s search cache');
  assert.equal(received.length,2,'no later stream event is delivered after the account switches');
  override=()=>new Promise(()=>{});
  const schedule=setTimeout;
  global.setTimeout=(fn,ms,...args)=>schedule(fn,ms===30000?20:ms,...args);
  try { await assert.rejects(streamSearch('/api/search?q=hung-auth&stream=1',new AbortController().signal,()=>{}),/taking too long/,'even a hung sign-in lookup cannot leave search spinning forever'); }
  finally { global.setTimeout=schedule; }
  console.log('PASS: cheap autocomplete, progress before slow providers, ordered incremental results, successful-cache reuse, partial failures, fragmented streams and account isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
