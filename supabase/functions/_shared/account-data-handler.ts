import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import {readAccountDeletion} from './account-data-request.ts';
type Factory=(mode:'admin'|'caller'|'verify',jwt?:string)=>SupabaseClient;
const allowedOrigins=new Set(['https://scene.benlear439.workers.dev','https://scene-streaming.airyokapi2.chatgpt.site','https://scene-streaming.magiclettuce.chatgpt.site']);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handleAccountDeletion(req:Request,client:Factory):Promise<Response>{
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&!allowedOrigins.has(req.headers.get('origin')!))return json({error:'Invalid origin.'},403);
 const body=await readAccountDeletion(req);if(body instanceof Response)return body;
 const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(!jwt||jwt.length>12000)return json({error:'Sign in again to continue.'},401);
 try{
  const admin=client('admin'),caller=client('caller',jwt);
  const {data:{user},error}=await admin.auth.getUser(jwt);
  if(error||!user?.email)return json({error:'Sign in again to continue.'},401);
  const {data:check,error:checkError}=await caller.rpc('scene_account_data',{p_action:'delete-attempt'});
  if(checkError||!check)return json({error:'Your account could not be checked. Sign in again and retry.'},403);
  if(check.canDelete!==true)return json({error:'Another active owner must remain before you can delete this account.'},409);
  if(check.requiresMfa===true)return json({error:'Verify a fresh authenticator code before deleting your account.',code:'MFA_RECENT_REQUIRED'},403);
  if(check.allowed!==true){const r=json({error:'Too many deletion attempts. Try again later.'},429);r.headers.set('Retry-After',String(check.retryAfter||3600));return r;}
  const verifier=client('verify');
  const verified=await verifier.auth.signInWithPassword({email:user.email,password:body.password});
  if(verified.error||verified.data.user?.id!==user.id){
   if(verified.data.session)await verifier.auth.signOut({scope:'local'});
   return json({error:'Your password could not be verified. Check it and try again.'},400);
  }
  // Check the original session again after password verification, including MFA
  // and active membership. The temporary password session is never returned.
  try{
   const {data:latest,error:latestError}=await caller.rpc('scene_account_data',{p_action:'summary'});
   if(latestError||latest?.canDelete!==true||latest?.requiresMfa!==false)return json({error:'Account security changed. Sign in and try again.'},403);
   const revoked=await admin.auth.admin.signOut(jwt,'global');
   if(revoked.error)return json({error:'Sign-out could not finish. Your account has not been deleted.'},503);
   const deleted=await admin.auth.admin.deleteUser(user.id,false);
   if(deleted.error)return json({error:'Deletion could not finish. Sign in again and retry.',code:'SESSION_REVOKED'},503);
   return json({deleted:true});
  }finally{await verifier.auth.signOut({scope:'local'}).catch(()=>{});}
 }catch{return json({error:'Account deletion is temporarily unavailable. Please try again.'},503);}
}
