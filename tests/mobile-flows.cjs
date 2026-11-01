// Browser emulation only. All auth, email and account writes are intercepted fixtures.
// Run after CommonJS compilation: SCENE_PLAYWRIGHT_PATH=<playwright module> node tests/mobile-flows.cjs outputs/qa
const assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require(process.env.SCENE_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(process.argv[2]), origin = process.env.SCENE_QA_ORIGIN || 'http://127.0.0.1:5173';
const { titles } = require(path.join(root, 'lib/catalogue.js'));
const { emptyLibrary, applyMutation, applyOperations, canUndoMutation } = require(path.join(root, 'lib/library-state.js'));
let lastPage;
const account = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@example.invalid', name: 'QA Fixture', role: 'member',
  security: { sessionValid: true, required: false, enrolled: false, verified: false, allowed: true, adminReady: false } };
const series = { ...titles[0], id: 'tmdb-tv-123', tmdbId: 123, imdbId: 'tt99999123', kind: 'series', name: 'QA Series', genres: ['Drama'] };
const film = { ...titles[0], name: 'QA Film' };
const session = { access_token: ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ sub: account.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture-only', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user: { id: account.id, email: account.email, aud: 'authenticated', role: 'authenticated' } };
async function fixture(browser, signedIn) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  let writes = 0;
  let document = applyOperations(emptyLibrary(), [
    { type: 'onboard', value: true }, { type: 'gaming', value: true }, { type: 'service', key: 'netflix', value: true },
    { type: 'game-platform', key: 'ps5', value: true },
    ...['astro-bot', 'baldurs-gate-3', 'animal-crossing'].map(id => ({ type: 'game-status', id, value: 'later' })),
    ...[film, series].map(title => ({ type: 'title', title, fields: { saved: true } })),
  ]), revision = 0, signupCalls = 0, resendCalls = 0, failSignup = false, failLibrary = false;
  if (signedIn) await context.addInitScript(session => localStorage.setItem('scene.auth.v1', JSON.stringify(session)), session);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const send = (body, status=200) => route.fulfill({ status, contentType:'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/config') return send({ url: origin+'/fixture-auth', key:'fixture-public-key' });
    if (url.pathname.startsWith('/fixture-auth/')) {
      if (url.pathname.endsWith('/signup')) { signupCalls++; return failSignup ? send({ msg:'Fixture request interrupted' },400) : send({ user:session.user, session:null }); }
      if (url.pathname.endsWith('/resend')) { resendCalls++; return send({}); }
      if (url.pathname.endsWith('/token')) return route.request().postDataJSON()?.auth_code === 'fixture-expired' ? send({msg:'Expired fixture'},400) : send(session);
      if (url.pathname.endsWith('/user')) return send(session.user);
      return send({});
    }
    if (url.pathname === '/api/account') return send(account);
    if (url.pathname === '/api/library') {
      if (route.request().method() === 'POST') {
        writes++;
        if (failLibrary) return send({error:'Fixture offline'},503);
        const batch = route.request().postDataJSON();
        if (document.receipts.includes(batch.id)) return send({userId:account.id,document,revision});
        if (batch.revision !== revision) return send({userId:account.id,document,revision},409);
        const undoSkipped = Boolean(batch.undoOf && !canUndoMutation(document,batch.undoOf,batch.undoBase));
        document = applyMutation(document,batch); revision++;
        return send({userId:account.id,document,revision,undoSkipped});
      }
      return send({userId:account.id,document,revision});
    }
    if (url.pathname.includes('/episodes')) return send({seasons:[{number:1,name:'Season 1',episodeCount:2,airDate:'2020-01-01'}],status:'Returning Series',season:1,episodes:[1,2].map(number=>({number,name:'Fixture episode '+number,airDate:'2020-01-01',runtime:30}))});
    if (url.pathname.startsWith('/api/title/')) return send({title:{...series,overview:'A fixture series.',cast:[],crew:[],similar:[],recommendations:[]}});
    if (url.pathname.startsWith('/api/')) return send({titles:[],items:[],entries:[],people:[],results:[],seasons:[],lists:[],hasMore:false,genres:[],status:'ready'});
    return route.continue();
  });
  lastPage = await context.newPage(); lastPage.setDefaultTimeout(8000);
  lastPage.on('requestfailed', r => { if(new URL(r.url()).origin===origin && r.resourceType()==='script') console.error('Script failed',new URL(r.url()).pathname,r.failure()?.errorText); });
  lastPage.on('response', r => { if(r.status()>=400 && r.request().resourceType()==='script') console.error('Script response',r.status(),new URL(r.url()).pathname); });
  return {context, page:lastPage, get writes(){return writes;}, get document(){return document;}, set document(value){document=value;revision++;}, get signupCalls(){return signupCalls;}, get resendCalls(){return resendCalls;}, set failSignup(v){failSignup=v;}, set failLibrary(v){failLibrary=v;} };
}
async function noOverflow(page) { assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); }
if (require.main === module) (async()=>{
 const browser = await chromium.launch({executablePath:process.env.SCENE_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const f=await fixture(browser,false),p=f.page;
  await p.goto(origin+'/signup');
  await p.getByLabel('Your name',{exact:true}).fill('QA Fixture');
  await p.getByLabel('Email',{exact:true}).fill(account.email);
  await p.getByLabel('Choose a password',{exact:true}).fill('disposable-fixture-value');
  await p.getByLabel('Confirm password',{exact:true}).fill('different-fixture-value');
  await p.getByRole('button',{name:'Create my Scene account'}).click();
  await p.getByRole('alert').filter({hasText:'passwords don’t match'}).waitFor(); assert.equal(f.signupCalls,0);
  await p.getByLabel('Confirm password',{exact:true}).fill('disposable-fixture-value');
  f.failSignup=true; await p.getByRole('button',{name:'Create my Scene account'}).click();
  await p.getByRole('alert').waitFor(); f.failSignup=false;
  await p.getByRole('button',{name:'Create my Scene account'}).click();
  await p.getByText('Check your email',{exact:false}).first().waitFor();
  assert.equal(await p.getByRole('button',{name:/Resend available/}).isDisabled(),true);
  await noOverflow(p);
  await p.getByRole('link',{name:'Sign in',exact:true}).click();
  await p.getByText('New to Scene?',{exact:false}).waitFor();
  await p.goBack(); await p.getByRole('heading',{name:'Create your Scene account.'}).waitFor();
  await p.goForward(); await p.getByText('New to Scene?',{exact:false}).waitFor();
  await p.getByText('Resend confirmation email',{exact:true}).first().click();
  await p.getByLabel('Email address',{exact:true}).fill(account.email);
  await p.getByRole('button',{name:'Resend confirmation email',exact:true}).click();
  assert.equal(f.resendCalls,1);
  await p.goto(origin+'/?code=fixture-expired');
  await p.getByText('This link could not sign you in automatically.',{exact:false}).waitFor();
  assert.equal(new URL(p.url()).searchParams.has('code'),false);
  await p.evaluate(()=>localStorage.setItem('scene.auth.v1-code-verifier',JSON.stringify('fixture-verifier')));
  await p.goto(origin+'/?code=fixture-valid');
  await p.getByRole('button',{name:'Your Scene account and settings'}).waitFor();
  assert.equal(new URL(p.url()).searchParams.has('code'),false);
  await f.context.close(); console.log('PASS mobile signup validation, interrupted signup/retry, confirmation prompt/cooldown, resend and expired/successful callback recovery (mock email).');
  const a=await fixture(browser,true),page=a.page;
  await page.goto(origin); await page.getByRole('button',{name:'Gaming',exact:true}).click();
  await page.getByRole('button',{name:/My games/}).click();
  assert.match(await page.locator('.gaming-result-summary').innerText(),/Showing 2 of 3 saved games/);
  await page.getByText('Filters & platforms',{exact:true}).click();
  await page.getByLabel('Show games for').selectOption('switch');
  assert.match(await page.locator('.gaming-result-summary').innerText(),/Showing 1 of 3 saved games/);
  await page.getByRole('combobox',{name:/^Genre/}).selectOption('Role-playing');
  assert.match(await page.locator('.gaming .empty-state').innerText(),/No games match: Switch · Role-playing/);
  await page.locator('.gaming .empty-state').getByRole('button',{name:'Change filters'}).click();
  assert.equal(await page.getByLabel('Show games for').evaluate(e=>e===document.activeElement),true);
  await page.locator('.gaming .empty-state').getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.match(await page.locator('.gaming-result-summary').innerText(),/Showing 3 of 3 saved games/);
  assert.deepEqual(a.document.preferences.gamePlatforms,{ps5:true});
  for(const width of [320,390,768,1440]) { await page.setViewportSize({width,height:844}); await noOverflow(page); }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Your Scene account and settings'}).click();
  await page.getByRole('button',{name:/Edit profile/}).click();
  const picker=page.getByLabel('Choose profile photo',{exact:true});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=24;const x=c.getContext('2d');x.fillStyle='orange';x.fillRect(0,0,32,24);return c.toDataURL('image/png').split(',')[1]});
  const file={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await picker.setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
  await page.getByRole('alert').filter({hasText:'up to 5 MB'}).waitFor();
  await picker.setInputFiles(file); await page.getByRole('button',{name:'Use this photo'}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click(); assert.equal(a.document.preferences.avatar,undefined);
  await picker.setInputFiles(file); await page.getByRole('button',{name:'Use this photo'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('scene.library.00000000-0000-4000-8000-000000000001')).pending.length===0);
  assert.match(a.document.preferences.avatar,/^data:image\/jpeg;base64,/);
  await picker.setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid fixture')});
  await page.getByRole('alert').filter({hasText:'could not be opened'}).waitFor();
  assert.ok(a.document.preferences.avatar);
  await picker.setInputFiles(file); await page.getByRole('button',{name:'Use this photo'}).click();
  await page.getByRole('button',{name:'Remove photo',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('scene.library.00000000-0000-4000-8000-000000000001')).pending.length===0);
  assert.equal(a.document.preferences.avatar,null);
  await noOverflow(page);
  await page.getByRole('button',{name:'Account',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/Edit profile/}).evaluate(e=>e===document.activeElement),true);
  await page.getByRole('button',{name:/Edit profile/}).click();
  await picker.setInputFiles(file);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Your Scene account and settings'}).click();
  await page.getByRole('button',{name:/Edit profile/}).click();
  assert.equal(await page.getByRole('button',{name:'Use this photo'}).count(),0,'closing discards an unsaved photo');
  assert.equal(a.document.preferences.avatar,null);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:/^Watchlist/}).click();
  a.failLibrary=true;
  await page.getByRole('button',{name:'Remove QA Film from watchlist'}).click();
  await page.getByRole('button',{name:/Sync status:/}).click();
  await page.getByText('Fixture offline',{exact:false}).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.toast').getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Remove QA Film from watchlist'}).waitFor();
  a.failLibrary=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('scene.library.00000000-0000-4000-8000-000000000001')).pending.length===0);
  assert.ok(Object.values(a.document.entries).some(e=>e.title.name==='QA Film'&&e.saved));
  await page.getByRole('button',{name:/View QA Series/}).click();
  await page.getByRole('button',{name:/Your episode progress/}).click();
  const episode=page.getByRole('checkbox',{name:'Mark watched: season 1, episode 1'});
  await episode.check();
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  await episode.waitFor(); assert.equal(await episode.isChecked(),false);
  await page.getByRole('button',{name:'Mark aired episodes watched'}).click();
  assert.equal(await page.getByRole('checkbox',{name:'Mark unwatched: season 1, episode 2'}).isChecked(),true);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  assert.equal(await episode.isChecked(),false);
  await episode.check();
  await page.getByRole('checkbox',{name:'Mark unwatched: season 1, episode 1'}).uncheck();
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  assert.equal(await page.getByRole('checkbox',{name:'Mark unwatched: season 1, episode 1'}).isChecked(),true);
  await noOverflow(page);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:/View QA Series/}).click();
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Gaming',exact:true}).click();
  await page.getByRole('button',{name:/My games/}).click();
  await noOverflow(page);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('scene.library.00000000-0000-4000-8000-000000000001')).pending.length===0);
  assert.equal(Object.values(a.document.entries).find(e=>e.title.name==='QA Series').progress.episodes['1']['1'],true);
  if(process.env.SCENE_QA_SCREENSHOT) await page.screenshot({path:process.env.SCENE_QA_SCREENSHOT});
  console.log('PASS mobile game counts/empty filters/preference retention, 320–1440px layouts, photo select/cancel/save/change/remove/decode recovery/close interruption, account back/focus/Escape, interrupted sync/retry, watchlist undo and individual/bulk/repeated episode undo.');
  await a.context.close();
 } catch(e) { console.error('QA location',lastPage?.url()); if(lastPage) console.error('QA headings',await lastPage.locator('h1,h2,h3').allTextContents()); throw e; } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});

module.exports = { fixture, origin, noOverflow };
