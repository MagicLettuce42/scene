import assert from "node:assert/strict";

// Run against the final production build under `wrangler dev --local`.
// No credentials or authenticated requests are needed for this regression.
const origin = process.argv[2];
assert.ok(origin, "Pass the local production Worker origin");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
for (const [route, heading] of [["/", "Your next great watch."], ["/signup", "Create your Scene account."]]) {
  const response = await fetch(new URL(route, origin));
  const html = await response.text();
  assert.equal(response.status, 200, `${route} must survive Worker SSR module initialization`);
  assert.ok(html.includes(heading), `${route} must render the actual sign-in component`);
  assert.ok(html.includes("Checking your account"), `${route} must retain the normal auth gate`);
  assert.ok(!html.includes('id="__next_error__"'), `${route} must not return the framework error shell`);
  const script = html.match(/<script[^>]*src="([^"]+)"/);
  assert.ok(script, `${route} must include hydration JavaScript`);
  assert.equal((await fetch(new URL(script[1], origin))).status, 200);
}
console.log("Production Worker sign-in/signup SSR and hydration asset regression checks passed");
