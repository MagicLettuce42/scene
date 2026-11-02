# Scene

UK film, TV and gaming discovery app. React, TypeScript, Vinext and Cloudflare Workers, with Supabase authentication and private per-user libraries.

Source imported from published Scene v90 (cfba84406c71b31a43c47188ddc65a745e924c09). Includes fast search, unconfirmed availability results and the search-suggestion tap fix.

## Run locally

Use Node 22+ and the pnpm version in package.json. Run `corepack enable`, `pnpm install --frozen-lockfile`, then `pnpm dev`. Copy `.env.example` to `.env.local` and configure your own values. Never commit credentials or user data.

## Deploy to your Cloudflare account

Connect this repository to a Workers project named `scene`. Build with `pnpm build`; deploy with `pnpm deploy`. Output is the Worker configuration in `dist/server/wrangler.json`. This is a server application, not a GitHub Pages static site.

Configure TMDB_API_KEY, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as Worker runtime variables/secrets; WATCHMODE_API_KEY is optional. Preserve the existing Supabase project to keep user accounts and saved libraries. Configure the new origin in Supabase's Site URL and allowed authentication redirects before switching users to the new address. Validate login, signup/reset links, library sync and title details first. Keep the current deployment until this is verified.

No Cloudflare account, production credentials, database records, private QA screenshots or original Git history are included. Database migration scripts describe schema, not user data. Existing deployments must not re-run bootstrap SQL blindly. Replace owner@example.invalid with the intended owner only when provisioning a separate database.

## Public catalogue caching

On an HTTPS custom domain, the Worker uses Cloudflare's Cache API for allowlisted public TMDB title details, seasons, related titles, people, genres and provider lists. Entries last up to 15 minutes; the memory cache preserves the same freshness deadline. Cache keys contain no API credentials or incoming authentication headers. Search, personalised discovery, account and library responses are excluded; authenticated API responses remain `no-store`.

The shared cache is bypassed on `workers.dev` and local previews. Existing in-memory caching continues there. No new bucket, database, namespace or secret is needed. Cache failures fall back to the upstream catalogue. Cache API entries are local to each Cloudflare data centre; confirm a cache hit on the connected production custom domain before claiming a live performance gain.

## Account subdomain rename

The account subdomain is `leardigital`, giving Scene the address `https://scene.leardigital.workers.dev`. The origin allowlist supports both this address and the previous `benlear439` address during the transition. Invitation links use the trusted origin forwarded by the Worker.

Before renaming, add the new Scene root, `/?confirmed=1` and `/reset-password` redirect URLs in Supabase while keeping the existing URLs. Protect `clearbook-finances.leardigital.workers.dev` with the existing Clearbook Cloudflare Access application, retaining its policies, audience and team domain. Renaming the account subdomain changes all account Workers' `workers.dev` addresses. After the rename, verify both sites and set Supabase's Site URL to the new Scene address. Update old bookmarks, Home Screen installations and notification permissions.

## Privacy and accessibility

Public pages at `/privacy`, `/terms`, `/cookies`, `/delete-account` and `/accessibility` are available before sign-in. The operator approved public display of Ben Lear and ben.digitalservices@outlook.com. SCENE_OPERATOR_NAME and SCENE_PRIVACY_EMAIL can override these defaults in the Worker runtime. Review the operator details and actual provider retention/transfer settings when changing hosting or account arrangements; these pages describe the app and are not a legal or WCAG certification.

Optional performance measurements require both this browser's unexpired privacy choice and the account sharing preference. Essential-only withdrawal clears the queue and aborts reporting. Signup and invitation acceptance require an unchecked Terms agreement; the notice version and acceptance time are stored in Auth metadata and included in data exports. That user-editable metadata is not used for permissions or role checks. No marketing opt-in is bundled with account creation. DM Sans is self-hosted under its bundled OFL licence.

`node tests/privacy-consent.cjs` checks default refusal, stale/invalid choices, queue clearing and transport cancellation. Existing signup, access-privacy, account-data, session-isolation and search-selection tests cover the related account and input behaviour. Never test permanent deletion on a real member's account.

## Checks

`pnpm exec tsc --noEmit`, `node tests/catalogue-edge-cache.cjs`, `node tests/search-speed.cjs`, `node tests/search-availability.cjs`, `node tests/search-suggestion-selection.cjs`, `pnpm build`.

## Attribution

TMDB metadata and images; JustWatch availability via TMDB; optional Watchmode links; TVmaze seed metadata; game artwork belongs to its respective owners. See in-app credits. This product uses the TMDB API but is not endorsed or certified by TMDB. Public source visibility does not grant a new license to third-party assets. No open-source license has been selected for this repository.
