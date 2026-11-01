// Shared by the Site proxy and the directly reachable Edge Function.
// Bound bytes while reading: Content-Length may be absent or untrustworthy.
export async function readAccessRequest(request: Request): Promise<Record<string, unknown> | Response> {
 const reject=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return reject('Send a JSON request.',415);
 const limit=5000;
 if(Number(request.headers.get('content-length')||0)>limit)return reject('Request too large.',413);
 if(!request.body)return reject('Invalid request.',400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];
 let size=0;
 try {
  while(true){
   const chunk=await reader.read();if(chunk.done)break;
   size+=chunk.value.byteLength;
   if(size>limit){void reader.cancel().catch(()=>{});return reject('Request too large.',413);}
   chunks.push(chunk.value);
  }
 }catch{return reject('Invalid request.',400);}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{
  const body:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!body||typeof body!=='object'||Array.isArray(body))return reject('Send a JSON object.',400);
  const data=body as Record<string,unknown>;
  if(typeof data.action!=='string'||!['inspect','join','list','invite','revoke','cancel-invite'].includes(data.action))return reject('Unknown access action.',400);
  return data;
 }catch{return reject('Invalid request.',400);}
}
