const assert=require('node:assert/strict');
const {chromium}=require(process.env.SCENE_PLAYWRIGHT_PATH||'playwright');
const {fixture,origin,noOverflow}=require('./mobile-flows.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCENE_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const f=await fixture(browser,true),p=f.page;
  await p.goto(origin); await p.getByRole('button',{name:/^Watchlist/}).click();
  const cards=p.locator('.catalogue .poster-grid .title-card'); await cards.first().waitFor();
  for(const width of [320,390,768,1440]) {
   await p.setViewportSize({width,height:844}); await noOverflow(p);
   const top=(await cards.first().boundingBox()).y;
   assert(top<500,`First card should appear early at ${width}px, got ${top}`);
   console.log(`PASS ${width}px: first card begins at ${Math.round(top)}px`);
  }
  await p.setViewportSize({width:390,height:844});
  const before=f.writes, initial=JSON.stringify(f.document);
  for(const name of ['Collections','Filters','Sort']) {
   const button=p.getByRole('button',{name,exact:true}); await button.click();
   assert.equal(await button.getAttribute('aria-expanded'),'true');
   await p.keyboard.press('Escape'); assert.equal(await button.evaluate(e=>e===document.activeElement),true);
  }
  await p.getByRole('button',{name:'Watchlist settings',exact:true}).click();
  await p.getByRole('button',{name:'Check saved titles',exact:true}).waitFor();
  await p.keyboard.press('Escape');
  await p.getByRole('button',{name:/Sync status:/}).click();
  await p.getByRole('button',{name:'Sync now',exact:true}).waitFor();
  await p.keyboard.press('Escape');
  assert.equal(f.writes,before,'opening and closing presentation controls never writes');
  assert.equal(JSON.stringify(f.document),initial,'saved preferences are untouched');
  await p.getByRole('button',{name:/^Filters/}).click();
  await p.getByRole('combobox',{name:/^Availability/}).first().selectOption('available');
  await p.keyboard.press('Escape');
  await p.getByRole('heading',{name:'No titles match this view'}).waitFor();
  await p.getByRole('button',{name:'Sort',exact:true}).click();
  await p.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('az');
  await p.keyboard.press('Escape');
  await p.getByRole('button',{name:/^Filters/}).click();
  assert.equal(await p.getByRole('combobox',{name:/^Availability/}).first().inputValue(),'available');
  await p.keyboard.press('Escape');
  await p.locator('.empty-state').getByRole('button',{name:'Clear filters',exact:true}).click();
  await cards.first().waitFor();
  await p.getByRole('button',{name:'More Watchlist views',exact:true}).click();
  for(const name of ['Ratings','Liked','Watched','Hidden','Calendar','Stats','Pick a title for me']) assert.equal(await p.getByRole('button',{name,exact:true}).count(),1,name);
  await p.getByRole('button',{name:'Ratings',exact:true}).click();
  await p.getByRole('heading',{name:'Your personal film journal starts here'}).waitFor();
  await p.getByRole('button',{name:'Saved',exact:true}).click();
  await cards.first().waitFor();
  await p.evaluate(()=>document.documentElement.style.fontSize='200%'); await noOverflow(p);
  for(const button of await p.locator('.watchlist-bar button:visible').all()) {const box=await button.boundingBox();assert(box.height>=44);assert(box.x>=0&&box.x+box.width<=391);}
  await p.getByRole('button',{name:'Collections',exact:true}).click(); await noOverflow(p); await p.keyboard.press('Escape');
  await p.evaluate(()=>document.documentElement.style.fontSize='');
  await p.getByRole('button',{name:'Collections',exact:true}).click();
  await p.getByText('New collection',{exact:true}).click();
  await p.getByRole('textbox',{name:'Collection name'}).fill('A very long collection name for family movie nights');
  await p.getByRole('button',{name:'Create collection',exact:true}).click();
  await p.setViewportSize({width:320,height:844}); await noOverflow(p);
  await p.getByRole('button',{name:'Close Watchlist controls'}).click(); await noOverflow(p);
  await p.getByRole('heading',{name:'No saved titles in this collection view'}).waitFor();
  await p.getByRole('button',{name:/^Collections/}).click();
  await p.getByRole('button',{name:/All saved/}).click(); await p.keyboard.press('Escape');
  await cards.first().waitFor();
  await p.setViewportSize({width:390,height:844});

  if(process.env.SCENE_QA_SCREENSHOT) await p.screenshot({path:process.env.SCENE_QA_SCREENSHOT});
  await f.context.close();
  const empty=await fixture(browser,true); empty.document={...empty.document,entries:{}};
  await empty.page.goto(origin); await empty.page.getByRole('button',{name:/^Watchlist/}).click();
  await empty.page.getByRole('heading',{name:'Your next watch is waiting'}).waitFor(); await noOverflow(empty.page);
  await empty.context.close();
  const loading=await fixture(browser,true); let release;
  const gate=new Promise(resolve=>release=resolve);
  await loading.context.route('**/api/library',async route=>{await gate;await route.fallback()});
  await loading.page.goto(origin); await loading.page.getByRole('button',{name:/^Watchlist/}).click();
  await loading.page.getByRole('button',{name:/Sync status: Connecting/}).waitFor(); await noOverflow(loading.page);
  release(); await loading.page.locator('.catalogue .title-card').first().waitFor(); await loading.context.close();
  console.log('PASS controls, no presentation writes, filter retention, empty recovery, history discoverability, keyboard focus/Escape, 44px targets and enlarged text.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
