"use client";
import { useEffect, useState } from "react";
import { cachedJSON } from "../../lib/client-cache";
import type { Title } from "../../lib/catalogue";
import { filterTitles } from "../../lib/catalogue";
export default function SearchSuggestions({query, accountId, selected, active, onChoose, onSearch}:{query:string;accountId:string;selected:string[];active:boolean;onChoose:(title:Title)=>void;onSearch:(query:string)=>void}) {
  const [state,setState]=useState<{query:string;accountId:string;titles:Title[]}>({query:"",accountId:"",titles:[]});
  const [loadedKey,setLoadedKey]=useState("");
  const [recent,setRecent]=useState<string[]>([]);
  const key='scene.recent-searches.'+accountId;
  useEffect(()=>{try { const data=JSON.parse(sessionStorage.getItem(key)||'[]');setRecent(Array.isArray(data)?data.filter(x=>typeof x==='string').slice(0,6):[]); } catch {setRecent([]);} setLoadedKey(key);setState({query:'',accountId,titles:[]});},[key,active]);
  useEffect(()=>{const q=query.trim();if(!active||q.length<2)return;const controller=new AbortController();const timer=setTimeout(()=>{cachedJSON<{titles:Title[]}>(`/api/search?q=${encodeURIComponent(q)}&scope=services&page=1`,controller.signal).then(data=>{if(!controller.signal.aborted)setState({query:q,accountId,titles:data.titles});}).catch(()=>{});},350);return()=>{clearTimeout(timer);controller.abort();};},[query,active,accountId]);
  function remember(value:string){const next=[value,...recent.filter(x=>x.toLowerCase()!==value.toLowerCase())].slice(0,6);setRecent(next);try{sessionStorage.setItem(key,JSON.stringify(next));}catch{}}
  if(!active||loadedKey!==key)return null;
  const matches=state.accountId===accountId&&state.query===query.trim()?filterTitles(state.titles,{kind:'all',genre:'all',offer:'all',provider:'all',mine:true,selected}).slice(0,6):[];
  if(query.trim().length<2&&!recent.length)return null;
  return <div id="search-suggestions" className="search-suggestions" aria-label="Search suggestions" onKeyDown={event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !buttons.length) return;
    event.preventDefault();
    buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
  }}>
    {!query.trim()&&recent.length>0?<><div className="suggestion-heading"><strong>Recent searches</strong><button type="button" onClick={()=>{setRecent([]);try{sessionStorage.removeItem(key);}catch{}}}>Clear</button></div>{recent.map(q=><button type="button" key={q} onClick={()=>onSearch(q)}>{q}</button>)}</>:<>
    {matches.map(t=><button type="button" key={t.id} onClick={()=>{remember(query.trim());onChoose(t);}}><strong>{t.name}</strong><small>{t.year||'Year unknown'} · {t.kind==='movie'?'Film':'TV series'}</small></button>)}
    {query.trim().length>=2&&<button type="button" className="all-search-results" onClick={()=>{remember(query.trim());onSearch(query.trim());}}>Search my services for “{query.trim()}”</button>}</>}
  </div>;
}
