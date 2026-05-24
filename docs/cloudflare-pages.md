# Cloudflare Pages Setup

## Build Settings

Use these Cloudflare Pages settings:

```txt
Framework preset: React (Vite)
Build command: pnpm build
Build output directory: dist
```

The repo also includes `wrangler.jsonc` with `pages_build_output_dir: "dist"` for Pages-aware local development.

## Frontend Environment Variables

Set these in Cloudflare Pages project settings:

```bash
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
VITE_AUTH0_REDIRECT_URI=https://<your-pages-domain>
VITE_API_BASE_URL=
```

Leave `VITE_API_BASE_URL` blank when the frontend and Pages Functions are deployed together.

## Server Environment Variables

Set these as Pages Function environment variables/secrets:

```bash
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
BACKBOARD_API_KEY=
BACKBOARD_BASE_URL=https://app.backboard.io/api
FRONTEND_ORIGIN=https://<your-pages-domain>
APP_ENV=production
```

`AUTH0_AUDIENCE` must match `VITE_AUTH0_AUDIENCE`.

## Auth0

Create an Auth0 API for the backend. Use its Identifier as the audience, for example:

```txt
https://api.never-again.app
```

Add the production Pages URL to the Auth0 SPA application:

```txt
Allowed Callback URLs
Allowed Logout URLs
Allowed Web Origins
```

## D1

Create a D1 database and bind it to the Pages project with this binding name:

```txt
DB
```

After creating the real D1 database, replace the placeholder `database_id` in `wrangler.jsonc`.

Run the first migration from:

```txt
migrations/0001_users.sql
```

The `/api/me` function expects the `users` table from that migration.

## R2

Create an R2 bucket and bind it to the Pages project with this binding name:

```txt
TRANSCRIPTS_BUCKET
```

The current config uses:

```txt
bucket_name: never-again-transcripts
preview_bucket_name: never-again-transcripts-local
```

Imports write raw transcripts to R2 before creating a queued job row.
The current import flow also writes a normalized Markdown version that redacts likely secrets, preserves command blocks, and compresses obvious code blocks.

## Local Phase 3 Verification

Use this before deploying.

### 1. Frontend env

For local frontend testing on Vite, `.env` should include:

```bash
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=https://api.never-again.app
VITE_AUTH0_REDIRECT_URI=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8788
```

`VITE_AUTH0_AUDIENCE` must be the Identifier from Auth0 Applications > APIs.

### 2. Server env

`.dev.vars` should include:

```bash
AUTH0_DOMAIN=
AUTH0_AUDIENCE=https://api.never-again.app
BACKBOARD_API_KEY=
BACKBOARD_BASE_URL=https://app.backboard.io/api
FRONTEND_ORIGIN=http://localhost:5173
APP_ENV=development
```

`AUTH0_AUDIENCE` must exactly match `VITE_AUTH0_AUDIENCE`.

### 3. Apply local D1 migration

```bash
pnpm d1:migrate:local
```

This creates the local `users` table for the `DB` binding.

### 4. Build the app

```bash
pnpm build
```

Pages Functions local dev serves the built `dist` directory.

### 5. Start local Pages Functions

```bash
pnpm pages:dev
```

This serves the Cloudflare Pages app and `/api/*` functions on:

```txt
http://localhost:8788
```

### 6. Start or keep Vite running

In another terminal:

```bash
pnpm dev
```

Open:

```txt
http://localhost:5173
```

The Vite frontend will call `/api/me` through:

```txt
http://localhost:8788
```

### 7. Expected success state

After signing in:

- The top bar should show `Memory bound`.
- The sidebar should show either a Backboard assistant ID or your user identity.
- The local D1 database should have one user row.
- Refreshing the app should reuse the same row and assistant ID.
- Submitting the import form should show `Import queued`.
- The success message should mention normalized transcript storage and redaction count.

### 8. Check local D1 rows

```bash
pnpm d1:users:local
```

After submitting an import, also run:

```bash
pnpm d1:imports:local
```

For chunking details:

```bash
pnpm d1:chunks:local
```

For chunk findings:

```bash
pnpm d1:findings:local
```

New imports should move through `chunked` and then to `findings_ready` after Backboard analyzes the chunks with memory off.
Do not deploy until `/api/me` reuses the same user row and the import form creates chunk rows and findings locally.
