import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {readAccessRequest} from '../_shared/access-request.ts';
import {invitedEmailMatches,privateAccessResponse} from '../_shared/access-privacy.ts';
const origin='https://scene.benlear439.workers.dev';
const allowedOrigins=new Set(['https://scene.benlear439.workers.dev','https://scene-streaming.airyokapi2.chatgpt.site','https://scene-streaming.magiclettuce.chatgpt.site']);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&!allowedOrigins.has(req.headers.get('origin')!))return json({error:'Invalid origin.'},403);
 const body=await readAccessRequest(req);if(body instanceof Response)return body;
 const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(body.action==='inspect'||body.action==='join'){
   if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'This invitation is invalid or expired.'},400);
   const tokenHash=await hash(body.token),{data:invite,error}=await admin.from('scene_invites').select('email,role,expires_at,claimed_at').eq('token_hash',tokenHash).maybeSingle();
   if(error)throw error;
   if(!invite||invite.claimed_at||Date.parse(invite.expires_at)<=Date.now())return json({error:'This invitation is invalid, expired or already used. Sign in if you have completed setup.'},400);
   if(body.action==='inspect')return json(privateAccessResponse('inspect',{expiresAt:invite.expires_at}));
   if(!invitedEmailMatches(body.email,invite.email))return json({error:'Enter the email address used for this invitation.'},400);
   const name=typeof body.name==='string'?body.name.trim():'';
   if(name.length<1||name.length>80||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return json({error:'Enter your name and a password of 12–128 characters.'},400);
   const {data:existing,error:lookupError}=await admin.from('scene_members').select('user_id').eq('email',invite.email).maybeSingle();if(lookupError)throw lookupError;
   let userId=existing?.user_id,created=false;
   if(!userId){
    const result=await admin.auth.admin.createUser({email:invite.email,password:body.password,email_confirm:true});
    if(result.error||!result.data.user)return json({error:'This account could not be created. Ask the person who invited you for help.'},400);
    userId=result.data.user.id;created=true;
   }
   const accepted=await admin.rpc('scene_redeem_invite',{p_hash:tokenHash,p_user_id:userId,p_email:invite.email,p_name:name});
   if(accepted.error){if(created)await admin.auth.admin.deleteUser(userId);return json({error:'The invitation could not be accepted. It may already have been used.'},409);}
   if(!created){const changed=await admin.auth.admin.updateUserById(userId,{password:body.password});if(changed.error)return json({error:'Your password could not be updated. Ask the owner for a fresh invitation.'},503);}
   return json(privateAccessResponse('join',{accepted:true}));
  }
  const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!jwt)return json({error:'Sign in to continue.'},401);
  const {data:{user},error:authError}=await admin.auth.getUser(jwt);if(authError||!user)return json({error:'Sign in to continue.'},401);
  const {data:member,error:memberError}=await admin.from('scene_members').select('role,active').eq('user_id',user.id).maybeSingle();
  if(memberError)throw memberError;if(!member?.active||member.role!=='owner')return json({error:'Only the Scene owner can manage access.'},403);
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+jwt}}});
  const {data:security,error:securityError}=await caller.rpc('scene_security_state');
  if(securityError||!security)return json({error:'Account security could not be checked.'},503);
  if(!security.sessionValid)return json({error:'This session has ended. Sign in again.',code:'SESSION_REVOKED'},401);
  if(security.adminReady!==true)return json({error:'Verify an authenticator code to manage people and invitations. Verification lasts 10 minutes.',code:'MFA_RECENT_REQUIRED'},403);
  const quota=await caller.rpc('scene_consume_api_limit',{p_bucket:'admin'});if(quota.error)return json({error:'Request limits could not be checked.'},503);
  if(quota.data?.allowed!==true){const response=json({error:'Too many access-management requests. Wait a moment before trying again.'},429);response.headers.set('Retry-After',String(quota.data?.retryAfter||60));return response;}
  if(body.action==='list'){
   const [members,invites]=await Promise.all([admin.from('scene_members').select('user_id,display_name,role,active').order('created_at'),admin.from('scene_invites').select('token_hash,expires_at').is('claimed_at',null).gt('expires_at',new Date().toISOString()).order('created_at')]);
   if(members.error||invites.error)throw Error('Access list unavailable');return json(privateAccessResponse('list',{members:members.data,invites:invites.data}));
  }
  if(body.action==='invite'){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Enter a valid email address.'},400);
   const {count}=await admin.from('scene_members').select('*',{count:'exact',head:true});if((count||0)>=50)return json({error:'Scene currently supports up to 50 members.'},400);
   const value=token(),tokenHash=await hash(value),expires=new Date(Date.now()+7*86400000).toISOString();
   const old=await admin.from('scene_invites').delete().eq('email',email).is('claimed_at',null);if(old.error)throw old.error;
   const result=await admin.from('scene_invites').insert({token_hash:tokenHash,email,role:'member',expires_at:expires});if(result.error)throw result.error;
   return json(privateAccessResponse('invite',{url:origin+'/#invite='+value,expiresAt:expires}));
  }
  if(body.action==='revoke'){
   if(typeof body.userId!=='string'||body.userId===user.id)return json({error:'You cannot remove your own access.'},400);
   const result=await admin.rpc('scene_revoke_member',{p_user_id:body.userId});if(result.error)return json({error:'This member could not be removed.'},400);return json({revoked:true});
  }
  if(body.action==='cancel-invite'){
   if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))return json({error:'Invalid invitation.'},400);
   const result=await admin.from('scene_invites').delete().eq('token_hash',body.id).is('claimed_at',null);if(result.error)throw result.error;return json({cancelled:true});
  }
  return json({error:'Unknown access action.'},400);
 }catch{return json({error:'Account access is temporarily unavailable. Please try again.'},503);}
});
