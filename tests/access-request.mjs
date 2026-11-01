import assert from 'node:assert/strict';
import {readAccessRequest} from '../supabase/functions/_shared/access-request.ts';
import {secureRequest} from '../lib/http-security.ts';
const url='https://scene-streaming.airyokapi2.chatgpt.site/api/access';
const req=(body,headers={'Content-Type':'application/json'})=>new Request(url,{method:'POST',headers,body});
assert.deepEqual(await readAccessRequest(req('{"action":"inspect","token":"fixture"}')), {action:'inspect',token:'fixture'});
assert.deepEqual(await readAccessRequest(req('{"action":"list"}',{'Content-Type':'application/json; charset=utf-8'})),{action:'list'});
for(const payload of ['null','[]','true','12','"string"','{broken','{"action":"unknown"}'])assert.equal((await readAccessRequest(req(payload))).status,400);
assert.equal((await readAccessRequest(req('{}',{'Content-Type':'text/plain'}))).status,415);
assert.equal((await readAccessRequest(req('{}',{'Content-Type':'application/json-bogus'}))).status,415);
assert.equal((await readAccessRequest(req(new Uint8Array([0xff])))).status,400);
// Limits apply to UTF-8 bytes rather than JS character count.
assert.equal((await readAccessRequest(req(JSON.stringify({action:'join',name:'é'.repeat(2600)})))).status,413);
for(const handler of [readAccessRequest,secureRequest]){
 assert.equal((await handler(req('{}',{'Content-Type':'application/json','Content-Length':'5001'}))).status,413);
 let cancelled=false,pulls=0;
 const stream=new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(3000));},cancel(){cancelled=true;}});
 const response=await handler(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'}));
 assert.equal(response.status,413);assert.equal(cancelled,true);assert.ok(pulls<=3,'must stop reading the oversized stream');
}
console.log('PASS: valid access actions, malformed objects/UTF-8, exact JSON content type, byte limits, and early stream cancellation in proxy and Edge parser.');
