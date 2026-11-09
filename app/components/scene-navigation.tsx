"use client";
import { useEffect, useRef, useState } from "react";
import { Home, Film, Tv, Gamepad2, CalendarDays, Bookmark, Search, MoreHorizontal, Settings, X, Bell, BookOpen } from "lucide-react";
import type { View } from "../../lib/tab-memory";
import SceneWordmark from "./scene-wordmark";
import ProfileAvatar from "./profile-avatar";
export type SceneNavigationProps = {
  view: View; submitted: boolean; gamingEnabled: boolean; ready: boolean;
  unreadCount?: number; onUpdates?: () => void;
  savedCount: number; photo: string | null; name: string;
  onNavigate: (view: View) => void; onSearch: () => void; onAccount: () => void;
};
const destinations = [
  {id:"discover",label:"Discover",Icon:Home}, {id:"films",label:"Films",Icon:Film},
  {id:"series",label:"TV series",Icon:Tv}, {id:"gaming",label:"Gaming",Icon:Gamepad2},
  {id:"manga",label:"Manga",Icon:BookOpen}, {id:"upcoming",label:"Upcoming",Icon:CalendarDays}, {id:"watchlist",label:"Watchlist",Icon:Bookmark},
] as const;
export default function SceneNavigation(props: SceneNavigationProps) {
  const [open,setOpen]=useState(false), more=useRef<HTMLButtonElement>(null);
  const tabs=destinations.filter(t=>t.id!=="gaming"||props.gamingEnabled);
  useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);more.current?.focus();}};document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);},[open]);
  const navigate=(view:View)=>{setOpen(false);props.onNavigate(view);};
  const account=()=>{setOpen(false);props.onAccount();};
  return <>
    <header className="site-header daylight-header">
      <div className="header-inner">
        <button className="brand" onClick={()=>navigate("discover")} aria-label="Scene home"><SceneWordmark decorative/></button>
        <nav className="desktop-nav" aria-label="Main navigation">{tabs.map(t=><button key={t.id} className={props.view===t.id?"active":""} aria-current={props.view===t.id?"page":undefined} onClick={()=>navigate(t.id)}><t.Icon size={22}/><span>{t.label}</span>{t.id==="watchlist"&&props.savedCount>0&&<span className="count">{props.savedCount}</span>}</button>)}</nav>
        <div className="header-actions">{props.onUpdates&&<button className="daylight-updates-button" disabled={!props.ready} onClick={()=>{setOpen(false);props.onUpdates?.();}} aria-label={`Your updates${props.unreadCount ? `, ${props.unreadCount} new` : ""}`}><Bell size={21}/><span>Updates</span>{Boolean(props.unreadCount)&&<b>{props.unreadCount!>99?"99+":props.unreadCount}</b>}</button>}<button className="daylight-settings" disabled={!props.ready} onClick={account} aria-label="Your Scene account and settings"><ProfileAvatar photo={props.photo} name={props.name}/><span><strong>Account & settings</strong><small>{props.name}</small></span><Settings size={18}/></button></div>
      </div>
    </header>
    <nav className="mobile-nav daylight-mobile-nav" aria-label="Mobile navigation">
      <button onClick={()=>navigate("discover")} className={props.view==="discover"&&!props.submitted?"active":""} aria-current={props.view==="discover"&&!props.submitted?"page":undefined}><Home size={23}/><span>Discover</span></button>
      <button onClick={props.onSearch} className={props.submitted?"active":""} aria-current={props.submitted?"page":undefined}><Search size={23}/><span>Search</span></button>
      <button onClick={()=>navigate("watchlist")} className={props.view==="watchlist"&&!props.submitted?"active":""} aria-current={props.view==="watchlist"&&!props.submitted?"page":undefined}><Bookmark size={23}/><span>Watchlist</span></button>
      <button ref={more} onClick={()=>setOpen(x=>!x)} className={open||["films","series","gaming","manga","upcoming"].includes(props.view)?"active":""} aria-expanded={open} aria-controls="scene-more-navigation"><MoreHorizontal size={23}/><span>More</span></button>
    </nav>
    {open&&<><button className="daylight-nav-backdrop" aria-label="Close navigation menu" onClick={()=>setOpen(false)}/><nav id="scene-more-navigation" className="daylight-more-menu" aria-label="More navigation"><div><strong>Explore Scene</strong><button aria-label="Close navigation menu" onClick={()=>{setOpen(false);more.current?.focus();}}><X size={20}/></button></div>{tabs.filter(t=>t.id!=="discover"&&t.id!=="watchlist").map(t=><button key={t.id} className={props.view===t.id?"active":""} onClick={()=>navigate(t.id)}><t.Icon size={21}/>{t.label}</button>)}<button disabled={!props.ready} onClick={account}><Settings size={21}/>Account & settings</button></nav></>}
  </>;
}
