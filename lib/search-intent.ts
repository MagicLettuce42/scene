// A deliberately small grammar: unrecognised words keep a query as a title search.
export type SearchIntent = { kind: "movie" | "tv"; genre: string; minutes?: number; service?: string; label: string };
const genres: [RegExp,string][] = [[/\b(?:horror|scary)\b/g,"Horror"],[/\b(?:comedies|comedy|funny)\b/g,"Comedy"],[/\b(?:sci[ -]?fi|science fiction)\b/g,"Science Fiction"],[/\b(?:thrillers?|gripping)\b/g,"Thriller"],[/\bdramas?\b/g,"Drama"],[/\b(?:documentaries|documentary)\b/g,"Documentary"],[/\b(?:animated|animation)\b/g,"Animation"],[/\badventures?\b/g,"Adventure"],[/\bfantasy\b/g,"Fantasy"],[/\b(?:romance|romantic)\b/g,"Romance"],[/\bfamily\b/g,"Family"],[/\baction\b/g,"Action"]];
const providers: [RegExp,string,string][] = [[/\bon netflix\b/g,"netflix","Netflix"],[/\bon disney(?:\+)?(?=\s|$)/g,"disney","Disney+"],[/\bon (?:amazon )?prime(?: video)?\b/g,"prime","Prime Video"],[/\bon (?:bbc )?iplayer\b/g,"bbc","BBC iPlayer"],[/\bon apple tv\+?/g,"apple","Apple TV+"]];
export function parseSearchIntent(value: string): SearchIntent | null {
 let rest=value.toLowerCase().trim(),kind:SearchIntent['kind']='movie',genre='all',minutes:number|undefined,service:string|undefined,serviceName='',explicit=false;
 for(const [re,key,label] of providers)if(new RegExp(re.source,re.flags).test(rest)){rest=rest.replace(new RegExp(re.source,re.flags),' ');service=key;serviceName=label;}
 rest=rest.replace(/\b(?:under|up to|less than)\s+(\d{1,3})\s*(?:minutes?|mins?|hours?|hrs?)\b/g,(full,n)=>{minutes=Number(n)*(/hours?|hrs?/.test(full)?60:1);explicit=true;return ' ';});
 if(/\bshort\b/.test(rest)){minutes??=90;rest=rest.replace(/\bshort\b/g,' ');explicit=true;}
 if(/\b(?:tv series|tv shows?|series|episodes?|shows)\b/.test(rest)){kind='tv';rest=rest.replace(/\b(?:tv series|tv shows?|series|episodes?|shows)\b/g,' ');explicit=true;}
 if(/\b(?:films?|movies?)\b/.test(rest)){rest=rest.replace(/\b(?:films?|movies?)\b/g,' ');explicit=true;}
 for(const [re,name] of genres)if(new RegExp(re.source,re.flags).test(rest)){if(genre!=='all')return null;genre=name;rest=rest.replace(new RegExp(re.source,re.flags),' ');}
 rest=rest.replace(/\b(?:show me|find me|find|some|something|to watch|please|a|an)\b/g,' ').trim();
 if(rest||!explicit||(minutes!==undefined&&(minutes<1||minutes>360)))return null;
 if(kind==='tv'){if(genre==='Science Fiction'||genre==='Fantasy')genre='Sci-Fi & Fantasy';if(genre==='Action'||genre==='Adventure')genre='Action & Adventure';}
 return {kind,genre,minutes,service,label:[genre==='all'?'':genre,kind==='movie'?'films':'TV series',minutes?`up to ${minutes} minutes`:'',serviceName?`on ${serviceName}`:'on your services'].filter(Boolean).join(' ')};
}
export function normalSearch(value:string){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function distance(a:string,b:string){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];}
export function suggestSpelling(query:string,names:string[]){
 const q=normalSearch(query);if(q.length<5||q.length>70)return null;
 const candidates=new Map<string,string>();for(const name of names){const normalized=normalSearch(name),words=normalized.split(' '),count=q.split(' ').length;const prefix=words.slice(0,count).join(' ');if(normalized===q||normalized.startsWith(q+' '))return null;candidates.set(normalized,name);if(words.length>count)candidates.set(prefix,name.split(/\s+/).slice(0,count).join(' ').replace(/[:–—]+$/,''));}
 const ranked=[...candidates].map(([n,name])=>({name,n,d:distance(q,n)})).filter(x=>x.d>0&&x.d<=Math.min(3,Math.floor(q.length/5))).sort((a,b)=>a.d-b.d||a.n.length-b.n.length);
 if(!ranked.length||ranked[1]&&ranked[1].d===ranked[0].d&&ranked[1].n!==ranked[0].n)return null;
 return ranked[0].name;
}
