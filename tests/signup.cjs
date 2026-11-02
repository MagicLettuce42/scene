const assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(process.argv[2]);
const { finishSceneEmailConfirmation, registerScene, resendSceneConfirmation, validateRegistration } = require(path.join(root, 'lib/auth/registration.js'));
(async () => {
 for (const marker of ['', '&confirmed=1']) {
  const events = [];
  const error = await finishSceneEmailConfirmation({ auth: { exchangeCodeForSession: async code => {
   events.push(['exchange', code]); return { error: null };
  } } }, 'https://scene.test/?tab=watchlist&code=fixture-code' + marker + '#saved', address => events.push(['replace', address]));
  assert.equal(error, null);
  assert.deepEqual(events, [['replace', '/?tab=watchlist#saved'], ['exchange', 'fixture-code']], 'callbacks work without a marker and remove codes before network requests');
 }
 let exchanged = false;
 assert.equal(await finishSceneEmailConfirmation({ auth: { exchangeCodeForSession: async () => { exchanged = true; } } }, 'https://scene.test/', () => assert.fail('ordinary visits must not replace history')), null);
 assert.equal(exchanged, false);
 for (const throws of [false, true]) {
  let cleared;
  const error = await finishSceneEmailConfirmation({ auth: { exchangeCodeForSession: async () => {
   if (throws) throw Error('fixture failure');
   return { error: { message: 'expired fixture' } };
  } } }, 'https://scene.test/?code=fixture-code', address => { cleared = address; });
  assert.equal(cleared, '/');
  assert.match(error, /sign in below with your email and password/);
  assert.ok(!error.includes('fixture'));
 }
 const values = { name: '  New member  ', email: ' USER@example.com ', password: 'a-long-fixture-password', confirmation: 'a-long-fixture-password', origin: 'https://scene.test', termsAccepted: true };
 assert.equal(validateRegistration(values.name, values.email, values.password, values.confirmation), null);
 for (const change of [{ name: '' }, { name: 'x'.repeat(81) }, { email: 'invalid' }, { password: 'short' }, { confirmation: 'different' }]) {
  let called = false;
  await assert.rejects(registerScene({ auth: { signUp: async () => { called = true; } } }, { ...values, ...change }));
  assert.equal(called, false, 'invalid forms never reach Auth');
 }
 let submitted;
 const data = await registerScene({ auth: { signUp: async input => { submitted = input; return { data: { user: { id: 'fixture' }, session: null }, error: null }; } } }, values);
 assert.equal(data.session, null, 'email confirmation does not imply a signed-in session');
 assert.equal(submitted.email, 'user@example.com');
 assert.equal(submitted.options.data.display_name,'New member');
 assert.equal(submitted.options.data.terms_version,'2026-11-02');
 assert.ok(Number.isFinite(Date.parse(submitted.options.data.terms_accepted_at)));
 assert.deepEqual(Object.keys(submitted.options.data).sort(), ['display_name','terms_accepted_at','terms_version'], 'no role, active status or optional measurement consent comes from signup');
 await assert.rejects(registerScene({auth:{signUp:async()=>assert.fail('Terms refusal must not create an account')}},{...values,termsAccepted:false}),/Agree to the Terms/);
 assert.equal(submitted.options.emailRedirectTo, 'https://scene.test/?confirmed=1');
 await assert.rejects(registerScene({ auth: { signUp: async () => ({ data: {}, error: { status: 429 } }) } }, values), /Too many attempts/);
 await assert.rejects(registerScene({ auth: { signUp: async () => ({ data: {}, error: { code: 'email_address_not_authorized' } }) } }, values), /confirmation is not ready/);
 for (const email of ['', 'invalid', 'a'.repeat(255) + '@example.com']) {
  let called = false;
  await assert.rejects(resendSceneConfirmation({ auth: { resend: async () => { called = true; } } }, email, values.origin), /valid email/);
  assert.equal(called, false, 'invalid resend addresses never reach Auth');
 }
 let resendRequest;
 await resendSceneConfirmation({ auth: { resend: async input => { resendRequest = input; return { error: null }; } } }, values.email, values.origin);
 assert.deepEqual(resendRequest, { type: 'signup', email: 'user@example.com', options: { emailRedirectTo: 'https://scene.test/?confirmed=1' } }, 'resend requests only an existing signup confirmation and retains the production callback');
 for (const code of ['user_not_found', 'email_not_confirmed', 'email_already_confirmed'])
  assert.equal(await resendSceneConfirmation({ auth: { resend: async () => ({ error: { code } }) } }, values.email, values.origin), undefined, 'account state uses the same neutral response');
 await assert.rejects(resendSceneConfirmation({ auth: { resend: async () => ({ error: { status: 429 } }) } }, values.email, values.origin), /Too many attempts/);
 await assert.rejects(resendSceneConfirmation({ auth: { resend: async () => ({ error: { code: 'email_address_not_authorized' } }) } }, values.email, values.origin), /confirmation is not ready/);
 await assert.rejects(resendSceneConfirmation({ auth: { resend: async () => { throw Error('internal fixture failure'); } } }, values.email, values.origin), /^Error: Another confirmation email could not be requested/);
 const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
 require(path.join(root, 'app/components/seasonal.js')).useHalloween = () => true;
 const Access = require(path.join(root, 'app/components/scene-access.js')).default;
 const useState = React.useState; let slot = 0;
 React.useState = initial => useState(slot++ === 1 ? false : initial);
 try {
  const html = renderToStaticMarkup(React.createElement(Access, { initialMode: 'signup' }, null));
  for (const text of ['Create your Scene account', 'Display name', 'Confirm password', 'minLength="12"', 'autoComplete="new-password"', 'Create my Scene account', 'No invitation needed', 'href="/"','href="/privacy"','href="/terms"','class="terms-agreement"']) assert.ok(html.includes(text), text);
  assert.match(html, /type="checkbox" required=""/);
  assert.ok(!/<input type="checkbox" required="" checked/.test(html),'Terms start unchecked');
  assert.ok(!html.includes('Scene is invite-only'));
 } finally { React.useState = useState; }
 slot = 0; React.useState = initial => useState(slot++ === 1 ? false : initial);
 try {
  const html = renderToStaticMarkup(React.createElement(Access, null));
  assert.match(html, /href="\/signup"/); assert.match(html, /Create an account/);
  assert.match(html, /href="\/reset-password"/);
  assert.ok(!html.includes('<summary>Resend confirmation email</summary>'));
  assert.ok(!html.includes('Confirm password'));
 } finally { React.useState = useState; }
 const Resend = require(path.join(root, 'app/components/confirmation-resend.js')).default;
 const pendingHtml = renderToStaticMarkup(React.createElement(Resend, { email: values.email, recentlySent: true }));
 assert.match(pendingHtml, /disabled=""/); assert.match(pendingHtml, /Resend available in 60s/);
 assert.ok(!pendingHtml.includes('<input'), 'post-signup resend uses the submitted email');
 const recoveryHtml = renderToStaticMarkup(React.createElement(Resend, { email: 'user@example.com', onEmailChange: () => {} }));
 assert.match(recoveryHtml, /type="email"/); assert.match(recoveryHtml, /autoComplete="email"/);
 assert.ok(!recoveryHtml.includes('password'), 'resend never asks for a password');
 console.log('PASS: PKCE callbacks, signup validation/forms, resend validation and SDK contract, neutral account responses, rate/delivery errors, initial cooldown and sign-in recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });
