"use client";
import { useEffect, useState } from "react";
import { cachedJSON } from "../../lib/client-cache";
import type { Title } from "../../lib/catalogue";
export default function SearchSuggestions({query, accountId, active, onChoose, onSearch}:{query:string;accountId:string;active:boolean;onChoose:(title:Title)=>void;onSearch:(query:string)=>void}) {
  const [state,setState]=useState<{query:string;accountId:string;titles:Title[]}>({query:"",accountId:"",titles:[]});
  const [loadedKey,setLoadedKey]=useState("");
  const [recent,setRecent]=useState<string[]>([]);
  const key='scene.recent-searches.'+accountId;
  useEffect(()=>{try { const data=JSON.parse(sessionStorage.getItem(key)||'[]');setRecent(Array.isArray(data)?data.filter(x=>typeof x==='string').slice(0,6):[]); } catch {setRecent([]);} setLoadedKey(key);setState({query:'',accountId,titles:[]});},[key,active]);
  useEffect(()=>{const q=query.trim();if(!active||q.length<2)return;const controller=new AbortController();const timer=setTimeout(()=>{cachedJSON<{titles:Title[]}>(`/api/search?q=${encodeURIComponent(q)}&scope=all&page=1`,controller.signal).then(data=>{if(!controller.signal.aborted)setState({query:q,accountId,titles:data.titles.slice(0,6)});}).catch(()=>{});},350);return()=>{clearTimeout(timer);controller.abort();};},[query,active,accountId]);
  function remember(value:string){const next=[value,...recent.filter(x=>x.toLowerCase()!==value.toLowerCase())].slice(0,6);setRecent(next);try{sessionStorage.setItem(key,JSON.stringify(next));}catch{}}
  if(!active||loadedKey!==key)return null;
  const matches=state.accountId===accountId&&state.query===query.trim()?state.titles:[];
  if(query.trim().length<2&&!recent.length)return null;
  return <div id="search-suggestions" className="search-suggestions" aria-label="Search suggestions"
    onPointerDown={e=>{
      // Safari can blur the input without focusing the tapped button. Keep the
      // input focused until click selects a result, rather than unmounting it
      // in the parent's blur handler before click is delivered. Keyboard clicks
      // keep their normal behaviour; touch scrolling still uses touch-action.
      if(e.isPrimary && e.button===0)e.preventDefault();
    }}>
    {!query.trim()&&recent.length>0?<><div className="suggestion-heading"><strong>Recent searches</strong><button type="button" onClick={()=>{setRecent([]);try{sessionStorage.removeItem(key);}catch{}}}>Clear</button></div>{recent.map(q=><button type="button" key={q} onClick={()=>onSearch(q)}>{q}</button>)}</>:<>
    {matches.map(t=><button type="button" key={t.id} onClick={()=>{remember(query.trim());onChoose(t);}}><strong>{t.name}</strong><small>{t.year||'Year unknown'} · {t.kind==='movie'?'Film':'TV series'}</small></button>)}
    {query.trim().length>=2&&<button type="button" className="all-search-results" onClick={()=>{remember(query.trim());onSearch(query.trim());}}>Search all results for “{query.trim()}”</button>}</>}
  </div>;
}
