# Scene

UK film, TV and gaming discovery app. React, TypeScript, Vinext and Cloudflare Workers, with Supabase authentication and private per-user libraries.

Source imported from published Scene v90 (cfba84406c71b31a43c47188ddc65a745e924c09). Includes fast search, unconfirmed availability results and the search-suggestion tap fix.

## Run locally

Use Node 22+ and the pnpm version in package.json. Run `corepack enable`, `pnpm install --frozen-lockfile`, then `pnpm dev`. Copy `.env.example` to `.env.local` and configure your own values. Never commit credentials or user data.

## Deploy to your Cloudflare account

Connect this repository to a Workers project named `scene`. Build with `pnpm build`; deploy with `pnpm deploy`. Output is the Worker configuration in `dist/server/wrangler.json`. This is a server application, not a GitHub Pages static site.

Configure TMDB_API_KEY, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as Worker runtime variables/secrets; WATCHMODE_API_KEY is optional. Preserve the existing Supabase project to keep user accounts and saved libraries. Configure the new origin in Supabase's Site URL and allowed authentication redirects before switching users to the new address. Validate login, signup/reset links, library sync and title details first. Keep the current deployment until this is verified.

No Cloudflare account, production credentials, database records, private QA screenshots or original Git history are included. Database migration scripts describe schema, not user data. Existing deployments must not re-run bootstrap SQL blindly. Replace owner@example.invalid with the intended owner only when provisioning a separate database.

## Checks

`pnpm exec tsc --noEmit`, `node tests/search-speed.cjs`, `node tests/search-availability.cjs`, `node tests/search-suggestion-selection.cjs`, `pnpm build`.

## Attribution

TMDB metadata and images; JustWatch availability via TMDB; optional Watchmode links; TVmaze seed metadata; game artwork belongs to its respective owners. See in-app credits. This product uses the TMDB API but is not endorsed or certified by TMDB. Public source visibility does not grant a new license to third-party assets. No open-source license has been selected for this repository.
