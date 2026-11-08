"use client";
import type { Title } from "../../lib/catalogue";
import { ArrowUpRight } from "lucide-react";
import { Poster } from "./catalogue-cards";
export default function DaylightWatchlist({titles,onOpen,onViewAll}:{titles:Title[];onOpen:(title:Title)=>void;onViewAll:()=>void}) {
  if(!titles.length)return null;
  return <section className="daylight-watchlist" aria-labelledby="next-on-watchlist"><div className="discover-heading"><h3 id="next-on-watchlist">Next on your watchlist</h3><button className="text-button" onClick={onViewAll}>View all <ArrowUpRight size={16}/></button></div><div className="daylight-watchlist-row">{titles.slice(0,2).map(t=><button key={t.id} onClick={()=>onOpen(t)}><span className="daylight-watchlist-art"><Poster title={{...t,poster:t.backdrop||t.poster}} decorative/></span><span><strong>{t.name}</strong><small>{t.year||"Year unknown"} · {t.kind==="movie"?"Film":"TV series"}</small></span></button>)}</div></section>;
}
