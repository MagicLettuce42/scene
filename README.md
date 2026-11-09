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

## Wider games search (IGDB)

Scene supports server-side IGDB searches through `/api/games`, with 20 database results per page plus selected alias matches on the first page, bounded pagination, cached public metadata and server-only Twitch application credentials. Games remain independent of film/TV services and their loading state. Existing selected-catalogue IDs are preserved when the edition identity matches; unrelated remakes, remasters and originals remain separate. Search covers IGDB’s database, whose completeness and platform metadata can vary. Explore retains selected highlights; remote games saved from search appear in My games with their metadata retained across devices.

Activation requires the Scene Cloudflare Worker to have **both** `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` as runtime secrets. These are app credentials, not a member’s Twitch login. Never put values in this repository, a `NEXT_PUBLIC_` variable, a public Scene form or chat. Until configured, the API explicitly returns selected-catalogue matches with a setup message. During upstream outages, previously saved games retain their metadata/progress and selected matches remain available; a failed wider search is not cached as a complete result.

Owner setup:
1. Use a Twitch account with 2FA and register a **Confidential** application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). IGDB does not use its redirect URL; the IGDB instructions recommend localhost.
2. Add that application’s Client ID and Client Secret directly to the **scene** Worker as the two runtime secrets above, then deploy that configuration. The server obtains/renews its own app access token.
3. Test a game outside Scene’s selected catalogue, load another result page, save it to Play later, reload, and update its progress in My games. Confirm a second member cannot see the first member’s game collection. Inspect Worker logs for generic failure messages if needed, without printing secrets or bearer tokens.

The non-commercial API setup and any future monetized use must follow the current [IGDB partnership terms](https://api-docs.igdb.com/#partnership). Visible IGDB attribution is included beside live results and saved provider data. Implementation references: [IGDB authentication/rate limits/fields](https://api-docs.igdb.com/) and [Twitch client-credentials tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).

`gameDetails` is an optional field in the existing private JSON library document; this change needs no new database table or schema migration. Newly saved provider IDs are checked against IGDB server-side, and caller-provided metadata is replaced with canonical public metadata before saving. Already saved metadata allows progress updates/removal without contacting IGDB. All reads/writes retain the authenticated user’s existing Supabase client and revision checks. Credentials remain server-side; only bounded public game metadata reaches the client. Search requests send the game query/IDs to IGDB, never the member’s email, token or private notes.

Checks: `node tests/igdb.cjs`, `node tests/remote-game-library.cjs`, the existing game/search/account-isolation checks, TypeScript, and the production build. A fixture-backed check is not a live credential test: do not claim activation until the two runtime secrets and a successful authenticated live search are confirmed.

## Attribution

The selected fallback catalogue contains 57 games; wider search uses IGDB when configured. Resident Evil coverage includes 13 entries checked on 4 November 2026; remakes and the original Resident Evil 4 have separate identities. Search aliases include RE0–RE9 and Resident Evil 8/9. New IDs are included in the same client/server save validation as existing games. Cover artwork is served locally: Steam library artwork for the corresponding app IDs and Capcom’s published Requiem artwork. Original and cloud-only Switch editions are not conflated with native Switch 2 releases.

Resident Evil metadata sources: [Steam franchise listing](https://store.steampowered.com/search/?franchise=Resident+Evil), [Capcom’s PS5/Series update announcement](https://game.capcom.com/residentevil/de/news-2035.html), [Capcom’s RE4 release announcement](https://news.capcomusa.com/2023/03/24/resident-evil-4-is-out-now/), [Nintendo’s platform catalogue](https://www.nintendo.com/us/whatsnew/heres-every-resident-evil-game-available-for-nintendo-switch-2-or-nintendo-switch/), and [Capcom’s Requiem product details](https://www.capcom.co.jp/ir/english/news/html/e260316.html). Asset IDs and verified store links are retained in `lib/game-catalogue.json`. Regression checks: `node tests/game-search-coverage.cjs` and `node tests/gaming.cjs <temporary-compiled-root>`.

TMDB metadata and images; JustWatch availability via TMDB; optional Watchmode links; TVmaze seed metadata; game artwork belongs to its respective owners. See in-app credits. This product uses the TMDB API but is not endorsed or certified by TMDB. Public source visibility does not grant a new license to third-party assets. No open-source license has been selected for this repository.

## Availability discrepancies

Film and TV search and suggestions use the same selected-service scope as browsing: only subscription/free offers on the selected services are displayed. Autocomplete requests metadata and reuses known provider data without starting availability lookups. Submitted searches stream checked results as they finish, with a maximum of four concurrent UK availability checks and a four-second timeout for each provider response. Cancellation stops scheduling more checks. Completed successful searches are cached per account; partial failures are not cached. Unconfirmed, rental-only and other-service matches are hidden. Saved watchlist history is retained with its existing availability labels. Streamed searches use a different cache key from pre-change searches.

Search regression checks: `node tests/search-stream.cjs` covers progressive results, slow providers, partial responses and account changes; `node tests/search-speed.cjs` verifies that autocomplete cannot trigger provider fanout. Shared control spacing, wrapping and pagination are defined at the end of `app/globals.css`.

The title dialog automatically refreshes UK TMDB availability whenever a title is opened (`refresh=1`), including saved titles and cached search results. This bypasses the browser cache and older server/edge entries; upstream results under one minute old are reused. Successful checks update the displayed title, saved library and matching cards. A failed check keeps the previous listing with a warning and a retry button. The displayed retrieval date is preserved when a server cache is reused and is not a provider verification date. A refresh cannot repair an incorrect upstream feed.

`lib/availability-corrections.ts` holds narrowly scoped, source-linked UK corrections, with exact TMDB identity, review date and expiry. They also apply to stale saved records in cards, service filters and watch options. Resident Evil: Retribution (71679) has a Disney+ correction reviewed 3 November 2026, expiring 10 November; re-check the UK source before extending it. Do not add replacement offers without evidence. Users can report discrepancies directly below the viewing options.

Run `node tests/availability-corrections.cjs` and `node tests/catalogue-edge-cache.cjs` for correction and refresh regression checks.


Manga discovery uses Kitsu’s public manga metadata API. Members keep reading status, fractional chapter progress and whole volume progress in their private Scene library. Manga is under More → Manga on phones, with a dedicated My manga list and search. Source chapter/volume totals may be unknown; no manga pages are hosted.

Additional official Steam library covers (9 November 2026): Baldur’s Gate 3 (1086940), Hades II (1145350), Elden Ring (1245620), Clair Obscur: Expedition 33 (1903340), Cyberpunk 2077 (1091500), Split Fiction (2001120). Each app title was verified through Steam appdetails before downloading its library_600x900 artwork. Catalogue artwork layout records preserve wide, square and portrait sources without cropping. IGDB cover rendering supports the documented retina 2x size.

Discover customization is in Account & settings → Home screen & poster size: Films & TV, Manga focus, Everything, plus per-shelf visibility and ordering. New manga and games shelves default to hidden for existing accounts. Manga focus replaces film/TV shelves with Manga picks and Continue reading manga, independently of streaming services.

### Viewing regions

Members choose United Kingdom (`GB`) or United States (`US`) on public sign-up, in welcome setup, or in **Account → Region & services**. The private library stores `preferences.region` (legacy accounts default to `GB`). Service selections are filtered to that country; saved titles, ratings, episode and manga progress are retained. Country changes discard incompatible offer snapshots and recheck unchecked saved titles automatically when enabled.

Catalogue requests carry a validated `region` query parameter. Request-local async context scopes TMDB discovery, hydration, recommendations and Watchmode links. All-country raw TMDB responses may be shared; normalized titles, browser caches and tab snapshots retain their country. Missing country offers never fall back to another country's data. Background checks read the account region; alert comparisons and delivery guards require matching countries.

US support includes current service availability and regional cinema/digital dates. The reviewed streaming arrival/leaving announcements and release-day reminders still cover the UK only and are excluded for US users. Availability alerts work in both countries; the existing delivery window remains 9am–9pm UK time. Movie Night currently requires participants to use the same country.

Database changes: `supabase/changes/us-service-regions.sql`. Deploy `scene-watchlist-refresh` with `_shared/watchlist-catalogue.ts` and `scene-release-reminders` alongside the web release. Validate with `node tests/regions.cjs`, `node tests/worker-regions.cjs`, `tests/service-regions-access.sql` (transaction rolled back), and existing search, service, sign-up and session regression tests.

### Passkey sign-in

Passkeys use Supabase Auth’s native WebAuthn ceremonies (experimental opt-in in the pinned SDK). Members register, rename and remove their own passkeys in **Account → Security & sessions → Passkeys**. The sign-in screen offers passkeys on supported secure browsers after `/api/auth/passkeys` confirms the provider is enabled. Password recovery and Scene’s member, revoked-session and authenticator MFA policies still apply. No biometric data or private passkey keys enter Scene storage.

One provider setup step is required in Supabase **Authentication → Passkeys**:

- Enable Passkey authentication.
- Relying Party Display Name: `Scene`.
- Relying Party ID: `scene.leardigital.workers.dev`.
- Relying Party Origins: `https://scene.leardigital.workers.dev`.

The RP ID must remain stable; moving to a different domain requires passkey re-enrollment. The owner sees these setup values when the provider is disabled. After activation, refresh availability in Settings, then add a passkey on a real device. Registration and sign-in are initiated explicitly; browser cancellation leaves password sign-in available. Existing MFA users still complete authenticator verification.

Validation: `node tests/passkeys.cjs`, sign-up/account/session regression tests, TypeScript checks and production build. Hardware biometrics require verification on a real supported device; UI previews use sample credentials only.
