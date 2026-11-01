const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]),get=p=>require(path.join(root,p));
const {serviceKey,filterTitles}=get('lib/catalogue.js');
const {normalizeTMDB,browseTMDB}=get('lib/tmdb.js');
const {normalizeWM,normalizeTV}=get('lib/server-catalogue.js');
const {providerKey,normaliseSnapshot}=get('supabase/functions/_shared/watchlist-catalogue.js');
const aliases=['BBC iPlayer','BBC One','BBC Two','BBC1','BBC2','BBC 1','BBC 2','BBC One HD','BBC Two HD',' BBC TWO ','BBC-1-HD'];
for(const label of aliases){assert.equal(serviceKey(label),'bbc',label);assert.equal(providerKey(label),'bbc',label);}
for(const label of ['BBC America','BBC First','BBC Select','BritBox','BBC One Amazon Channel','BBC Two via Prime','BBC One Store']){assert.notEqual(serviceKey(label),'bbc',label);assert.notEqual(providerKey(label),'bbc',label);}
const opts={kind:'series',genre:'all',offer:'all',provider:'all',mine:true,selected:['bbc']};
const source=(id,name,offers)=>({id,name,first_air_date:'2024-01-01',networks:[{name:'BBC One'}],'watch/providers':{results:offers}});
const one=source(901,'One programme',{GB:{free:[{provider_id:1001,provider_name:'BBC One'}]}});
const two=source(902,'Two programme',{GB:{free:[{provider_id:1002,provider_name:'BBC2'}]}});
const unknown=source(903,'Network only',{}),foreign=source(904,'Outside UK',{US:{free:[{provider_id:1003,provider_name:'BBC One'}]}}),rental=source(905,'Rental only',{GB:{rent:[{provider_id:1001,provider_name:'BBC One'}]}});
assert.deepEqual(filterTitles([one,two,unknown,foreign,rental].map(s=>normalizeTMDB(s,'tv')),opts).map(t=>t.name),['One programme','Two programme']);
assert.equal(normaliseSnapshot(unknown,'series').offers.length,0);assert.equal(normaliseSnapshot(foreign,'series').offers.length,0);assert.equal(normaliseSnapshot(rental,'series').offers.length,0);
assert.equal(normaliseSnapshot(two,'series').offers[0].key,'bbc');
const wm=normalizeWM({id:909,title:'BBC programme',type:'tv_series',sources:[{region:'GB',name:'BBC Two',type:'free',web_url:'https://www.bbc.co.uk/iplayer'},{region:'US',name:'BBC One',type:'free',web_url:'https://www.bbc.co.uk/iplayer'}]});assert.equal(wm.offers.length,1);assert.equal(wm.offers[0].key,'bbc');
assert.equal(normalizeTV({id:99999999,name:'Network only',network:{name:'BBC One'},webChannel:{name:'BBC iPlayer'}}).offers.length,0,'broadcast credits are not streaming availability');
const original=global.fetch;let discovered=false;
global.fetch=async url=>{const u=new URL(url),p=u.pathname.replace('/3/','');let data;
 if(p==='genre/tv/list')data={genres:[]};
 else if(p==='watch/providers/tv')data={results:[{provider_id:38,provider_name:'BBC iPlayer'},{provider_id:1001,provider_name:'BBC One'},{provider_id:1002,provider_name:'BBC2'},{provider_id:1003,provider_name:'BBC America'}]};
 else if(p==='discover/tv'){assert.equal(u.searchParams.get('watch_region'),'GB');assert.equal(u.searchParams.get('with_watch_providers'),'38|1001|1002');data={results:[{id:901},{id:902},{id:903}],total_pages:1};discovered=true;}
 else data={'tv/901':one,'tv/902':two,'tv/903':unknown}[p];
 assert.ok(data,p);return Response.json(data);
};
(async()=>{try{const result=await browseTMDB({kind:'tv',page:1,provider:'all',selected:['bbc'],mine:true,offer:'all',genre:'all',sort:'recommended'});assert.ok(discovered);assert.deepEqual(result.titles.map(t=>t.name),['One programme','Two programme']);console.log('PASS: BBC channel aliases in browsing, search and refresh; UK availability required; network-only, overseas, rental and add-on exclusions.');}finally{global.fetch=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
