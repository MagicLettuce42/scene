"use client";
import { X, Check, SlidersHorizontal } from "lucide-react";
import { services } from "../../lib/catalogue";
export default function ServiceScope({selected, provider, disabled, onChange, onManage, history = false, compact = false}: {
  selected: string[]; provider: string; disabled: boolean; onChange:(value:string)=>void; onManage:()=>void; history?:boolean; compact?:boolean;
}) {
  const chosen=services.filter(s=>selected.includes(s.key));
  const content = <>
    <div className="service-scope-heading"><strong>Streaming services</strong><button type="button" className="text-button" onClick={onManage}>Edit my services</button></div>
    <div className="service-scope-chips" role="group" aria-label="Choose a service">
      <button className={`filter-button ${provider==='mine'?'active':''}`} aria-pressed={provider==='mine'} disabled={disabled||!chosen.length} onClick={()=>onChange('mine')}>{provider==='mine'&&<Check size={15}/>}My services</button>
      {chosen.map(s=><button key={s.key} className={`filter-button ${provider===s.key?'active':''}`} aria-pressed={provider===s.key}
        aria-label={provider===s.key?`Clear ${s.name} filter`:`Filter by ${s.name}`} disabled={disabled} onClick={()=>onChange(provider===s.key?'mine':s.key)}>
        {s.name}{provider===s.key&&<X size={15}/>}</button>)}
    </div>
    <p className="fine-print">{history && provider==='mine' ? 'Your saved history includes titles no longer on your services.' : 'Showing titles included with your subscriptions or available free.'}</p>
  </>;
  return compact ? <details className="service-scope service-scope-compact"><summary><span><SlidersHorizontal size={16}/>Streaming services</span><span>{provider === "mine" ? "All my services" : services.find(s => s.key === provider)?.name}</span></summary>{content}</details> : <section className="service-scope" aria-label="Filter by streaming service">{content}</section>;
}
