import { requireSceneMember } from "../../../../lib/auth/server";
import { followedPeopleTMDB, hasTMDB } from "../../../../lib/tmdb";
import { readFollows } from "../../../../lib/people-following";
import type { LibraryDocument } from "../../../../lib/library-state";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:Request){
 const auth=await requireSceneMember(req);if(auth.error)return auth.error;
 const q=new URL(req.url).searchParams,view=q.get("view")||"upcoming",rawPage=q.get("page")||"1",rawPerson=q.get("person"),page=Number(rawPage),person=rawPerson?Number(rawPerson):undefined;
 if(!["upcoming","recent"].includes(view)||!/^\d+$/.test(rawPage)||!Number.isSafeInteger(page)||page<1||page>200||(rawPerson!==null&&(!/^[1-9]\d*$/.test(rawPerson)||!Number.isSafeInteger(person)||person!>2147483647)))return reply({error:"Invalid following request."},400);
 const {data,error}=await auth.client.from("scene_libraries").select("payload").eq("user_id",auth.user.id).maybeSingle();
 if(error)return reply({error:"Your follows could not load. Please try again."},503);
 const doc=(data?.payload||{}) as LibraryDocument,follows=readFollows(doc.preferences?.followedPeople);
 if(person&&!follows.some(f=>f.person.id===person))return reply({error:"Follow this person before opening their updates."},400);
 if(!follows.length)return reply({updates:[],page,hasMore:false,unread:0,failedPeople:[],checkedPeople:[],checkedAt:new Date().toISOString(),total:0});
 if(!hasTMDB())return reply({error:"People updates are temporarily unavailable."},503);
 try{return reply(await followedPeopleTMDB(follows,Object.values(doc.entries||{}).filter(e=>e.hidden).map(e=>e.title.tmdbId?`tmdb-${e.title.kind==="movie"?"movie":"tv"}-${e.title.tmdbId}`:e.title.id),view as "upcoming"|"recent",page,person));}
 catch{return reply({error:"People updates could not load. Please try again."},503);}
}
