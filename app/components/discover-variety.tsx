"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {sameTitle,type Title} from '../../lib/catalogue';
import {titleKey} from '../../lib/library-state';
type Registry=Record<string,Title[]>;
const Context=createContext<{order:string[];rows:Registry;report:(id:string,titles:Title[])=>void}|null>(null);
export function uniqueDiscoverTitles<T>(items:T[],previous:Title[],title:(item:T)=>Title):T[]{const seen=[...previous];return items.filter(item=>{const t=title(item);if(seen.some(old=>sameTitle(old,t)))return false;seen.push(t);return true;});}
export function DiscoverVariety({order,children}:{order:string[];children:ReactNode}){
 const [rows,setRows]=useState<Registry>({});
 const report=useCallback((id:string,titles:Title[])=>setRows(old=>JSON.stringify((old[id]||[]).map(titleKey))===JSON.stringify(titles.map(titleKey))?old:{...old,[id]:titles}),[]);
 const value=useMemo(()=>({order,rows,report}),[order.join('|'),rows,report]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDiscoverVariety<T>(id:string,items:T[],title:(item:T)=>Title,limit=6){
 const context=useContext(Context),index=context?.order.indexOf(id)??-1;
 const previous=context&&index>=0?context.order.slice(0,index).flatMap(key=>context.rows[key]||[]):[];
 const unique=context?uniqueDiscoverTitles(items,previous,title):items;
 const visible=unique.slice(0,limit),signature=JSON.stringify(visible.map(item=>titleKey(title(item))));
 const report=context?.report;
 useEffect(()=>{report?.(id,visible.map(title));},[report,id,signature]);
 useEffect(()=>()=>{report?.(id,[]);},[report,id]);
 return unique;
}
