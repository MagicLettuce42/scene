const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]);
const { loadHalloweenBatches, halloweenPageTitles, replaceHalloweenPage } = require(path.join(root, 'lib/halloween-loading.js'));
const titles = (start, length) => Array.from({ length }, (_, index) => ({ id: 'title-' + (start + index) }));
const batch = (page, entries, hasMore = true, message = null) => ({ page, titles: entries, hasMore, message, genres: [] });
async function run(responses, options = {}) {
 const attempts = [], updates = [], controller = options.controller || new AbortController();
 await loadHalloweenBatches({ page: 0, previous: [], force: false, signal: controller.signal,
  countVisible: rows => rows.length, request: async page => responses[page],
  onAttempt: page => attempts.push(page), onPage: pages => updates.push(pages), ...options });
 return { attempts, updates, pages: updates.at(-1) || [] };
}
(async () => {
 const seven = batch(0, titles(0, 7)), duplicate = batch(1, titles(0, 7));
 const full = await run([seven, duplicate, batch(2, titles(7, 10)), batch(3, titles(17, 10))]);
 assert.deepEqual(full.attempts, [0, 1, 2, 3]);
 assert.equal(halloweenPageTitles(full.pages).length, 27, 'continues past a seven-pick shelf and duplicate-only discovery');
 assert.equal(full.updates[0][0].titles.length, 7, 'first picks appear before the remaining batches finish');
 const watched = await run([batch(0, titles(0, 24)), batch(1, titles(24, 20))], {
  countVisible: rows => rows.filter(t => Number(t.id.slice(6)) >= 17).length,
 });
 assert.deepEqual(watched.attempts, [0, 1], 'visible cards determine the target after hiding watched titles');
 const more = await run({ 4: batch(4, titles(0, 27)), 5: batch(5, []), 6: batch(6, titles(27, 12)) }, { page: 4, previous: full.pages });
 assert.deepEqual(more.attempts, [4, 5, 6]);
 assert.equal(halloweenPageTitles(more.pages).length, 39, 'Load more seeks new cards across duplicates and empty batches');
 const capped = await run([seven, duplicate, batch(2, []), batch(3, [])]);
 assert.equal(capped.attempts.length, 4, 'automatic loading has a fixed request budget');
 const end = await run([seven, batch(1, [], false)]);
 assert.deepEqual(end.attempts, [0, 1], 'stops when the source is exhausted');
 const partial = await run([batch(0, titles(0, 7), true, 'Temporary failure')]);
 assert.deepEqual(partial.attempts, [0], 'partial pages remain available for explicit Retry');
 const retried = await run({ 0: batch(0, titles(0, 8)) }, { force: true, previous: full.pages });
 assert.deepEqual(retried.attempts, [0]);
 assert.equal(retried.pages.length, 4, 'Retry replaces only its page and retains later pages');
 const controller = new AbortController(), updates = [];
 await run([seven], { controller, request: async () => { controller.abort(); return seven; }, onPage: pages => updates.push(pages) });
 assert.equal(updates.length, 0, 'a canceled response cannot update a changed filter/category');
 const retained = [];
 await assert.rejects(run([seven], { request: async page => { if (page === 1) throw Error('network'); return seven; }, onPage: pages => retained.push(pages) }), /network/);
 assert.equal(retained[0][0].titles.length, 7, 'later failures keep successful cards visible');
 assert.equal(replaceHalloweenPage([seven, duplicate], batch(0, titles(0, 8))).length, 2);
 console.log('PASS: seven-pick autofill, duplicate/empty batches, watched filtering, Load more progress, request budget, source exhaustion, retry replacement, partial failure and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
