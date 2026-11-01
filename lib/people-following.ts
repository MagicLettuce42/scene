import type { Person, PersonRole } from "./people";
import type { Title } from "./catalogue";
import { validCalendarDate, addDays, londonDate } from "./episode-calendar";
export const peopleFollowLimit = 20;
export type FollowedPerson = { person: Person; role: PersonRole; alerts: boolean; followedAt: number; seenThrough: number };
export type PersonPreferences = Partial<Pick<FollowedPerson, "role" | "alerts" | "seenThrough">>;
export type PeopleUpdate = { title: Title; date: string; people: { id: number; name: string; role: string }[]; unread: boolean };
export type FollowingFeed = { updates: PeopleUpdate[]; page: number; hasMore: boolean; unread: number; failedPeople: string[]; checkedPeople: number[]; checkedAt: string; total: number };
export function cleanFollowPerson(value: unknown): Person | null {
 const p=value as Person;
 if(!p||!Number.isSafeInteger(p.id)||p.id<1||p.id>2147483647||typeof p.name!=="string"||!p.name.trim()||p.name.length>150)return null;
 return {id:p.id,name:p.name.trim(),department:typeof p.department==="string"?p.department.slice(0,80):"",photo:typeof p.photo==="string"&&/^https:\/\/image\.tmdb\.org\/t\/p\/w185\/[a-zA-Z0-9._-]+$/.test(p.photo)?p.photo:null};
}
export function validPersonRole(value: unknown): value is PersonRole {return value==="all"||value==="acting"||value==="directing";}
export function cleanFollow(value: unknown): FollowedPerson | null {
 const v=value as FollowedPerson,person=cleanFollowPerson(v?.person);
 if(!person||!validPersonRole(v.role)||typeof v.alerts!=="boolean"||!Number.isSafeInteger(v.followedAt)||v.followedAt<1||v.followedAt>4102444800000||!Number.isSafeInteger(v.seenThrough)||v.seenThrough<v.followedAt||v.seenThrough>4102444800000)return null;
 return {person,role:v.role,alerts:v.alerts,followedAt:v.followedAt,seenThrough:v.seenThrough};
}
export function readFollows(value: unknown): FollowedPerson[] {
 if(!value||typeof value!=="object"||Array.isArray(value))return [];
 return Object.entries(value).flatMap(([id,v])=>{const p=cleanFollow(v);return p&&String(p.person.id)===id?[p]:[];}).sort((a,b)=>b.followedAt-a.followedAt||a.person.id-b.person.id).slice(0,peopleFollowLimit);
}
export function validPersonPreferences(value: unknown): value is PersonPreferences {
 if(!value||typeof value!=="object"||Array.isArray(value)||!Object.keys(value).length)return false;
 return Object.entries(value).every(([key,v])=>key==="role"?validPersonRole(v):key==="alerts"?typeof v==="boolean":key==="seenThrough"?Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=Date.now()+60000:false);
}
export function datedCredits(data: any, follow: FollowedPerson, today = londonDate()) {
 const from=addDays(today,-90),to=addDays(today,365),out=new Map<string,{row:any;date:string;role:string}>();
 const rows=[...(follow.role==="directing"?[]:(Array.isArray(data?.cast)?data.cast:[]).map((r:any)=>({...r,followRole:"Acting"}))),
  ...(follow.role==="acting"?[]:(Array.isArray(data?.crew)?data.crew:[]).filter((r:any)=>r.job==="Director").map((r:any)=>({...r,followRole:"Directing"})))];
 for(const r of rows){
  const date=r.media_type==="movie"?r.release_date:r.first_air_date;
  if(r.adult||!["movie","tv"].includes(r.media_type)||!Number.isSafeInteger(r.id)||r.id<1||r.id>2147483647||typeof (r.title||r.name)!=="string"||typeof date!=="string"||!validCalendarDate(date)||date<from||date>to)continue;
  const key=r.media_type+"-"+r.id,old=out.get(key);
  out.set(key,{row:r,date,role:old&&old.role!==r.followRole?"Acting & directing":r.followRole});
 }
 return [...out.values()];
}
export function isUnreadRelease(date: string, follow: FollowedPerson, today=londonDate()) {
 return follow.alerts&&date<=today&&date>londonDate(new Date(Math.max(follow.followedAt,follow.seenThrough)));
}
