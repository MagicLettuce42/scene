// Run with NODE_PATH=<checkout>/node_modules after compiling to CommonJS.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const get = p => require(path.join(root, p));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const episodes = get('lib/episodes.js');
const library = get('lib/library-state.js');
const seasons = [{ number: 0, episodeCount: 3 }, { number: 1, episodeCount: 2 }];
const complete = { tracking: true, episodes: { 1: { 1: true, 2: true } } };
const gap = { tracking: true, episodes: { 1: { 2: true } } };
assert.equal(episodes.allEpisodesWatched(seasons, complete), true, 'unwatched specials do not block completion');
assert.equal(episodes.allEpisodesWatched(seasons, gap), false, 'an earlier gap is not completion');
for (const uncertain of [[], [{ number: 0, episodeCount: 1 }], [{ number: 1, episodeCount: 0 }], [...seasons, { number: 2, episodeCount: 0 }]]) {
  assert.equal(episodes.allEpisodesWatched(uncertain, complete), false, 'missing regular episode counts are not completion');
}
assert.equal(episodes.allEpisodesWatched([...seasons, { number: 2, episodeCount: 1 }], complete), false, 'new seasons restore eligibility');
assert.equal(episodes.allEpisodesWatched([{ number: 1, episodeCount: 3 }], complete), false, 'new episodes restore eligibility');

const fixtures = new Map(), requests = [];
get('lib/client-cache.js').cachedJSON = async (url, signal, force) => {
  requests.push({ url, force });
  await Promise.resolve();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = fixtures.get(url);
  if (result instanceof Error) throw result;
  assert.ok(result, 'unexpected request ' + url);
  return result;
};
const NextUp = get('app/components/next-up.js').default;
const catalogue = (counts = [2]) => ({ status: 'Returning Series', seasons: counts.map((episodeCount, i) => ({ number: i + 1, episodeCount, name: 'Season ' + (i + 1), airDate: null })) });
function item(id, progress = complete, data = catalogue(), airDate = '2020-01-01') {
  const title = { id: 'tmdb-tv-' + id, tmdbId: id, name: 'Series ' + id, kind: 'series', year: 2020, genres: [], summary: '', poster: null, runtime: null, rating: null, offers: [] };
  const url = '/api/title/' + title.id + '/episodes';
  fixtures.set(url, data);
  if (!(data instanceof Error)) for (const season of data.seasons) fixtures.set(url + '?season=' + season.number, {
    ...data, season: season.number,
    episodes: Array.from({ length: season.episodeCount }, (_, n) => ({ number: n + 1, name: 'Episode ' + (n + 1), airDate, runtime: null })),
  });
  return { title, progress: structuredClone(progress) };
}

// Small hook/effect harness: exercises the actual NextUp/NextCard lifecycle without a browser.
function harness(props) {
  const instances = new Map();
  let dirty = true, tree, html;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  function render() {
    dirty = false;
    const effects = [];
    for (const instance of instances.values()) instance.active = false;
    function call(Component, componentProps, key) {
      let instance = instances.get(key);
      if (!instance) instances.set(key, instance = { slots: [], active: true });
      instance.active = true;
      let index = 0;
      const original = { useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback };
      React.useState = initial => {
        const i = index++;
        if (!(i in instance.slots)) instance.slots[i] = typeof initial === 'function' ? initial() : initial;
        return [instance.slots[i], update => {
          if (!instance.active) return;
          const next = typeof update === 'function' ? update(instance.slots[i]) : update;
          if (!Object.is(next, instance.slots[i])) { instance.slots[i] = next; dirty = true; }
        }];
      };
      React.useEffect = (effect, deps) => {
        const i = index++, previous = instance.slots[i];
        if (!previous || !same(previous.deps, deps)) {
          const slot = instance.slots[i] = { deps, cleanup: previous?.cleanup };
          effects.push(() => {
            if (!instance.active) return;
            slot.cleanup?.();
            slot.cleanup = effect();
          });
        }
      };
      React.useCallback = (fn, deps) => {
        const i = index++, previous = instance.slots[i];
        if (!previous || !same(previous.deps, deps)) instance.slots[i] = { fn, deps };
        return instance.slots[i].fn;
      };
      try { return Component(componentProps); } finally { Object.assign(React, original); }
    }
    function expand(node) {
      if (Array.isArray(node)) return node.map((child, index) => {
        const expanded = expand(child);
        return React.isValidElement(expanded) ? React.cloneElement(expanded, { key: child?.key ?? index }) : expanded;
      });
      if (!React.isValidElement(node)) return node;
      if (typeof node.type === 'function' && node.type.name === 'NextCard') return expand(call(node.type, node.props, node.key));
      return React.cloneElement(node, {}, expand(node.props.children));
    }
    tree = expand(call(NextUp, props, 'parent'));
    for (const [key, instance] of instances) if (!instance.active) {
      for (const slot of instance.slots) slot?.cleanup?.();
      instances.delete(key);
    }
    html = renderToStaticMarkup(tree);
    for (const effect of effects) effect();
    return html;
  }
  return {
    props, render,
    async settle() {
      for (let turn = 0; turn < 60; turn++) {
        render();
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return html;
      }
      assert.fail('Next up did not settle');
    },
    button(label) {
      const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' ? node : '';
      function find(node) {
        if (Array.isArray(node)) return node.map(find).find(Boolean);
        if (!React.isValidElement(node)) return null;
        return node.type === 'button' && text(node).trim() === label ? node.props : find(node.props.children);
      }
      return find(tree);
    },
  };
}
const cards = html => (html.match(/<article class="next-card">/g) || []).length;
const actions = { onOpen() {}, onEpisodes() {} };

(async () => {
  const tracked = [item(1), item(2), item(3), item(4, gap), item(5, gap, catalogue(), '2999-01-01'), item(6, gap, catalogue([]))];
  const compact = harness({ ...actions, items: tracked, compact: true });
  let html = await compact.settle();
  assert.equal(cards(html), 3, 'completed first three are replaced by later candidates');
  for (const id of [1, 2, 3]) assert.ok(!html.includes('Series ' + id), 'caught-up card hidden');
  assert.match(html, /Next up: Season 1, Episode/);
  assert.match(html, /Coming up: Season 1, Episode/);
  assert.match(html, /No episodes listed yet/, 'unknown catalogue remains visible');
  assert.equal(compact.button('Mark watched').disabled, false);

  const finished = harness({ ...actions, items: [item(10)], compact: true });
  assert.equal(await finished.settle(), '', 'all-complete Discover section disappears');
  finished.props.items = [item(10, gap)];
  html = await finished.settle();
  assert.equal(cards(html), 1, 'undoing an episode restores Next up');
  finished.props.items = [item(10)];
  assert.equal(finished.render(), '', 'marking the final episode hides immediately from known metadata');

  const full = harness({ ...actions, items: [item(11)] });
  html = await full.settle();
  assert.equal(cards(html), 0);
  assert.match(html, /You’re all caught up/);
  assert.match(html, /Caught-up series \(1\)/);
  assert.ok(full.button('Series 11'), 'progress remains accessible in Watching list');

  const unknown = harness({ ...actions, items: [item(12, complete, catalogue([2, 0])), item(13, gap, new Error('Offline'))] });
  html = await unknown.settle();
  assert.equal(cards(html), 2, 'unknown counts and request errors are not completion');
  assert.match(html, /Couldn’t load the next episode/);
  fixtures.set('/api/title/tmdb-tv-13/episodes', catalogue());
  item(13, gap);
  unknown.button('Retry').onClick();
  html = await unknown.settle();
  assert.ok(!html.includes('Couldn’t load'));
  assert.ok(requests.some(r => r.url === '/api/title/tmdb-tv-13/episodes' && r.force), 'retry still refreshes metadata');

  const many = harness({ ...actions, items: [...Array.from({ length: 13 }, (_, i) => item(100 + i)), ...Array.from({ length: 13 }, (_, i) => item(200 + i, gap))] });
  html = await many.settle();
  assert.equal(cards(html), 12, 'full list fills all twelve active slots after filtering');
  many.button('Show more series').onClick();
  assert.equal(cards(await many.settle()), 13, 'pagination counts active series');
  assert.equal(many.button('Show more series'), undefined);

  const newEpisode = harness({ ...actions, compact: true, items: [item(300, complete, catalogue([3]), '2999-01-01')] });
  html = await newEpisode.settle();
  assert.match(html, /Coming up: Season 1, Episode/);
  assert.equal(newEpisode.button('Mark watched'), undefined, 'Discover omits unusable actions for future episodes');
  assert.ok(newEpisode.button('Series 300'), 'episode details remain available from the title');
  assert.ok(!html.includes('View episodes &amp; watch options'), 'Discover avoids the duplicate details action');
  const fullFuture = harness({ ...actions, items: [item(302, gap, catalogue(), '2999-01-01')] });
  await fullFuture.settle();
  assert.equal(fullFuture.button('Mark watched').disabled, true, 'Watching list keeps its full episode controls');
  const newSeason = harness({ ...actions, compact: true, items: [item(301, complete, catalogue([2, 1]))] });
  assert.match(await newSeason.settle(), /Next up: Season 2, Episode/, 'newly listed seasons return a caught-up series');
  const empty = harness({ ...actions, items: [] });
  assert.match(await empty.settle(), /Keep your place in every series/, 'first-use empty state is retained');
  const before = library.applyOperations(library.emptyLibrary(), [{ type: 'episode', title: tracked[3].title, season: 1, episodes: [1, 2], value: true }]);
  const snapshot = JSON.stringify(before);
  const projected = library.projectLibrary(before).tracking;
  await harness({ ...actions, items: projected, compact: true }).settle();
  assert.equal(JSON.stringify(before), snapshot, 'filtering never mutates saved progress');
  assert.equal(library.projectLibrary(before).tracking.length, 1, 'completed series stay tracked');
  console.log('PASS: completed-series filtering, immediate completion/undo, replacement slots, pagination, caught-up access, missing data, retry, future/new episodes and retained tracking (hook/SSR checks, not browser QA).');
})().catch(error => { console.error(error); process.exitCode = 1; });
