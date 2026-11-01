export type Hint={id:string;name:string;kind:'movie'|'series';year?:number|null;tmdbId?:number;imdbId?:string|null};
const normalized=(s:unknown)=>typeof s==='string'?s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,''):'';
export function exactMatch(rows:any[],hint:Hint){const matches=rows.filter(r=>!r.adult&&[r.name,r.title,r.original_name,r.original_title].some(n=>normalized(n)===normalized(hint.name))&&(!hint.year||(r.first_air_date||r.release_date||'').slice(0,4)===String(hint.year)));return matches.length===1?matches[0]:null;}
export function providerKey(name:string){const s=name.trim().toLowerCase();if(/channel|via |\(.*prime/.test(s)&&!['channel 4','all 4'].includes(s))return 'addon-'+s.replace(/[^a-z0-9]/g,'');if(s.includes('store')||s==='amazon video'||s==='itunes')return 'store';if(/^bbc(?:one|two|1|2)(?:hd)?$/.test(s.replace(/[\s-]+/g,'')))return 'bbc';for(const [part,key] of [['netflix','netflix'],['prime','prime'],['disney','disney'],['apple','apple'],['iplayer','bbc'],['now','now'],['itv','itv'],['channel 4','channel4'],['all 4','channel4'],['paramount','paramount'],['sky go','sky'],['hbo','max']])if(s.includes(part))return key;return s==='max'?'max':s.replace(/[^a-z0-9]/g,'');}
export function normaliseSnapshot(s:any,kind:'movie'|'series',checked=new Date().toISOString()){
 if(!s||!Number.isSafeInteger(s.id)||s.id<=0||s.adult||typeof(s.title||s.name)!=='string')throw Error('Invalid catalogue result');
 const uk=s['watch/providers']?.results?.GB,route=kind==='movie'?'movie':'tv';
 const guide=`https://www.themoviedb.org/${route}/${s.id}/watch?locale=GB`,offers:any[]=[],seen=new Set<string>();
 // Only confirmed GB subscription and free offers count. A missing GB entry means none confirmed.
 for(const [group,type] of [['flatrate','sub'],['free','free'],['ads','free']] as const)for(const provider of uk?.[group]||[]){if(typeof provider.provider_name!=='string')continue;const k=provider.provider_id+':'+type;if(seen.has(k))continue;seen.add(k);offers.push({name:provider.provider_name,key:providerKey(provider.provider_name),type,url:guide,linkKind:'guide'});}
 const date=kind==='movie'?s.release_date:s.first_air_date;
 return {id:`tmdb-${route}-${s.id}`,tmdbId:s.id,imdbId:s.imdb_id||s.external_ids?.imdb_id||null,name:s.title||s.name,year:date?Number(date.slice(0,4))||null:null,kind,genres:(s.genres||[]).map((g:any)=>g.name),runtime:kind==='movie'?s.runtime||null:s.episode_run_time?.[0]||null,summary:s.overview||'',poster:typeof s.poster_path==='string'&&/^\/[a-zA-Z0-9._-]+$/.test(s.poster_path)?`https://image.tmdb.org/t/p/w500${s.poster_path}`:null,rating:s.vote_average||null,voteCount:Number(s.vote_count)||0,originalLanguage:s.original_language,sourceUrl:`https://www.themoviedb.org/${route}/${s.id}`,availabilitySource:guide,offers,checked,live:true,dataSource:'tmdb'};
}
export async function refreshCatalogue(hint:Hint,request:(path:string,params?:Record<string,string>)=>Promise<any>){
 if(!hint||!['movie','series'].includes(hint.kind)||typeof hint.name!=='string'||!hint.name.trim())throw Error('Invalid title');
 const kind=hint.kind==='movie'?'movie':'tv';let id=hint.tmdbId;
 if(!Number.isSafeInteger(id)||(id??0)<=0){
  const direct=hint.id.match(/^tmdb-(movie|tv)-([1-9][0-9]*)$/);if(direct&&direct[1]===kind)id=Number(direct[2]);
  else if(hint.imdbId&&/^tt[0-9]+$/.test(hint.imdbId)){const found=await request('find/'+hint.imdbId,{external_source:'imdb_id'});const rows=found[kind==='movie'?'movie_results':'tv_results']||[];if(rows.length===1)id=rows[0].id;}
  if(!id){const result=await request('search/'+kind,{query:hint.name,include_adult:'false'});id=exactMatch(result.results||[],hint)?.id;}
 }
 if(!Number.isSafeInteger(id)||(id??0)<=0)throw Error('Exact title not found');
 const source=await request(`${kind}/${id}`,{append_to_response:'watch/providers,external_ids'});
 return normaliseSnapshot(source,hint.kind);
}
