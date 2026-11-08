import { parseSearchIntent, suggestSpelling } from './search-intent';
import { searchCatalogue } from './server-catalogue';
import { browseTMDB, hasTMDB, type SearchOptions } from './tmdb';
import { titles } from './catalogue';
import { games } from './gaming';
import { requestServices } from './request-services';
const names=new Set([...titles.map(t=>t.name),...games.map(g=>g.name)]);
export async function smartSearch(q:string,page:number,params:URLSearchParams,options:SearchOptions={}){
 const intent=parseSearchIntent(q);
 if(intent&&!options.preview){
  const filters=requestServices(params);
  if(!filters||intent.service&&!filters.selected.includes(intent.service))return {titles:[],page,hasMore:false,interpretation:intent.label,matchedCount:0,emptyReason:'services',message:null};
  if(!hasTMDB())throw Error('Live discovery is temporarily unavailable.');
  const data=await browseTMDB({kind:intent.kind,page,provider:intent.service||'all',selected:filters.selected,mine:true,offer:filters.offer,genre:intent.genre,sort:'recommended',maxRuntime:intent.minutes});
  if(options.signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const matches=data.titles.filter(t=>!intent.minutes||typeof t.runtime==='number'&&t.runtime>0&&t.runtime<=intent.minutes);
  return {...data,titles:matches,interpretation:intent.label,matchedCount:matches.length,emptyReason:'services'};
 }
 const data=await searchCatalogue(q,page,options);
 for(const t of data.titles){if(names.size>2000)break;names.add(t.name);}
 return {...data,matchedCount:data.titles.length,suggestion:page===1?suggestSpelling(q,[...names]):null};
}
