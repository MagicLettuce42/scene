import type { Title } from './catalogue';
import { services } from './catalogue';
import type { FollowingFeed } from './people-following';
import { londonDate, addDays } from './episode-calendar';
export type SceneUpdate={id:string;kind:'availability'|'release'|'people';date:string;name:string;description:string;title?:Title;fresh:boolean};
export type UpdateSources={availability?:{events:{id:string;title:Title;serviceKey:string;detectedAt:string}[]};reminders?:{reminders:{release_id:string;scene_releases:{title:string;release_date:string;service_key:string;active:boolean}|null}[]};people?:FollowingFeed};
export function mergeUpdates(sources:UpdateSources,read:string[],today=londonDate()):SceneUpdate[]{
 const provider=(key:string)=>services.find(s=>s.key===key)?.name||key,rows:SceneUpdate[]=[];
 for(const e of sources.availability?.events||[])rows.push({id:'availability:'+e.id,kind:'availability',date:e.detectedAt,name:e.title.name,description:`New listing on ${provider(e.serviceKey)}. Open to check current availability.`,title:e.title,fresh:true});
 for(const r of sources.reminders?.reminders||[]){const e=r.scene_releases;if(!e?.active||e.release_date<addDays(today,-30))continue;rows.push({id:`release:${r.release_id}:${e.release_date}`,kind:'release',date:e.release_date,name:e.title,description:`Announced for ${provider(e.service_key)} · ${e.release_date>today?'Upcoming release':'Release date reached'}. Availability still needs checking.`,fresh:e.release_date<=today});}
 for(const e of sources.people?.updates||[])rows.push({id:`people:${e.title.id}:${e.date}`,kind:'people',date:e.date,name:e.title.name,description:`Featuring ${e.people.map(p=>p.name).join(', ')}. Release date, not regional streaming confirmation.`,title:e.title,fresh:e.unread});
 return rows.map(r=>({...r,fresh:r.fresh&&!read.includes(r.id)})).sort((a,b)=>Number(b.fresh)-Number(a.fresh)||b.date.localeCompare(a.date));
}
export const updateReadKey=(accountId:string)=>'scene.updates.read.'+accountId;
export function readUpdateIds(value:string|null){try{const data=JSON.parse(value||'[]');return Array.isArray(data)?data.filter((v):v is string=>typeof v==='string'&&v.length<220).slice(-500):[];}catch{return[];}}
