import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {buildPushPayload} from 'npm:@block65/webcrypto-web-push@2.0.0';
const allowed=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&!u.search&&/^(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|([a-z0-9-]+\.)?push\.apple\.com)$/.test(u.hostname);}catch{return false;}};
async function equalSecret(a:string,b:string){const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));const [x,y]=await Promise.all([digest(a),digest(b)]);return x.reduce((n,v,i)=>n|(v^y[i]),0)===0;}
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const secret=req.headers.get('x-scene-worker')||'';if(secret.length!==64)return reply({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const config=await db.rpc('scene_release_worker_config');if(config.error||!config.data?.scene_push_worker_secret)return reply({error:'Worker not configured'},503);
 if(!await equalSecret(secret,config.data.scene_push_worker_secret))return reply({error:'Unauthorized'},401);
 const claimed=await db.rpc('scene_claim_release_pushes');if(claimed.error)return reply({error:'Queue unavailable'},503);
 let sent=0,failed=0;
 const items=claimed.data||[];
 for(let offset=0;offset<items.length;offset+=4)await Promise.all(items.slice(offset,offset+4).map(async(item:any)=>{
  let status=0;
  try{
   // Recheck consent and access immediately before handing the message to a push service.
   const [follow,member,release,device]=await Promise.all([db.from('scene_release_reminders').select('release_id').eq('user_id',item.userId).eq('release_id',item.releaseId).maybeSingle(),db.from('scene_members').select('active').eq('user_id',item.userId).maybeSingle(),db.from('scene_releases').select('active,release_date').eq('id',item.releaseId).maybeSingle(),db.from('scene_push_subscriptions').select('id').eq('id',item.subscriptionId).maybeSingle()]);
   if(follow.error||member.error||release.error||device.error)throw Error('Consent check failed');
   if(!follow.data||!member.data?.active||!release.data?.active||release.data.release_date!==item.date||!device.data){status=204;}
   else if(!allowed(item.endpoint)){status=410;}
   else{
    const payload=await buildPushPayload({data:JSON.stringify({type:'scene-release-day'}),options:{ttl:3600}},{endpoint:item.endpoint,expirationTime:null,keys:item.keys},{subject:'https://scene-streaming.airyokapi2.chatgpt.site',publicKey:config.data.scene_push_vapid_public,privateKey:config.data.scene_push_vapid_private});
    const response=await fetch(item.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10000)});status=response.status;await response.body?.cancel();
    if(response.ok)sent++;else failed++;
   }
  }catch{failed++;}
  const finished=await db.rpc('scene_finish_release_push',{p_subscription:item.subscriptionId,p_release:item.releaseId,p_date:item.date,p_status:status});if(finished.error)failed++;
 }));
 const availability=await db.rpc('scene_claim_availability_pushes');
 if(availability.error)failed++;
 const updates=availability.data||[];
 for(let offset=0;offset<updates.length;offset+=4)await Promise.all(updates.slice(offset,offset+4).map(async(item:any)=>{
  let status=0;const claim={p_event:item.eventId,p_subscription:item.subscriptionId,p_claim:item.claim};
  try{
   const consent=await db.rpc('scene_can_send_availability',claim);if(consent.error)throw Error('Consent check failed');
   if(consent.data!==true)status=204;
   else if(!allowed(item.endpoint))status=410;
   else{
    const payload=await buildPushPayload({data:JSON.stringify({type:'scene-now-streaming'}),options:{ttl:3600}},{endpoint:item.endpoint,expirationTime:null,keys:item.keys},{subject:'https://scene-streaming.airyokapi2.chatgpt.site',publicKey:config.data.scene_push_vapid_public,privateKey:config.data.scene_push_vapid_private});
    const response=await fetch(item.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10000)});status=response.status;await response.body?.cancel();if(response.ok)sent++;else failed++;
   }
  }catch{failed++;}
  const finished=await db.rpc('scene_finish_availability_push',{...claim,p_status:status});if(finished.error)failed++;
 }));
 await db.rpc('scene_release_worker_heartbeat',{p_sent:sent,p_failed:failed});
 return reply({claimed:(claimed.data?.length||0)+updates.length,sent,failed});
});
