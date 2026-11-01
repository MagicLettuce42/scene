const assert=require('node:assert/strict');
const {secureRequest,secureResponse}=require('/tmp/scene-security-tests/lib/http-security.js');
const url='https://scene-streaming.airyokapi2.chatgpt.site/api/library';
(async()=>{
 assert.equal((await secureRequest(new Request(url,{headers:{Origin:'https://evil.example'}}))).status,403);
 assert.equal((await secureRequest(new Request(url,{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403);
 assert.equal((await secureRequest(new Request(url,{method:'DELETE'}))).status,405);
 assert.equal((await secureRequest(new Request(url,{method:'POST',body:'x'}))).status,415);
 assert.equal((await secureRequest(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(800001)}))).status,413);
 const chunks=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(500000));controller.enqueue(new Uint8Array(500000));controller.close();}});
 assert.equal((await secureRequest(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:chunks,duplex:'half'}))).status,413);
 const allowed=await secureRequest(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(url).origin},body:'{"test":true}'}));assert.ok(allowed instanceof Request);assert.deepEqual(await allowed.json(),{test:true});
 const response=secureResponse(new Request(url),Response.json({ok:true}));
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'self' https:\/\/chatgpt.com/);assert.match(response.headers.get('Strict-Transport-Security'),/31536000/);
 console.log('PASS: origin/method/content-type checks, declared and streamed oversized bodies, legitimate JSON, no-store and browser security headers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
