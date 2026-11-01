const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const root = path.resolve(process.argv[2]), get = p => require(path.join(root, p));
const { releaseId, fetchAppRelease, refreshAppUrl } = get('lib/app-updates.js');
const id = '1234567890abcdefabcd';
(async () => {
  assert.equal(releaseId({ id }), id);
  for (const value of [null, {}, { id: 5 }, { id: '<html>' }, { id: 'x'.repeat(200) }]) assert.equal(releaseId(value), null);
  const signal = new AbortController().signal;
  global.fetch = async (url, options) => {
    assert.equal(url, '/api/app-version'); assert.equal(options.cache, 'no-store'); assert.equal(options.signal, signal);
    return Response.json({ id });
  };
  assert.equal(await fetchAppRelease(signal), id);
  global.fetch = async () => Response.json({}, { status: 503 });
  await assert.rejects(fetchAppRelease(signal));
  global.fetch = async () => Response.json({ id: 'invalid' });
  await assert.rejects(fetchAppRelease(signal));
  global.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(fetchAppRelease(signal));
  const refreshed = new URL(refreshAppUrl('https://scene.example/?source=homescreen&scene=reminders#watchlist', id));
  assert.equal(refreshed.origin, 'https://scene.example'); assert.equal(refreshed.hash, '#watchlist');
  assert.equal(refreshed.searchParams.get('source'), 'homescreen'); assert.equal(refreshed.searchParams.get('scene'), 'reminders');
  assert.equal(refreshed.searchParams.get('_scene_update'), id);
  const response = get('app/api/app-version/route.js').GET();
  assert.match(response.headers.get('cache-control'), /no-store/); assert.ok(releaseId(await response.json()));

  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const { AppUpdateNotice, AppUpdateSettings } = get('app/components/app-updates.js');
  const originalContext = React.useContext; let refreshedCount = 0, laterCount = 0;
  let state = { available: true, checking: false, refreshing: false, message: '', refresh: () => { refreshedCount++; }, check: async () => id, dismiss: () => { laterCount++; } };
  React.useContext = () => state;
  try {
    const queued = AppUpdateNotice({ pending: 1 });
    const markup = renderToStaticMarkup(queued); assert.match(markup, /Waiting for your saved changes/); assert.match(markup, /disabled=""/);
    const buttons = queued.props.children.filter(child => child?.type === 'button');
    buttons[0].props.onClick(); assert.equal(refreshedCount, 0, 'pending changes prevent refresh even via handler');
    AppUpdateNotice({ pending: 0 }).props.children.find(child => child?.type === 'button').props.onClick(); assert.equal(refreshedCount, 1);
    buttons[1].props.onClick(); assert.equal(laterCount, 1);
    state = { ...state, available: false }; assert.equal(AppUpdateNotice({ pending: 0 }), null);
    assert.match(renderToStaticMarkup(AppUpdateSettings({ pending: 0 })), /Check for updates/);
  } finally { React.useContext = originalContext; }

  const handlers = {}, appIcons = get('lib/app-icons.js').appIcons;
  let notification, navigation;
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://scene.example' }, addEventListener: (name, fn) => { handlers[name] = fn; }, registration: { showNotification: async (title, options) => { notification = options; } } },
    URL, Response, fetch: async (request, options) => { navigation = options; return new Response('online'); },
  });
  let completion;
  handlers.push({ data: { json: () => ({}) }, waitUntil: value => { completion = value; } }); await completion;
  assert.equal(notification.icon, appIcons.small); assert.equal(notification.badge, appIcons.small);
  handlers.fetch({ request: { url: 'https://scene.example/?source=homescreen', method: 'GET', mode: 'navigate' }, respondWith: value => { completion = value; } }); await completion;
  assert.equal(navigation.cache, 'no-store');
  let intercepted = false;
  handlers.fetch({ request: { url: 'https://scene.example/api/library', method: 'GET', mode: 'cors' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false, 'the update worker does not intercept account APIs');
  const manifest = get('lib/app-manifest.js').appManifest();
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/?source=homescreen'); assert.equal(manifest.icons[0].src, appIcons.small);
  console.log('PASS: uncached release checks, failed/offline responses, refresh URL preservation, pending-sync guard, dismiss action, stable install identity and updated notification icons.');
})().catch(error => { console.error(error); process.exitCode = 1; });
