import { requireSceneMember } from '../../../lib/auth/server';
import { searchManga } from '../../../lib/manga-source';
export async function GET(request:Request){
 const auth=await requireSceneMember(request);if(auth.error)return auth.error;
 const params=new URL(request.url).searchParams,q=(params.get('q')||'').trim(),page=params.get('page')||'1';
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(q.length>100||q.length===1||/[\u0000-\u001f\u007f]/.test(q)||!/^([1-9]|[1-4]\d|50)$/.test(page))return reply({error:'Use at least two characters and a valid page.'},400);
 try{return reply(await searchManga(q,Number(page)));}catch{return reply({error:'The manga catalogue could not connect. Your saved manga remain available in My manga. Please retry.'},503);}
}
