"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { sceneFetch, getSceneClient } from "../../lib/auth/client";
import { assertSessionBoundary, sessionBoundary, setSessionAccount } from "../../lib/auth/session-boundary";
import { VerifyTwoFactor } from "./two-factor";
type Summary = { canDelete: boolean; requiresMfa: boolean; ownedLists: number; sharedContributions: number };
export default function AccountDataControls({ accountId, pending }: { accountId: string; pending: number }) {
 const [busy,setBusy]=useState<"export"|"review"|"delete"|null>(null),[summary,setSummary]=useState<Summary|null>(null),
  [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{setSummary(null);setPassword("");setConfirmation("");setError("");setNotice("");},[accountId]);
 async function download(){
  if(pending||busy)return;const boundary=sessionBoundary();setBusy("export");setError("");setNotice("");
  try{
   const r=await sceneFetch("/api/account/data?action=export",{cache:"no-store"},accountId);
   if(!r.ok){const d=await r.json() as {error?:string};throw Error(d.error||"Your data could not be downloaded.");}
   const blob=await r.blob();assertSessionBoundary(boundary);
   const url=URL.createObjectURL(blob),a=document.createElement("a");
   a.href=url;a.download="scene-account-data.json";document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice("Your download is ready. Keep this file private: it includes your notes and account details.");
  }catch(e){if(sessionBoundary().epoch===boundary.epoch)setError((e as Error).message||"Your data could not be downloaded.");}
  finally{if(sessionBoundary().epoch===boundary.epoch)setBusy(null);}
 }
 async function review(){
  if(pending||busy)return;const boundary=sessionBoundary();setBusy("review");setError("");setNotice("");
  try{
   const r=await sceneFetch("/api/account/data?action=summary",{cache:"no-store"},accountId),d=await r.json() as Summary & {error?:string};assertSessionBoundary(boundary);
   if(!r.ok)throw Error(d.error||"Your account could not be checked.");
   setSummary(d);setPassword("");setConfirmation("");
  }catch(e){if(sessionBoundary().epoch===boundary.epoch)setError((e as Error).message);}
  finally{if(sessionBoundary().epoch===boundary.epoch)setBusy(null);}
 }
 function cancel(){setSummary(null);setPassword("");setConfirmation("");setError("");}
 async function remove(e:FormEvent){
  e.preventDefault();if(pending||busy||confirmation!=="DELETE"||!password||!summary?.canDelete||summary.requiresMfa)return;
  const boundary=sessionBoundary();setBusy("delete");setError("");
  try{
   const r=await sceneFetch("/api/account/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",password,confirmation})},accountId),d=await r.json() as {deleted?:boolean;error?:string;code?:string};assertSessionBoundary(boundary);
   setPassword("");
   if(!r.ok||d.deleted!==true){
    if(d.code==="MFA_RECENT_REQUIRED")setSummary(s=>s?{...s,requiresMfa:true}:s);
    throw Error(d.error||"Deletion could not be confirmed. Sign in again to check your account.");
   }
   // Clear this account's browser copy and auth storage even if the deleted
   // remote session can no longer complete the normal sign-out request.
   const client=await getSceneClient();assertSessionBoundary(boundary);
   await client.auth.signOut({scope:"local"}).catch(()=>{});
   const current=sessionBoundary();
   if(current.userId!==accountId && !(current.userId===null&&current.epoch===boundary.epoch+1))return;
   if(current.userId===accountId&&current.epoch!==boundary.epoch)return;
   if(sessionBoundary().userId===accountId)setSessionAccount(null);
   for(const key of ["scene.auth.v1","scene.auth.v1-code-verifier","scene.auth.v1-user"]){try{localStorage.removeItem(key);}catch{}}
   location.replace("/?account=deleted");
  }catch(e){if(sessionBoundary().epoch===boundary.epoch){setPassword("");setError((e as Error).message);setBusy(null);}}
 }
 return <div className="account-data-controls">
  <section>
   <h3>Download your data</h3>
   <p>Get a JSON file with your profile, watchlist, ratings, notes, episode and gaming progress, settings, reminders, feedback and your shared-list contributions.</p>
   <p className="fine-print">Passwords, security codes, sign-in tokens and other members’ account details are excluded. This is a data download; importing it back into Scene is not available yet.</p>
   <button className="button secondary" disabled={!!busy||pending>0} onClick={download}>{busy==="export"?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {busy==="export"?"Preparing download…":"Download my data"}</button>
  </section>
  <section className="account-data-danger">
   <h3>Delete your account</h3>
   <p>Permanently remove your Scene account and its active records. Download anything you want to keep first.</p>
   {!summary?<button className="button secondary" disabled={!!busy||pending>0} onClick={review}>{busy==="review"?<LoaderCircle size={16} className="spin"/>:<Trash2 size={16}/>} Review account deletion</button>:<div className="account-data-confirmation">
    {!summary.canDelete?<>
     <p role="status">Your account owns Scene. Another active owner must remain before this account can be deleted. You can still download your data.</p>
     <button className="button secondary" onClick={cancel}>Close</button>
    </>:<>
     <p><strong>This cannot be undone.</strong> Your private library, notes, profile photo, settings, feedback, notification registrations and sign-in sessions will be removed.</p>
     <p>{summary.ownedLists} shared {summary.ownedLists===1?"list you own will":"lists you own will"} be deleted for everyone. Your votes, movie-night choices and {summary.sharedContributions} title {summary.sharedContributions===1?"contribution":"contributions"} in other people’s lists will also be removed.</p>
     <p className="fine-print">Copies already downloaded or shared cannot be recalled. Existing backups and hosting logs follow their providers’ retention. Anonymous performance totals cannot be linked to an account and may remain.</p>
     {summary.requiresMfa?<>
      <VerifyTwoFactor heading="Verify an authenticator code to delete your account" onVerified={()=>void review()}/>
      <button className="button secondary" onClick={cancel}>Keep my account</button>
     </>:<form className="account-form" onSubmit={remove} aria-label="Confirm account deletion">
      <label>Your Scene password<input type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy==="delete"} onChange={e=>setPassword(e.target.value)}/></label>
      <label>Type DELETE to confirm<input value={confirmation} autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={6} disabled={busy==="delete"} onChange={e=>setConfirmation(e.target.value)}/></label>
      <div className="account-data-actions">
       <button className="button secondary" type="button" disabled={busy==="delete"} onClick={cancel}>Keep my account</button>
       <button className="button account-delete-button" disabled={!!busy||pending>0||confirmation!=="DELETE"||!password}>{busy==="delete"?<LoaderCircle size={16} className="spin"/>:<Trash2 size={16}/>} {busy==="delete"?"Deleting account…":"Permanently delete my account"}</button>
      </div>
     </form>}
    </>}
   </div>}
  </section>
  {pending>0&&<p className="fine-print" role="status">Wait for your {pending} pending {pending===1?"change":"changes"} to finish syncing before downloading or deleting your data.</p>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="error-notice" role="alert">{error}</p>}
 </div>;
}
