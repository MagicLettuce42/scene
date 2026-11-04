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

## Turnstile activation

The auth forms, confirmation resend and password-confirmed account deletion support Cloudflare Turnstile. With TURNSTILE_SITE_KEY unset, the widget is not loaded and current login behaviour is retained. This is rollout readiness, not active server-side CAPTCHA protection.

1. Create a Managed Turnstile widget in Cloudflare for `scene.leardigital.workers.dev`. Leave pre-clearance off. Add other active Scene hostnames only if their forms also run this integration.
2. Deploy the matching `scene-account-data` Edge Function and shared request/handler files before activation, so deletion can forward its separate CAPTCHA token during password verification.
3. Add the public site key as the Scene Worker's runtime variable TURNSTILE_SITE_KEY. No secret key belongs in the repository or frontend.
4. Confirm widgets appear on signup, sign-in, recovery, resend and deletion confirmation. Then enable CAPTCHA in Supabase Authentication → Bot and Abuse Protection, select Turnstile and enter the widget secret there. Supabase validates the tokens; a visible widget alone does not protect direct Auth API requests.
5. Test valid, missing, invalid, expired and reused tokens against the configured project, including resend and deletion password verification. Never delete a real member as a test. Old deployments sharing this Supabase project need matching token support or must direct users to the current site.

Tokens are held only in memory and reset after each attempt. Load errors and expiry keep configured forms blocked with a retry control. Existing MFA, owner checks and deletion safeguards remain in place. CSP's stricter script policy remains report-only pending separate nonce/hydration work; Turnstile origins are included in that report policy.

## Checks

`pnpm exec tsc --noEmit`, `node tests/catalogue-edge-cache.cjs`, `node tests/search-speed.cjs`, `node tests/search-availability.cjs`, `node tests/search-suggestion-selection.cjs`, `pnpm build`.

## Attribution

Games use a selected local catalogue rather than a live whole-market search. Resident Evil coverage includes 13 entries checked on 4 November 2026; remakes and the original Resident Evil 4 have separate identities. Search aliases include RE0–RE9 and Resident Evil 8/9. New IDs are included in the same client/server save validation as existing games. Cover artwork is served locally: Steam library artwork for the corresponding app IDs and Capcom’s published Requiem artwork. Original and cloud-only Switch editions are not conflated with native Switch 2 releases.

Resident Evil metadata sources: [Steam franchise listing](https://store.steampowered.com/search/?franchise=Resident+Evil), [Capcom’s PS5/Series update announcement](https://game.capcom.com/residentevil/de/news-2035.html), [Capcom’s RE4 release announcement](https://news.capcomusa.com/2023/03/24/resident-evil-4-is-out-now/), [Nintendo’s platform catalogue](https://www.nintendo.com/us/whatsnew/heres-every-resident-evil-game-available-for-nintendo-switch-2-or-nintendo-switch/), and [Capcom’s Requiem product details](https://www.capcom.co.jp/ir/english/news/html/e260316.html). Asset IDs and verified store links are retained in `lib/game-catalogue.json`. Regression checks: `node tests/game-search-coverage.cjs` and `node tests/gaming.cjs <temporary-compiled-root>`.

TMDB metadata and images; JustWatch availability via TMDB; optional Watchmode links; TVmaze seed metadata; game artwork belongs to its respective owners. See in-app credits. This product uses the TMDB API but is not endorsed or certified by TMDB. Public source visibility does not grant a new license to third-party assets. No open-source license has been selected for this repository.

## Availability discrepancies

Film and TV search and suggestions use the same selected-service scope as browsing: only subscription/free offers on the selected services are displayed. Autocomplete requests metadata and reuses known provider data without starting availability lookups. Submitted searches stream checked results as they finish, with a maximum of four concurrent UK availability checks and a four-second timeout for each provider response. Cancellation stops scheduling more checks. Completed successful searches are cached per account; partial failures are not cached. Unconfirmed, rental-only and other-service matches are hidden. Saved watchlist history is retained with its existing availability labels. Streamed searches use a different cache key from pre-change searches.

Search regression checks: `node tests/search-stream.cjs` covers progressive results, slow providers, partial responses and account changes; `node tests/search-speed.cjs` verifies that autocomplete cannot trigger provider fanout. Shared control spacing, wrapping and pagination are defined at the end of `app/globals.css`.

The title dialog automatically refreshes UK TMDB availability whenever a title is opened (`refresh=1`), including saved titles and cached search results. This bypasses the browser cache and older server/edge entries; upstream results under one minute old are reused. Successful checks update the displayed title, saved library and matching cards. A failed check keeps the previous listing with a warning and a retry button. The displayed retrieval date is preserved when a server cache is reused and is not a provider verification date. A refresh cannot repair an incorrect upstream feed.

`lib/availability-corrections.ts` holds narrowly scoped, source-linked UK corrections, with exact TMDB identity, review date and expiry. They also apply to stale saved records in cards, service filters and watch options. Resident Evil: Retribution (71679) has a Disney+ correction reviewed 3 November 2026, expiring 10 November; re-check the UK source before extending it. Do not add replacement offers without evidence. Users can report discrepancies directly below the viewing options.

Run `node tests/availability-corrections.cjs` and `node tests/catalogue-edge-cache.cjs` for correction and refresh regression checks.

