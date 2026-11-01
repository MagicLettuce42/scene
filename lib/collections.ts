export type PersonalCollection = {id:string;name:string;members:Record<string,boolean>};
export const collectionId = (v:unknown):v is string => typeof v==='string'&&/^[a-f\d-]{36}$/i.test(v);
export const collectionName = (v:unknown):v is string => typeof v==='string'&&v.trim().length>0&&v.length<=50;
export function readCollections(value:Record<string,PersonalCollection|null> = {}):PersonalCollection[]{return Object.entries(value).filter(([id,c])=>collectionId(id)&&c&&collectionName(c.name)).map(([id,c])=>({id,name:c!.name,members:c!.members||{}})).slice(0,20);}
export function newCollectionId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
