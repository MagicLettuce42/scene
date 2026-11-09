import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {refreshCatalogue,type Hint} from '../_shared/watchlist-catalogue.ts';
async function same(a:string,b:string){const digest=async(x:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));const [x,y]=await Promise.all([digest(a),digest(b)]);return x.reduce((n,v,i)=>n|(v^y[i]),0)===0;}
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const secret=req.headers.get('x-scene-worker')||'';if(secret.length!==64)return reply({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const config=await db.rpc('scene_watchlist_worker_config');if(config.error||!config.data?.scene_watchlist_worker_secret)return reply({error:'Not configured'},503);
 if(!await same(secret,config.data.scene_watchlist_worker_secret))return reply({error:'Unauthorized'},401);
 let input:any;try{const raw=await req.text();if(raw.length>2000)throw Error();input=raw?JSON.parse(raw):{};if(!input||typeof input!=='object')throw Error();}catch{return reply({error:'Invalid request'},400);}
 if(input.action==='configure'){
  if(typeof input.apiKey!=='string'||input.apiKey.length<20||input.apiKey.length>500)return reply({error:'Invalid configuration'},400);
  try{const test=await fetch('https://api.themoviedb.org/3/configuration?api_key='+encodeURIComponent(input.apiKey),{signal:AbortSignal.timeout(12000)});if(!test.ok)return reply({error:'Catalogue credential rejected'},422);await test.body?.cancel();const saved=await db.rpc('scene_configure_watchlist_worker',{p_api_key:input.apiKey});return saved.error?reply({error:'Configuration could not save'},503):reply({configured:true});}catch{return reply({error:'Catalogue unavailable'},503);}
 }
 const key=config.data.scene_watchlist_tmdb_key;if(!key)return reply({error:'Catalogue configuration required'},503);
 const claimed=await db.rpc('scene_claim_watchlist_checks');if(claimed.error)return reply({error:'Queue unavailable'},503);
 const pending=new Map<string,Promise<any>>();let next=0;
 const request=(path:string,params:Record<string,string>={})=>{const query=new URLSearchParams({language:'en-GB',...params}),cacheKey=path+'?'+query;if(pending.has(cacheKey))return pending.get(cacheKey)!;
 const job=(async()=>{const start=Math.max(Date.now(),next);next=start+150;if(start>Date.now())await new Promise(r=>setTimeout(r,start-Date.now()));query.set('api_key',key);for(let attempt=0;attempt<2;attempt++){const response=await fetch('https://api.themoviedb.org/3/'+path+'?'+query,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(response.status===429&&attempt===0){const delay=Number(response.headers.get('retry-after')||'1');await response.body?.cancel();if(delay>=0&&delay<=3){await new Promise(r=>setTimeout(r,Math.max(1,delay)*1000));continue;}throw Error('Rate limited');}if(!response.ok){await response.body?.cancel();throw Error('Catalogue unavailable');}return await response.json();}throw Error('Catalogue unavailable');})();pending.set(cacheKey,job);return job;};
 let checked=0,failed=0;const rows=claimed.data||[];const byTitle=new Map<string,Promise<any>>();
 for(let i=0;i<rows.length;i+=8)await Promise.all(rows.slice(i,i+8).map(async(row:any)=>{let title=null;try{const library=await db.from("scene_libraries").select("payload").eq("user_id",row.user_id).maybeSingle();if(library.error)throw Error("Account unavailable");const region=library.data?.payload?.preferences?.region==="US"?"US":"GB";const k=region+":"+row.title_key;if(!byTitle.has(k))byTitle.set(k,refreshCatalogue(row.hint as Hint,request,region));title=await byTitle.get(k);}catch{/* Keep the last successful snapshot, with a retry marker. */}const saved=await db.rpc('scene_finish_watchlist_check',{p_user:row.user_id,p_key:row.title_key,p_attempt:row.attempted_at,p_title:title});if(saved.error||!title)failed++;else checked++;}));
 await db.rpc('scene_watchlist_worker_heartbeat',{p_checked:checked,p_failed:failed});return reply({claimed:rows.length,checked,failed});
});
