"use client";
import SelectControl from "./select-control";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Bookmark, Check, LoaderCircle, UserPlus } from "lucide-react";
import PersonPortrait from "./person-portrait";
import { sceneFetch } from "../../lib/auth/client";
import type { Person } from "../../lib/people";
import type { Title } from "../../lib/catalogue";
import type { FollowedPerson, FollowingFeed, PersonPreferences } from "../../lib/people-following";
export type PeopleFollowingProps = {
 accountId: string; follows: FollowedPerson[]; pending: number;
 onFollow: (person: Person, value: boolean) => void;
 onPreferences: (id: number, fields: PersonPreferences) => void;
 onSeen: (ids: number[]) => void;
};
function useFollowing(follows:FollowedPerson[],accountId:string,pending:number,view:"upcoming"|"recent",person:string){
 const [data,setData]=useState<FollowingFeed|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[paging,setPaging]=useState({key:"",page:1}),[retry,setRetry]=useState(0);
 const signature=JSON.stringify(follows),generation=useRef(0),key=accountId+"|"+signature+"|"+view+"|"+person;
 const page=paging.key===key?paging.page:1;
 const current=useRef(key);
 useEffect(()=>{if(current.current!==key){current.current=key;setData(null);setError("");}},[key]);
 useEffect(()=>{
  if(!follows.length||pending>0)return;
  const controller=new AbortController(),run=++generation.current,requestKey=key;
  setBusy(true);setError("");
  const params=new URLSearchParams({view,page:String(page)});if(person!=="all")params.set("person",person);
  sceneFetch("/api/people/following?"+params,{signal:controller.signal,cache:"no-store"},accountId)
   .then(async r=>{const d=await r.json() as FollowingFeed&{error?:string};if(!r.ok)throw Error(d.error||"Updates could not load.");return d;})
   .then(d=>{if(run!==generation.current||controller.signal.aborted||current.current!==requestKey)return;
    setData(old=>({...d,updates:page===1?d.updates:[...(old?.updates||[]),...d.updates.filter(u=>!old?.updates.some(o=>o.title.id===u.title.id))]}));})
   .catch(e=>{if(!controller.signal.aborted&&current.current===requestKey)setError(e.message);})
   .finally(()=>{if(!controller.signal.aborted&&run===generation.current)setBusy(false);});
  return()=>controller.abort();
 },[key,pending===0,page,retry]);
 return {data:current.current===key?data:null,busy,error:current.current===key?error:"",page,more:()=>setPaging({key,page:page+1}),retry:()=>setRetry(n=>n+1)};
}
const displayDate=(date:string)=>new Date(date+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Europe/London"});
export default function PeopleFollowing({accountId,follows,pending,onFollow,onPreferences,onSeen,onChoose,onSearch,onOpen,onSave,isSaved,compact=false,onViewAll}:PeopleFollowingProps&{
 onChoose:(person:Person)=>void;onSearch:()=>void;onOpen:(title:Title)=>void;onSave:(title:Title)=>void;isSaved:(title:Title)=>boolean;compact?:boolean;onViewAll?:()=>void;
}){
 const [view,setView]=useState<"upcoming"|"recent">(compact?"recent":"upcoming"),[person,setPerson]=useState("all");
 useEffect(()=>{if(person!=="all"&&!follows.some(f=>String(f.person.id)===person))setPerson("all");},[follows,person]);
 const feed=useFollowing(follows,accountId,pending,view,person),updates=(feed.data?.updates||[]).slice(0,compact?3:undefined);
 if(!follows.length)return <section className="people-following-empty"><UserPlus size={26}/><h3>Keep up with your favourites</h3><p>Follow actors and directors for upcoming films, new series and recent releases in one place.</p><button className="button secondary" onClick={onSearch}>Find someone to follow <ArrowRight size={16}/></button></section>;
 return <section className={compact?"following-spotlight":"people-following"} aria-label="People you follow">
  <div className="following-heading"><div><p className="eyebrow">YOUR PEOPLE</p><h3>{compact?"From people you follow":"Following"}</h3></div>{compact&&<button className="text-button" onClick={onViewAll}>View all <ArrowRight size={16}/></button>}</div>
  {!compact&&<>
   <div className="following-people">{follows.map(f=><button key={f.person.id} className="following-person" onClick={()=>onChoose(f.person)}><PersonPortrait name={f.person.name} photo={f.person.photo} decorative/><span>{f.person.name}</span>{f.alerts&&<Bell size={13} aria-label="In-app alerts on"/>}</button>)}</div>
   <div className="following-controls"><div className="segmented-control" aria-label="Release period"><button aria-pressed={view==="upcoming"} onClick={()=>setView("upcoming")}>Coming up</button><button aria-pressed={view==="recent"} onClick={()=>setView("recent")}>Recently released {feed.data?.unread?`· ${feed.data.unread} new`:""}</button></div>
   <label>Person<SelectControl value={person} onChange={e=>setPerson(e.target.value)}><option value="all">Everyone I follow</option>{follows.map(f=><option key={f.person.id} value={f.person.id}>{f.person.name}</option>)}</SelectControl></label></div>
  </>}
  <p className="fine-print">{compact?"Released in the last 90 days. ":"Coming up covers the next year; recent releases covers the last 90 days. "}Dates are TMDB release or first-air dates, and may change. regional streaming availability is checked when you open a title. Projects without a date and returning seasons are not included.</p>
  {feed.data?.unread? <div className="following-alert" role="status"><Bell size={17}/><span>{feed.data.unread} new {feed.data.unread===1?"release":"releases"} from people with in-app alerts enabled.</span><button className="text-button" disabled={pending>0} onClick={()=>onSeen(follows.filter(f=>f.alerts&&feed.data?.checkedPeople.includes(f.person.id)).map(f=>f.person.id))}>Mark all read</button></div>:null}
  {pending>0&&<p className="fine-print" role="status">Your changes are syncing. Updates will refresh when saving finishes.</p>}
  <div className="following-grid">{updates.map(u=><article className="following-update" key={u.title.id}>
   <button className="following-update-open" onClick={()=>onOpen(u.title)} aria-label={`Open ${u.title.name}`}>
    {u.title.poster?<img src={u.title.poster} alt="" loading="lazy"/>:<span className="following-no-art">Scene</span>}
    <span className="following-update-copy"><span className="following-date">{displayDate(u.date)} {u.unread&&<strong>New</strong>}</span><strong>{u.title.name}</strong><small>{u.title.kind==="series"?"New series":"Film"} · {u.people.map(p=>`${p.name} (${p.role.toLowerCase()})`).join(", ")}</small></span>
   </button>
   <button className="following-save" aria-label={`${isSaved(u.title)?"Remove":"Save"} ${u.title.name}${isSaved(u.title)?" from":" to"} watchlist`} aria-pressed={isSaved(u.title)} onClick={()=>onSave(u.title)}>{isSaved(u.title)?<Check size={17}/>:<Bookmark size={17}/>}</button>
  </article>)}</div>
  {!feed.busy&&!feed.error&&!updates.length&&pending===0&&<p className="following-none">No {view==="upcoming"?"announced projects with dates in the next year":"releases in the last 90 days"} found for this selection. Your follows are saved.</p>}
  {feed.data?.failedPeople.length? <p className="error-notice">Couldn’t check {feed.data.failedPeople.join(", ")}. <button className="text-button" disabled={feed.busy} onClick={feed.retry}>Retry checks</button></p>:null}
  {feed.error&&<p className="error-notice" role="alert">{feed.error} <button className="text-button" disabled={feed.busy} onClick={feed.retry}>Retry</button></p>}
  {feed.busy&&<p className="following-loading" role="status"><LoaderCircle size={16} className="spin"/> Checking people you follow…</p>}
  {!compact&&feed.data?.hasMore&&!feed.error&&<button className="button secondary" disabled={feed.busy||pending>0} onClick={feed.more}>Load more releases</button>}
  {!compact&&<button className="text-button" onClick={onSearch}>Find more people to follow <ArrowRight size={16}/></button>}
 </section>;
}
export function PersonFollowControls({person,follow,onFollow,onPreferences,limitReached}:Pick<PeopleFollowingProps,"onFollow"|"onPreferences">&{person:Person;follow?:FollowedPerson;limitReached:boolean}){
 return <div className="person-follow-controls"><button className={follow?"button secondary":"button primary"} disabled={!follow&&limitReached} aria-pressed={!!follow} onClick={()=>onFollow(person,!follow)}>{follow?<Check size={16}/>:<UserPlus size={16}/>} {follow?"Following":"Follow"}</button>
  {!follow&&limitReached&&<p className="fine-print">You’re following 20 people. Unfollow someone to add another.</p>}
  {follow&&<div className="person-follow-preferences"><label>Follow their<SelectControl value={follow.role} onChange={e=>onPreferences(person.id,{role:e.target.value as FollowedPerson["role"]})}><option value="all">Acting & directing</option><option value="acting">Acting work</option><option value="directing">Directing work</option></SelectControl></label><label className="following-alert-toggle"><input type="checkbox" checked={follow.alerts} onChange={e=>onPreferences(person.id,{alerts:e.target.checked})}/><span>In-app release alerts<small>Release updates appear inside Scene when this feed is checked.</small></span></label></div>}
 </div>;
}
