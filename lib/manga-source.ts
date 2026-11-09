import {cleanManga,type Manga} from './manga-state';
const cache=new Map<string,{at:number;data:{manga:Manga[];hasMore:boolean;page:number}}>(),pending=new Map<string,Promise<any>>();
let nextRequest=0;
export async function searchManga(query:string,page=1){
 const key=JSON.stringify([query,page]),hit=cache.get(key);if(hit&&Date.now()-hit.at<3600000)return hit.data;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{if(nextRequest-Date.now()>3000)throw Error("Manga catalogue is busy.");const start=Math.max(Date.now(),nextRequest);nextRequest=start+1100;if(start>Date.now())await new Promise(r=>setTimeout(r,start-Date.now()));
 const params=new URLSearchParams({'page[limit]':'12','page[offset]':String((page-1)*12)});if(query)params.set('filter[text]',query);else params.set('sort','-userCount');
 const response=await fetch('https://kitsu.app/api/edge/manga?'+params,{headers:{Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Manga catalogue could not connect. Try again shortly.');const body:any=await response.json();if(!Array.isArray(body.data))throw Error('Manga catalogue response was incomplete.');
 const manga:Manga[]=body.data.filter((r:any)=>r.type==='manga'&&r.attributes?.ageRating!=='R18'&&r.attributes?.nsfw!==true).map((r:any)=>{const a=r.attributes;return cleanManga({id:'kitsu-'+r.id,name:a.canonicalTitle||a.titles?.en||a.titles?.en_jp,slug:a.slug,summary:a.synopsis,poster:a.posterImage?.medium||a.posterImage?.original||null,chapters:a.chapterCount,volumes:a.volumeCount,publication:a.status});}).filter((m:Manga|null):m is Manga=>!!m);
 const data={manga,page,hasMore:page<50&&!!body.links?.next};if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),data});return data;})();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
