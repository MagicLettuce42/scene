"use client";
import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { sceneFetch } from '../../lib/auth/client';
import { mergeUpdates, readUpdateIds, updateReadKey, type UpdateSources, type SceneUpdate } from '../../lib/updates';
import type { Title } from '../../lib/catalogue';
export function useSceneUpdates(accountId:string){
 const [sources,setSources]=useState<UpdateSources>({}),[read,setRead]=useState<string[]>([]),[errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0),[page,setPage]=useState(1);
 const account=useRef(accountId);account.current=accountId;
 useEffect(()=>{setSources({});setPage(1);setRead(readUpdateIds(localStorageSafe(updateReadKey(accountId))));},[accountId]);
 useEffect(()=>{const abort=new AbortController();setBusy(true);setErrors([]);
 const requests=[['availability','/api/availability-alerts','Availability alerts'],['reminders','/api/reminders','Release reminders'],['people',`/api/people/following?view=recent&page=${page}`,'People updates']] as const;
 void Promise.allSettled(requests.map(async([key,url,label])=>{try{const response=await sceneFetch(url,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)]),cache:'no-store'},accountId);const data=await response.json();if(!response.ok)throw Error(label);if(abort.signal.aborted||account.current!==accountId)return;setSources(old=>({...old,[key]:data}));}catch{if(!abort.signal.aborted&&account.current===accountId)setErrors(old=>[...old,label]);}})).finally(()=>{if(!abort.signal.aborted&&account.current===accountId)setBusy(false);});
 return()=>abort.abort();},[accountId,revision,page]);
 useEffect(()=>{let last=Date.now();const refresh=()=>{if(document.visibilityState==='visible'&&Date.now()-last>300000){last=Date.now();setRevision(n=>n+1);}};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[]);
 const rows=mergeUpdates(sources,read);
 function mark(ids:string[]){setRead(old=>{const next=[...new Set([...old,...ids])].slice(-500);try{localStorage.setItem(updateReadKey(accountId),JSON.stringify(next));}catch{}return next;});}
 return {rows,busy,errors,unread:rows.filter(r=>r.fresh).length,mark,refresh:()=>setRevision(n=>n+1),page,hasMore:sources.people?.hasMore||false,next:()=>setPage(n=>n+1),previous:()=>setPage(n=>Math.max(1,n-1)),partialPeople:sources.people?.failedPeople.length||0};
}
function localStorageSafe(key:string){try{return localStorage.getItem(key);}catch{return null;}}
export default function UpdatesInbox({updates,onOpen,onUpcoming,onSettings}:{updates:ReturnType<typeof useSceneUpdates>;onOpen:(t:Title)=>void;onUpcoming:()=>void;onSettings:()=>void}){
 const [filter,setFilter]=useState('all');const shown=updates.rows.filter(r=>filter==='all'||r.kind===filter);
 function open(row:SceneUpdate){updates.mark([row.id]);row.title?onOpen(row.title):onUpcoming();}
 return <section className="updates-inbox"><h2 id="dialog-title"><Bell size={24}/> Your updates</h2><p>Availability, release reminders and people you follow, together.</p><div className="updates-controls"><button className="button secondary" disabled={updates.busy} onClick={updates.refresh}><RefreshCw size={16}/>Refresh</button><button className="text-button" disabled={!updates.unread} onClick={()=>updates.mark(updates.rows.map(r=>r.id))}><CheckCheck size={17}/>Mark shown updates read</button></div><div className="updates-tabs" role="group" aria-label="Update type">{[['all','All'],['availability','Streaming'],['release','Reminders'],['people','People']].map(([id,name])=><button key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{name}</button>)}</div>
 {updates.busy&&<p role="status">Checking your updates…</p>}{(updates.errors.length>0||updates.partialPeople>0)&&<p role="alert">{updates.errors.length?`${updates.errors.join(', ')} could not load. `:''}{updates.partialPeople?'Some followed people could not be checked. ':''}Other updates are still shown. Use Refresh to retry.</p>}
 {!shown.length&&!updates.busy&&<div className="quiet-empty"><Bell size={28}/><h3>No updates to show yet</h3><p>Save titles, set release reminders or follow actors and directors to get updates here.</p><button className="button secondary" onClick={onSettings}>Manage alerts</button></div>}
 <div className="updates-list">{shown.map(row=><article className={row.fresh?'unread':''} key={row.id}><button onClick={()=>open(row)}><span className="update-date">{row.date.slice(0,10)}{row.fresh?' · New':''}</span><strong>{row.name}</strong><span>{row.description}</span></button>{row.fresh&&<button className="text-button" aria-label={`Mark ${row.name} update read`} onClick={()=>updates.mark([row.id])}>Mark read</button>}</article>)}</div>
 {(filter==='all'||filter==='people')&&(updates.page>1||updates.hasMore)&&<div className="inline-actions"><button className="button secondary" disabled={updates.busy||updates.page===1} onClick={updates.previous}>Previous people updates</button><button className="button secondary" disabled={updates.busy||!updates.hasMore} onClick={updates.next}>More people updates</button></div>}<p className="fine-print">Read marks are saved on this device. The badge counts new updates currently shown. Marking read keeps your reminders active.</p></section>;
}
