const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(process.argv[2]);
const privacy = require(path.join(root, 'supabase/functions/_shared/access-privacy.js'));
const readAccessRequest = require(path.join(root, 'supabase/functions/_shared/access-request.js')).readAccessRequest;
const email = 'private-person@example.invalid', expires = new Date(Date.now() + 86400000).toISOString();
const members = [{ user_id: 'owner-id', display_name: 'Owner', role: 'owner', active: true },
  { user_id: 'member-id', email, display_name: email, role: 'member', active: true }];
const invites = [{ token_hash: 'a'.repeat(64), email, expires_at: expires }];
const projected = privacy.privateAccessResponse('list', { members, invites, email });
assert.ok(!JSON.stringify(projected).includes('@'));
assert.equal(projected.members[1].display_name, 'Scene member');
assert.equal(projected.invites[0].label, 'Invitation AAAAAAAA');
assert.equal(projected.invites[0].token_hash, invites[0].token_hash, 'cancellation IDs remain available');
assert.equal(members[1].email, email, 'response filtering does not modify stored identities');
for (const action of ['inspect', 'join', 'invite']) {
  const response = privacy.privateAccessResponse(action, { email, accepted: true, expiresAt: expires, url: 'https://scene.test/#invite=fixture' });
  assert.ok(!JSON.stringify(response).includes(email), action);
}
assert.equal(privacy.invitedEmailMatches(' PRIVATE-PERSON@example.invalid ', email), true);
for (const value of ['', undefined, 'someone-else@example.invalid']) assert.equal(privacy.invitedEmailMatches(value, email), false);

let handler, role = 'owner', adminReady = true, protectedCalls = 0;
const selections = [];
function from(table) {
  let columns;
  const chain = {
    select(value) { columns = value; selections.push({ table, columns }); return this; },
    eq() { return this; }, is() { return this; }, gt() { return this; }, delete() { return this; },
    insert() { return Promise.resolve({ error: null }); },
    order() { return Promise.resolve({ data: table === 'scene_members' ? members : invites, error: null }); },
    maybeSingle() { return Promise.resolve({ data: table === 'scene_members'
      ? columns === 'role,active' ? { role, active: true } : { user_id: 'member-id' }
      : { email, role: 'member', expires_at: expires, claimed_at: null }, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject); },
  };
  return chain;
}
const admin = { from, auth: {
  getUser: async () => ({ data: { user: { id: 'owner-id' } }, error: null }),
  admin: { updateUserById: async () => { protectedCalls++; return { error: null }; } },
}, rpc: async () => { protectedCalls++; return { error: null }; } };
const caller = { rpc: async name => ({ data: name === 'scene_security_state' ? { sessionValid: true, adminReady } : { allowed: true }, error: null }) };
const env = { SUPABASE_URL: 'https://scene.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', SUPABASE_ANON_KEY: 'fixture-public-key' };
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(process.cwd(), 'supabase/functions/scene-access/index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, {
  exports: {}, Request, Response, TextEncoder, TextDecoder, crypto: webcrypto, console,
  Deno: { env: { get: name => env[name] }, serve: value => { handler = value; } },
  require: name => {
    if (name.startsWith('npm:@supabase/supabase-js@')) return { createClient: (_url, key) => key === env.SUPABASE_ANON_KEY ? caller : admin };
    if (name.endsWith('/access-request.ts')) return { readAccessRequest };
    if (name.endsWith('/access-privacy.ts')) return privacy;
    if (name.endsWith('/scene-origins.ts')) return require(path.join(root, 'supabase/functions/_shared/scene-origins.js'));
    throw Error('Unexpected import: ' + name);
  },
  fetch: () => { throw Error('Privacy tests must never use the network'); },
});
const request = (body, authenticated = true) => new Request('https://scene.test/functions/v1/scene-access', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer fixture-token' } : {}) }, body: JSON.stringify(body),
});
(async () => {
  assert.equal((await handler(request({ action: 'list' }, false))).status, 401);
  role = 'member'; assert.equal((await handler(request({ action: 'list' }))).status, 403);
  role = 'owner'; adminReady = false; assert.equal((await handler(request({ action: 'list' }))).status, 403);
  adminReady = true;
  const list = await handler(request({ action: 'list' }));
  assert.equal(list.status, 200); assert.ok(!(await list.text()).includes('@'));
  assert.ok(selections.filter(s => s.columns !== '*' && s.columns !== 'role,active').every(s => !s.columns.split(',').includes('email')), 'management list queries do not select email');
  const inspected = await handler(request({ action: 'inspect', token: 'b'.repeat(64) }, false));
  assert.deepEqual(await inspected.json(), { emailRequired: true, expiresAt: expires });
  const invalid = await handler(request({ action: 'join', token: 'b'.repeat(64), email: 'wrong@example.invalid', name: 'Fixture', password: 'fixture-password-long' }, false));
  assert.equal(invalid.status, 400); assert.equal(protectedCalls, 0, 'email binding is checked before account changes');
  const missingTerms = await handler(request({ action: 'join', token: 'b'.repeat(64), email, name: 'Fixture', password: 'fixture-password-long' }, false));
  assert.equal(missingTerms.status,400);assert.equal(protectedCalls,0,'joining without Terms acceptance must not change accounts');
  const joined = await handler(request({ action: 'join', token: 'b'.repeat(64), email: email.toUpperCase(), name: 'Fixture', password: 'fixture-password-long', termsAccepted:true,termsVersion:'2026-11-02' }, false));
  assert.equal(joined.status, 200); assert.deepEqual(await joined.json(), { accepted: true });
  assert.equal(protectedCalls, 2, 'matching recipient still redeems the invite and completes setup');
  const invited = await handler(request({ action: 'invite', email }));
  assert.equal(invited.status, 200);
  const invitation = await invited.json();
  assert.match(invitation.url, /#invite=[a-f0-9]{64}$/); assert.ok(!JSON.stringify(invitation).includes(email));
  console.log('PASS: email-free access responses, private display-name fallback, recipient-bound invites, owner/MFA gates and invitation creation/redemption using mocked services only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
