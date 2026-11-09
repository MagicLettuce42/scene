export const mangaStatuses = [{id:'planned',label:'Want to read'},{id:'reading',label:'Reading'},{id:'completed',label:'Completed'},{id:'paused',label:'On hold'},{id:'dropped',label:'Dropped'}] as const;
export type MangaStatus = typeof mangaStatuses[number]['id'];
export type Manga = {id:string;name:string;slug:string;poster:string|null;summary:string;chapters:number|null;volumes:number|null;publication:string};
export type MangaProgress = {status:MangaStatus;chapters:number;volumes:number};
export type MangaEntry = {manga:Manga;progress:MangaProgress};
export type MangaCollection = Record<string,MangaEntry>;
const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000;
export function cleanManga(value:unknown):Manga|null {
 const m=value as Manga;if(!m||!/^kitsu-[1-9]\d{0,9}$/.test(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>200||typeof m.slug!=='string'||!/^[-a-z0-9]{1,200}$/.test(m.slug))return null;
 let poster=null;try{const u=new URL(m.poster||'');if(u.protocol==='https:'&&['media.kitsu.app','media.kitsu.io'].includes(u.hostname)&&!u.username&&!u.password)poster=u.href;}catch{}
 return {id:m.id,name:m.name.trim(),slug:m.slug,poster,summary:typeof m.summary==='string'?m.summary.slice(0,2000):'',chapters:count(m.chapters)?m.chapters:null,volumes:count(m.volumes)?m.volumes:null,publication:typeof m.publication==='string'?m.publication.slice(0,80):'Unknown'};
}
export function validMangaFields(value:unknown):value is Partial<MangaProgress>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>,keys=Object.keys(v);return keys.length>0&&keys.every(k=>k==='status'?mangaStatuses.some(s=>s.id===v[k]):k==='chapters'?count(v[k])&&Number.isInteger(Number(v[k])*10):k==='volumes'?count(v[k])&&Number.isInteger(v[k]):false);
}
export function cleanMangaCollection(value:unknown):MangaCollection {
 const out:MangaCollection=Object.create(null);if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const entry of Object.values(value).slice(0,500)){const e=entry as MangaEntry,m=cleanManga(e?.manga);if(m&&validMangaFields(e.progress)&&Object.keys(e.progress).length===3)out[m.id]={manga:m,progress:{...e.progress}};}
 return out;
}
