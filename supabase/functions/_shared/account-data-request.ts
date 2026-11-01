// Bound requests at both the Site proxy and the independently reachable function.
export async function readAccountDeletion(request: Request): Promise<{ action: "delete"; password: string; confirmation: "DELETE" } | Response> {
 const reject=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return reject('Send a JSON request.',415);
 if(Number(request.headers.get('content-length')||0)>2048)return reject('Request too large.',413);
 if(!request.body)return reject('Invalid request.',400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>2048){void reader.cancel().catch(()=>{});return reject('Request too large.',413);}chunks.push(c.value);}}
 catch{return reject('Invalid request.',400);}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['action','password','confirmation'].includes(k))||v.action!=='delete'||v.confirmation!=='DELETE'||typeof v.password!=='string'||!v.password.length||v.password.length>128)return reject('Enter your password and type DELETE to confirm.',400);
  return {action:'delete',password:v.password,confirmation:'DELETE'};
 }catch{return reject('Invalid request.',400);}
}
