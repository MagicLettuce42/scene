// Safe fixtures only: verifies receipt-guarded undo without an auth service or database.
const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]);
const { emptyLibrary, applyMutation, validateMutation, titleKey } = require(path.join(root, 'lib/library-state.js'));
const { titles } = require(path.join(root, 'lib/catalogue.js'));
const title = { ...titles[0], id: 'tmdb-tv-123', tmdbId: 123, kind: 'series' };
const key = titleKey(title);
const batch = (id, operations, rest = {}) => ({ id, operations, ...rest });
const saved = batch('fixture-save-001', [{ type: 'title', title, fields: { saved: true, liked: true } }]);
const remove = batch('fixture-remove-001', [{ type: 'title', title, fields: { saved: false } }]);
const undo = batch('fixture-undo-001', [{ type: 'title', title, fields: { saved: true } }], { undoOf: remove.id, undoBase: saved.id });
const start = applyMutation(emptyLibrary(), saved), removed = applyMutation(start, remove);
const restored = applyMutation(removed, undo);
assert.equal(restored.entries[key].saved, true); assert.equal(restored.entries[key].liked, true);
assert.equal(removed.entries[key].saved, false, 'source is immutable');
assert.deepEqual(applyMutation(restored, undo), restored, 'retry is idempotent');
assert.ok(validateMutation({ revision: 2, ...undo }));
for (const patch of [{ undoOf: 12 }, { undoOf: undo.id }, { undoBase: undefined }, { undoBase: '__proto__' }])
  assert.equal(validateMutation({ revision: 2, ...undo, ...patch }), null);
// A remote edit after removal, even an ABA change back to the same value, invalidates undo.
const other = batch('fixture-other-001', [{ type: 'title', title, fields: { saved: true } }]);
const later = batch('fixture-later-001', [{ type: 'title', title, fields: { saved: false } }]);
const raced = applyMutation(applyMutation(removed, other), later);
assert.equal(applyMutation(raced, undo).entries[key].saved, false);
// A remote edit before the pending original was rebased also invalidates its stale inverse.
const rebased = applyMutation(applyMutation(start, other), remove);
assert.equal(applyMutation(rebased, undo).entries[key].saved, false);
assert.equal(applyMutation(emptyLibrary(), undo).entries[key], undefined, 'another account cannot receive old state');
const episodes = batch('fixture-episodes-001', [{ type: 'episode', title, season: 1, episodes: [1, 2], value: true }]);
const progress = applyMutation(restored, episodes);
const reverse = batch('fixture-episodes-undo', [
  { type: 'episode', title, season: 1, episodes: [1, 2], value: false },
  { type: 'tracking', title, value: false },
], { undoOf: episodes.id, undoBase: undo.id });
const undone = applyMutation(progress, reverse);
assert.equal(undone.entries[key].progress.episodes['1']['1'], false);
assert.equal(undone.entries[key].progress.tracking, false);
assert.equal(undone.entries[key].saved, true);
const newerEpisode = batch('fixture-episode-newer', [{ type: 'episode', title, season: 2, episodes: [1], value: true }]);
const changed = applyMutation(progress, newerEpisode), protectedState = applyMutation(changed, reverse);
assert.deepEqual(protectedState.entries, changed.entries, 'newer season progress is not overwritten');
// An unwatched action can be undone too, without restoring an entire old entry.
const unwatch = batch('fixture-unwatch-001', [{ type: 'episode', title, season: 1, episodes: [1], value: false }]);
const unwatchUndo = batch('fixture-unwatch-undo', [{ type: 'episode', title, season: 1, episodes: [1], value: true }], { undoOf: unwatch.id, undoBase: episodes.id });
assert.equal(applyMutation(applyMutation(progress, unwatch), unwatchUndo).entries[key].progress.episodes['1']['1'], true);
console.log('PASS: removal, episode watched/unwatched, bulk inverse, tracking preservation, immutable state, retry, validation, cross-account rejection, before/after rebase and ABA race protection.');
// Exercise the actual route, including an intervening write at the CAS boundary.
const auth = require(path.join(root, 'lib/auth/server.js'));
require(path.join(root, 'lib/release-feed.js')).readReleaseFeed = async () => ({ entries: [] });
let identity = 'fixture-account-a', row = { payload: removed, revision: 2 }, collide = false;
const client = { from() {
  const q = {}; const api = {
    select() { return api; }, eq(k,v) { q[k]=v; return api; },
    update(value) { q.update=value; return api; },
    async maybeSingle() {
      if (q.user_id !== identity) throw Error('Wrong account');
      if (q.update) {
        if (collide) { collide=false; row = { payload: applyMutation(row.payload,later), revision:row.revision+1 }; }
        if (q.revision !== row.revision) return {data:null,error:null};
        row={payload:q.update.payload,revision:q.update.revision};
        return {data:{revision:row.revision},error:null};
      }
      return {data:structuredClone(row),error:null};
    },
  }; return api;
} };
auth.requireSceneMember = async () => identity ? {client,user:{id:identity},error:null} : {error:Response.json({}, {status:401})};
const route = require(path.join(root,'app/api/library/route.js'));
const request = body => new Request('https://fixture.invalid/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
  collide=true;
  let result=await route.POST(request({revision:2,...undo})); assert.equal(result.status,409);
  result=await route.POST(request({revision:3,...undo})); const rejected=await result.json();
  assert.equal(result.status,200); assert.equal(rejected.undoSkipped,true); assert.equal(rejected.document.entries[key].saved,false);
  result=await route.POST(request({revision:2,...undo})); const retried=await result.json();
  assert.equal(retried.undoSkipped,true); assert.equal(retried.revision,4,'lost-response retry must not replay or falsely report success');
  row={payload:removed,revision:2}; result=await route.POST(request({revision:2,...undo}));
  const success=await result.json(); assert.equal(success.undoSkipped,false); assert.equal(success.document.entries[key].saved,true);
  identity=null; assert.equal((await route.POST(request({revision:3,...undo}))).status,401);
  console.log('PASS: actual library route atomic conflict, guarded rebase, skipped/successful undo responses, idempotent retry and unauthenticated rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
