// Run against compiled CommonJS application modules (same setup as personalisation.cjs).
const assert = require('node:assert/strict');
const path = require('node:path');
const {tasteProfile} = require(path.join(path.resolve(process.argv[2]), 'lib/taste-profile.js'));
const title = (id, fields = {}) => ({id: `tmdb-movie-${id}`, tmdbId: id, name: `Film ${id}`, kind: 'movie', year: 2001, genres: ['Drama'], summary: '', poster: null, offers: [], ...fields});
const like = (title, fields = {}) => ({title, liked: true, hidden: false, watched: false, ...fields});
const a = title(1, {genres: ['Drama', 'Drama', ' Comedy ', '']}), b = title(2, {year: 1999}),
  c = title(3, {kind: 'series', id: 'tmdb-tv-3', year: 2018, genres: ['Mystery']}),
  d = title(4, {year: null, genres: []}), hidden = title(5), low = title(6), watched = title(7);
const feedback = [like(a), like(b), like(d), like(hidden, {hidden: true}), like(low), like(watched, {liked: false, watched: true})];
const ratings = [{title: {...a, id: 'legacy-first'}, rating: 5}, {title: c, rating: 4}, {title: hidden, rating: 5}, {title: low, rating: 2}];
const before = JSON.stringify([feedback, ratings]);
const p = tasteProfile(feedback, ratings);
assert.equal(p.total, 4, 'like + rating counts once; hidden/low-rated/watched-only titles excluded');
assert.deepEqual([p.films, p.series], [3, 1]);
assert.deepEqual(p.genres, [{label: 'Drama', count: 2}, {label: 'Comedy', count: 1}, {label: 'Mystery', count: 1}], 'each genre counts once per title; ties stable');
assert.deepEqual(p.decades.map(b => b.label), ['2010s', '2000s', '1990s']);
assert.deepEqual([p.genreTitles, p.yearTitles], [3, 3], 'missing metadata is not fabricated');
assert.equal(JSON.stringify([feedback, ratings]), before, 'profile never mutates account data');
assert.equal(tasteProfile([], []).total, 0);
assert.equal(tasteProfile([like(a)], []).total, 1);
assert.equal(tasteProfile([], [{title: a, rating: 3}]).total, 0);
assert.equal(tasteProfile([], [{title: a, rating: null}]).total, 0, 'notes alone do not count');
assert.equal(tasteProfile([like(a)], [{title: a, rating: 3}]).total, 0, 'lower personal rating takes precedence');
assert.equal(tasteProfile([like(a)], [{title: a, rating: null}]).total, 1, 'clearing lower rating restores a like');
assert.equal(tasteProfile([like(a, {liked: false})], []).total, 0, 'removing a like updates the profile');
assert.equal(tasteProfile(Array.from({length: 20}, (_, i) => like(title(i + 100))), []).total, 20, 'whole profile is not capped at recommendation seed limit');
const sameIdDifferentKind = tasteProfile([like(title(44)), like(title(44, {id: 'tmdb-tv-44', kind: 'series', name: 'Series 44'}))], []);
assert.equal(sameIdDifferentKind.total, 2, 'movie and series TMDB namespaces remain distinct');
assert.equal(tasteProfile([like(a), like({...a, id: 'old', imdbId: 'tt1'})], []).total, 1, 'legacy aliases do not inflate counts');
assert.equal(tasteProfile([like(title(8, {year: 0})), like(title(9, {year: NaN}))], []).yearTitles, 0);
console.log('PASS: taste profile counts, positive signals, exclusions, metadata gaps, identity, updates and immutability.');
