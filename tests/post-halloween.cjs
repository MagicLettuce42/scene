const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]), get = p => require(path.join(root, p));
const seasonal = get('lib/seasonal.js'), state = get('lib/library-state.js');
const home = get('lib/home-preferences.js');
for (const [date, active] of [
  ['2026-09-30T22:59:00Z', false], ['2026-09-30T23:00:00Z', false],
  ['2026-10-31T23:59:00Z', false], ['2026-11-01T23:59:00Z', false], ['2026-11-02T00:00:00Z', false], ['2027-10-31T12:00:00Z', false],
]) assert.equal(seasonal.halloweenActive(new Date(date)), active, 'London seasonal boundary ' + date);
const october = new Date('2026-10-20T12:00:00Z'), november = new Date('2026-11-02T12:00:00Z');
const appManifest = get('lib/app-manifest.js').appManifest;
const octoberManifest = appManifest(october), novemberManifest = appManifest(november);
assert.equal(octoberManifest.id, novemberManifest.id, 'the installed app identity remains stable');
assert.equal(octoberManifest.start_url, novemberManifest.start_url);
assert.deepEqual(octoberManifest.icons, novemberManifest.icons, 'standard icons remain in use during Halloween');
assert.ok(octoberManifest.icons.every(icon => !icon.src.includes('halloween')));
for (const icon of octoberManifest.icons) {
  const png = require('node:fs').readFileSync('public' + icon.src.split('?')[0]), size = Number(icon.sizes.split('x')[0]);
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
}
const apple = require('node:fs').readFileSync('public/icons/apple-touch-icon.png');
assert.equal(apple.readUInt32BE(16), 180);
assert.equal(seasonal.effectiveTheme('daylight', true, october), 'daylight');
assert.equal(seasonal.effectiveTheme('daylight', false, october), 'daylight');
assert.equal(seasonal.effectiveTheme('daylight', true, november), 'daylight', 'usual theme returns after the event');
const original = state.applyOperations(state.emptyLibrary(), [{ type: 'theme', value: 'daylight' }]);
assert.equal(state.projectLibrary(original).seasonal, true, 'existing accounts default to seasonal themes');
const disabled = state.applyOperations(original, [{ type: 'seasonal', value: false }]);
assert.equal(state.projectLibrary(disabled).theme, 'daylight');
assert.equal(state.projectLibrary(JSON.parse(JSON.stringify(disabled))).seasonal, false, 'preference round-trip');
assert.equal(state.projectLibrary(original).seasonal, true, 'no source mutation');
for (const value of ['false', null, 1]) assert.equal(state.validateMutation({ id: 'halloween-test-123', revision: 0, operations: [{ type: 'seasonal', value }] }), null);
assert.ok(state.validateMutation({ id: 'halloween-test-123', revision: 0, operations: [{ type: 'seasonal', value: false }] }));
const custom = home.resolveHome({ sections: ['next', 'personal'], hidden: ['halloween'] });
assert.deepEqual(custom.sections.slice(0, 2), ['next', 'personal']);
assert.ok(!custom.hidden.includes('halloween'), 'retired shelf is removed');
const themes = get('lib/themes.js');
assert.equal(themes.resolveTheme('halloween'), themes.defaultTheme);
assert.equal(seasonal.effectiveTheme('halloween', true, october), themes.defaultTheme);
assert.ok(!themes.themes.some(t => t.id === 'halloween'));
const legacyHome = { ...home.defaultHome(), sections: ['halloween', ...home.defaultHome().sections].reverse(), hidden: ['halloween', 'tonight'] };
const migrated = home.resolveHome(legacyHome);
assert.deepEqual(migrated.sections, legacyHome.sections.filter(id => id !== 'halloween'));
assert.deepEqual(migrated.hidden, ['tonight']);
assert.ok(legacyHome.hidden.includes('halloween'), 'source is not mutated');
const legacyDoc = JSON.parse(JSON.stringify(original));
legacyDoc.preferences.theme = 'halloween';
legacyDoc.preferences.home = legacyHome;
assert.equal(state.projectLibrary(legacyDoc).theme, themes.defaultTheme);
assert.deepEqual(state.projectLibrary(legacyDoc).home, migrated);

const savedDoc = state.applyOperations(original, [{type: 'title', title: {id:'tmdb-movie-101',tmdbId:101,name:'Saved film',kind:'movie',year:2021,genres:[],summary:'',poster:null,offers:[]}, fields:{saved:true,liked:true}}]);
const savedBefore = JSON.stringify(savedDoc.entries);
savedDoc.preferences.theme = 'halloween';
assert.equal(state.projectLibrary(savedDoc).theme, themes.defaultTheme);
assert.equal(JSON.stringify(savedDoc.entries), savedBefore, 'saved lists and feedback are untouched');
for (const theme of themes.themes) assert.equal(seasonal.effectiveTheme(theme.id, true, october), theme.id);
console.log('Post-Halloween migration, future dates, themes and saved-data checks passed');
