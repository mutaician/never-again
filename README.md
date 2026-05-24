# Never Again

Builder memory for people who vibe-code ambitious projects, hit painful lessons mid-build, and want the next project to start smarter.

Never Again turns messy AI coding conversations into durable project lessons. A builder can import a transcript, review the extracted lessons, save the best ones into Backboard memory, and then run a preflight on the next idea before handing it to a coding agent.

## Why This Exists

Agentic coding makes it easy to start from a blank slate. The harder part is carrying forward what the human learned:

- the scope that was too big
- the architecture that should have been simpler
- the verification step that should have existed earlier
- the agent behavior that caused loops or regressions
- the "next time we should..." moment buried in a long conversation

Never Again is a memory console for those lessons.

## Core Flow

1. Import a conversation transcript from tools like Cursor, Claude Code, ChatGPT, or Windsurf.
2. Normalize the transcript by compressing code blocks and redacting likely secrets.
3. Chunk the conversation and analyze it with Backboard.
4. Reduce raw findings into reusable lesson drafts.
5. Review, edit, reject, or approve each lesson.
6. Save approved lessons into the user's Backboard assistant memory.
7. Run a preflight for a future project idea and generate:
   - risk patterns from past mistakes
   - a smaller MVP plan
   - coding-agent rules
   - a starter prompt
   - an `AGENTS.md` seed

## How It Uses Backboard

Never Again uses Backboard as the durable memory layer for each builder.

- On first login, the app creates a Backboard assistant for that user and stores the assistant id in D1.
- Transcript chunk analysis calls Backboard with memory off so raw extraction does not pollute memory.
- Findings reduction uses Backboard to merge chunk findings into higher-quality lesson drafts.
- Approved lessons are saved into Backboard memory only after human review.
- Preflight uses saved memory in readonly mode to warn the builder before starting a new project.

The important product choice is the human gate: nothing becomes durable memory until the user approves it.

## Tech Stack

- Frontend: Vite, React, TypeScript
- Hosting/API: Cloudflare Pages Functions
- Auth: Auth0
- Database: Cloudflare D1
- Storage: Cloudflare R2
- Memory and LLM layer: Backboard API
- Package manager: pnpm

## Local Development

Install dependencies:

```bash
pnpm install
```

Create `.env` for the Vite frontend:

```bash
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
VITE_AUTH0_REDIRECT_URI=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8788
```

Create `.dev.vars` for Cloudflare Pages Functions:

```bash
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
BACKBOARD_API_KEY=
BACKBOARD_BASE_URL=https://app.backboard.io/api
BACKBOARD_LLM_PROVIDER=
BACKBOARD_MODEL_NAME=
FRONTEND_ORIGIN=http://localhost:5173
APP_ENV=development
```

Apply local D1 migrations:

```bash
pnpm d1:migrate:local
```

Build and start Pages Functions:

```bash
pnpm build
pnpm pages:dev
```

In another terminal, start Vite:

```bash
pnpm dev
```

Open:

```txt
http://localhost:5173
```

## Useful Commands

```bash
pnpm lint
pnpm build
pnpm d1:users:local
pnpm d1:imports:local
pnpm d1:lessons:local
pnpm d1:preflights:local
```

For production D1 migrations:

```bash
pnpm exec wrangler d1 migrations apply never-again-db --remote
```

## Deployment Notes

Cloudflare Pages settings:

```txt
Framework preset: React (Vite)
Build command: pnpm build
Build output directory: dist
```

Required bindings:

```txt
D1 binding: DB
R2 binding: TRANSCRIPTS_BUCKET
```

Production environment variables:

```bash
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
VITE_AUTH0_REDIRECT_URI=https://<your-pages-domain>

AUTH0_DOMAIN=
AUTH0_AUDIENCE=
BACKBOARD_API_KEY=
BACKBOARD_BASE_URL=https://app.backboard.io/api
FRONTEND_ORIGIN=https://<your-pages-domain>
APP_ENV=production
```

`VITE_API_BASE_URL` should be blank in production when the frontend and Pages Functions are deployed together.

## Demo Notes

Large transcripts can take several minutes to analyze because each chunk requires LLM processing. The app treats analysis as an async job, stores progress in D1, and lets the review page poll for completion.

For a short demo, the best path is:

1. Show importing a short transcript to prove the pipeline starts.
2. Switch to an already-processed transcript.
3. Review lesson drafts.
4. Save one lesson into memory.
5. Open Memory Ledger.
6. Run Preflight for a new idea.
7. Copy the generated agent rules, starter prompt, or `AGENTS.md` seed.

## Project Status

This is a hackathon MVP. The core loop works, but future versions should move long analysis into a more durable queue/workflow and add richer import adapters for different AI coding tools.
