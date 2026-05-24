# Never Again PRD

## 1. Product Summary

Never Again is a builder memory app for people who build software with AI coding agents.

AI coding tools often start fresh, while the human has hard-won lessons from previous projects: over-scoping, bad architecture choices, brittle prompts, agent loops, misunderstood requirements, missing domain knowledge, and "next time I should..." moments. Never Again turns those messy project conversations into durable, reusable builder memory.

The app ingests long AI coding conversations, extracts the important lessons, lets the user approve what should become memory, stores those lessons in Backboard, and applies them when the user starts a new project.

One-line pitch:

> Never Again turns failed AI coding sessions into durable builder memory, so your next project starts with the lessons your last agent forgot.

## 2. Problem

Vibe-coded projects often fail or stall because the builder discovers important constraints only after implementation starts:

- The project was too broad for the time available.
- The stack or domain was unfamiliar.
- The AI agent kept breaking working features.
- The user did not know what questions to ask early.
- The agent had no memory of previous mistakes.
- The next project starts with a clean slate, even though the human learned a lot.

Traditional coding made lessons stick because the developer manually experienced each detail. Agentic coding hides much of the work, so lessons can be lost unless they are intentionally captured.

## 3. Goal

Build a polished MVP that proves:

1. A user can import an AI coding conversation.
2. The app can extract useful project lessons from the conversation.
3. The user can approve lessons before saving them as long-term memory.
4. Backboard stores the user's durable builder memory.
5. A future project preflight can use those memories to warn, scope, and guide the user.

The product should feel like a technical memory ledger, not a generic chat wrapper or notes app.

## 4. Non-Goals for MVP

These are intentionally out of scope for the hackathon MVP:

- Browser extensions.
- Native Cursor, ChatGPT, Claude Code, Windsurf, Lovable, or Bolt integrations.
- Full GitHub repository analysis.
- Team or organization collaboration.
- Full commit history mining.
- Real-time transcript syncing.
- Perfect parsing for every AI coding platform.
- Automatic saving of every extracted item into long-term memory.
- A marketing-heavy landing page.

## 5. Target User

Primary user:

- A builder using AI coding agents to create apps quickly.
- May not be an expert programmer.
- Has multiple abandoned or restarted projects.
- Learns through failed attempts but does not reliably document lessons.
- Wants a smarter starting point for the next project.

Secondary user:

- A more experienced developer using agents heavily.
- Wants a personal postmortem and agent-brief generation tool.

## 6. Product Positioning

Never Again should be presented as:

- A memory pipeline for AI-built projects.
- A personal postmortem console.
- A builder risk profile.
- A preflight system for future projects.

It should not be presented as:

- A generic summarizer.
- A generic chatbot.
- A notes app.
- A project management tool.

## 7. Core User Journey

### 7.1 First Login

1. User signs in with Auth0.
2. Backend validates the Auth0 access token.
3. Backend creates or loads the local user record in D1.
4. If the user has no Backboard assistant, backend creates one.
5. Backend stores `backboard_assistant_id` on the user record.
6. All future Backboard calls for this user reuse the same assistant ID.

### 7.2 Import Conversation

1. User creates a project.
2. User selects a source platform:
   - Cursor
   - Claude Code
   - ChatGPT
   - Windsurf
   - Bolt
   - Lovable
   - Other
3. User pastes a conversation or uploads `.txt` / `.md`.
4. Backend stores the raw transcript in R2.
5. Backend creates an async analysis job.
6. UI shows job progress.

### 7.3 Analyze Conversation

1. Background worker loads the raw transcript from R2.
2. Transcript is normalized into user/assistant turns where possible.
3. Code blocks and generated files are compressed or stripped.
4. Secrets are detected and redacted.
5. Conversation is split into chunks by turn boundaries.
6. Chunks are analyzed in parallel with Backboard memory disabled.
7. Chunk findings are stored in D1.
8. A reducer merges findings into final lesson drafts.
9. User reviews the extracted lessons.

### 7.4 Save Builder Memory

1. User reviews each extracted lesson.
2. User can approve, edit, reject, or defer.
3. Approved lessons are saved to Backboard memory manually.
4. D1 stores the returned Backboard memory ID.
5. Memory Ledger updates to show saved lessons.

### 7.5 New Project Preflight

1. User describes a new project idea.
2. Backend searches Backboard memory for relevant past lessons.
3. App generates:
   - risk warnings
   - matching past patterns
   - suggested MVP
   - agent rules
   - things to avoid for now
   - starter prompt
   - exportable `AGENTS.md`
4. User can start the next coding session with a better brief.

## 8. Backboard Architecture

### 8.1 Core Rule

Use one durable Backboard assistant per Never Again user.

```txt
Auth0 user A -> D1 user A -> Backboard assistant A
Auth0 user B -> D1 user B -> Backboard assistant B
```

The `backboard_assistant_id` must be treated as a durable identity key. It should be created once and reused for all memory operations for that user.

### 8.2 Why This Matters

Backboard memory is associated with an assistant profile. If calls omit the assistant ID or create a new assistant, the user may appear to have "lost" their memory because the request is using a different assistant.

Never Again must avoid this by always resolving:

```txt
request token -> local user -> backboard_assistant_id -> Backboard call
```

### 8.3 Backboard Usage Modes

#### Raw Transcript Analysis

Use memory disabled.

Reason:

- Raw transcripts are noisy.
- Chunk analysis is partial.
- Auto-memory could save bad or incomplete lessons.
- We only want curated lessons to become long-term memory.

Behavior:

```txt
assistant_id: user.backboard_assistant_id
memory: off
```

#### Saving Approved Lessons

Use manual memory creation.

Only approved lessons should be saved.

Memory content should be concise and reusable:

```txt
Builder lesson: The user tends to over-scope unfamiliar interactive projects.
Future rule: For game-like or simulation projects, start with one vertical slice before building the full world.
```

Memory metadata should include:

```json
{
  "type": "builder_lesson",
  "category": "scope",
  "project_id": "project_id",
  "source": "conversation_import",
  "confidence": 0.91
}
```

#### Preflight

Use memory read/search, not uncontrolled auto-memory.

Recommended flow:

1. Search memories relevant to the new project idea.
2. Include retrieved memories in the preflight prompt.
3. Generate structured guidance.
4. Optionally save the preflight result locally.

## 9. Authentication Architecture

### 9.1 Provider

Use Auth0 for authentication.

Reasons:

- Avoid rebuilding auth.
- Support multiple identity providers.
- GitHub-only auth may exclude users.
- Auth0 supports social login, email/password, and passwordless options.
- It is credible and fast for a hackathon MVP.

### 9.2 Auth Flow

Frontend:

1. Use Auth0 Universal Login through the React SDK.
2. Request an access token for the Never Again API audience.
3. Send API requests with:

```http
Authorization: Bearer <access_token>
```

Backend:

1. Validate JWT issuer.
2. Validate JWT audience.
3. Validate JWT expiration.
4. Validate JWT signature using Auth0 JWKS.
5. Extract `sub`, email, and name.
6. Load or create local D1 user.

### 9.3 Source of Truth

Auth0 owns identity.

D1 owns application state.

Backboard owns durable builder memory.

Do not rely on Auth0 metadata as the primary storage for `backboard_assistant_id`. Store it in D1.

### 9.4 Duplicate Assistant Prevention

Potential issue:

- User opens two tabs on first login.
- Both requests try to create a Backboard assistant.

MVP mitigation:

- `users.auth0_sub` must be unique.
- Only create assistant if `backboard_assistant_id IS NULL`.
- Use `assistant_status`: `pending`, `creating`, `ready`, `error`.
- Before writing a new assistant ID, re-check the row.

Better post-MVP mitigation:

- Use a Cloudflare Durable Object keyed by `auth0_sub` to serialize provisioning.

## 10. Data Architecture

### 10.1 Cloudflare Services

Use:

- Vite + React + TypeScript for frontend.
- Cloudflare Pages or Workers for hosting.
- Cloudflare Worker API as the backend.
- D1 for structured data.
- R2 for raw transcript storage.
- Cloudflare Queues or Workflows for async processing.

Backboard API calls must happen only from the server side.

### 10.2 Recommended Storage Responsibilities

| Storage | Responsibility |
| --- | --- |
| Auth0 | User identity and login |
| D1 | App users, projects, jobs, chunks, lessons, preflights |
| R2 | Raw and normalized transcript blobs |
| Backboard | Approved durable builder memories |
| Queue/Workflow | Long-running analysis orchestration |

### 10.3 Suggested D1 Tables

#### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth0_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  backboard_assistant_id TEXT,
  assistant_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_platform TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### imports

```sql
CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_platform TEXT,
  raw_r2_key TEXT NOT NULL,
  normalized_r2_key TEXT,
  status TEXT NOT NULL,
  original_size_bytes INTEGER,
  redacted_secret_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

#### jobs

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);
```

#### chunks

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  turn_start INTEGER,
  turn_end INTEGER,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  finding_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES imports(id)
);
```

#### chunk_findings

```sql
CREATE TABLE chunk_findings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  category TEXT NOT NULL,
  finding_json TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);
```

#### lessons

```sql
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  import_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  problem_pattern TEXT NOT NULL,
  evidence TEXT NOT NULL,
  future_rule TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  backboard_memory_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);
```

#### preflights

```sql
CREATE TABLE preflights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_idea TEXT NOT NULL,
  retrieved_memory_json TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 11. Lesson Schema

Every extracted lesson should be structured.

```ts
type LessonDraft = {
  title: string;
  category:
    | "scope"
    | "architecture"
    | "agent_behavior"
    | "prompting"
    | "domain_knowledge"
    | "testing"
    | "ux"
    | "tooling"
    | "deployment"
    | "unknown";
  problemPattern: string;
  evidence: string;
  futureRule: string;
  confidence: number;
  evidenceTurnIds?: number[];
};
```

Good lesson:

```txt
Title: Start simulation projects with one playable vertical slice.
Category: scope
Problem pattern: The builder attempted a full Artemis II journey before validating one core interaction.
Evidence: The conversation repeatedly shifted between physics, assets, camera controls, mission realism, and game loop issues.
Future rule: For game-like projects, build one interactive scene with one success condition before expanding.
Confidence: 0.91
```

Bad lesson:

```txt
The user used React.
```

Reason this is bad:

- It is not a lesson.
- It does not change future behavior.
- It is not specific to a failure pattern.

## 12. Transcript Processing Pipeline

### 12.1 Job Statuses

Use explicit states:

```txt
queued
normalizing
redacting
chunking
analyzing
reducing
ready_for_review
failed
cancelled
```

### 12.2 Normalization

Inputs:

- pasted text
- `.txt`
- `.md`

Normalization goals:

- Preserve user and assistant turns when possible.
- Preserve project-level discussion.
- Preserve pain points and corrections.
- Preserve "next time" statements.
- Compress long code blocks.
- Remove package lock noise.
- Remove generated files.
- Remove repeated stack traces.

Signals to preserve:

- "this broke"
- "go back"
- "you should have"
- "do this, not that"
- "next time"
- "why did you"
- "I did not realize"
- "this is too much"
- "we need to restart"
- "this caused more bugs"
- architecture debates
- scope changes
- repeated agent apologies

### 12.3 Secret Redaction

Detect and redact likely:

- API keys.
- Bearer tokens.
- `.env` values.
- Private keys.
- Database URLs.
- OAuth client secrets.
- Access tokens.
- Webhook secrets.

MVP approach:

- Regex-based detection.
- Show count of possible secrets redacted.
- Store redacted normalized transcript separately.

### 12.4 Chunking

Chunk by conversation turns rather than arbitrary characters.

Each chunk should include:

```json
{
  "import_id": "import_id",
  "chunk_index": 7,
  "turn_start": 142,
  "turn_end": 169,
  "content_hash": "sha256_hash"
}
```

### 12.5 Parallel Analysis

Analyze chunks in parallel for speed.

Important:

- Each chunk analysis must be independent.
- Memory should be off.
- The chunk prompt should ask for findings, not final global lessons.
- Store results per chunk.

### 12.6 Reduction

Run a serial reducer after chunk analysis.

Reducer responsibilities:

- Merge duplicate findings.
- Remove low-value generic observations.
- Resolve conflicting findings.
- Preserve evidence references.
- Score confidence.
- Produce final lesson drafts.

This avoids context mismatches caused by parallel workers independently trying to decide the final truth.

## 13. Preflight Output Schema

Preflight should be the payoff screen.

```ts
type PreflightResult = {
  summary: string;
  riskPatterns: Array<{
    title: string;
    severity: "low" | "medium" | "high";
    matchedMemoryIds: string[];
    explanation: string;
  }>;
  recommendedMvp: {
    goal: string;
    mustHave: string[];
    defer: string[];
    firstVerticalSlice: string;
  };
  agentRules: string[];
  starterPrompt: string;
  agentsMd: string;
};
```

Example warning:

```txt
This resembles your Artemis simulator pattern: ambitious simulation, hidden domain complexity, and unclear vertical slice. Start with one launch sequence, one camera mode, and one success condition before expanding.
```

## 14. UX and Visual Direction

### 14.1 Design Intent

The app should feel:

- premium
- technical
- calm
- focused
- trustworthy
- dense but readable

It should not feel:

- generic SaaS
- playful
- emoji-heavy
- purple-gradient-heavy
- like a landing page
- like a chatbot clone

Design reference mood:

- Linear
- observability dashboards
- incident review tools
- technical consoles
- memory ledger systems

### 14.2 Visual System

Recommended palette:

- Base: graphite / near-black.
- Surface: charcoal.
- Text: off-white and muted gray.
- Border: steel gray.
- Accent: restrained cyan or blue for active analysis.
- Warning: amber.
- Success: muted green.
- Danger: muted red.

Avoid:

- dominant purple gradients
- decorative blobs
- oversized rounded cards
- generic hero sections
- marketing copy as the first experience
- emojis

### 14.3 Layout

First screen should be the actual workspace.

Suggested layout:

```txt
Left sidebar:
  Projects
  Memory Ledger
  Preflight
  Exports

Main workspace:
  Current project
  Import transcript
  Analysis progress
  Extracted lessons

Right inspector:
  Builder memory summary
  Most repeated risk pattern
  Latest saved lessons
  Current job status
```

### 14.4 Key Screens

#### Workspace Dashboard

Purpose:

- Show the current state of the user's builder memory.
- Provide quick actions to import or run preflight.

Components:

- active project selector
- import action
- memory health panel
- recent lessons
- recent preflights
- risk pattern summary

#### Import Screen

Purpose:

- Make pasting huge conversations feel safe and intentional.

Components:

- project name input
- source platform select
- conversation textarea or upload control
- secret redaction notice
- code stripping notice
- analyze button

#### Job Progress Screen

Purpose:

- Avoid a dead waiting state.

Components:

- job state timeline
- chunks processed
- secrets redacted
- findings found
- retry/cancel if needed

#### Review Lessons Screen

Purpose:

- Let user govern memory quality.

Components:

- lesson cards or table
- category
- confidence
- evidence
- future rule
- approve/edit/reject actions

#### Memory Ledger

Purpose:

- Show durable approved memory.

Components:

- saved lessons
- category filters
- source project
- memory status
- delete/archive action

#### Preflight Screen

Purpose:

- Apply memory to a new idea.

Components:

- project idea input
- risk pattern matches
- recommended MVP
- agent rules
- starter prompt
- `AGENTS.md` export

## 15. API Design

All API routes require a valid Auth0 access token unless explicitly public.

### Auth/User

```txt
GET /api/me
```

Returns the local user profile and assistant readiness.

### Projects

```txt
GET /api/projects
POST /api/projects
GET /api/projects/:id
PATCH /api/projects/:id
```

### Imports

```txt
POST /api/imports
GET /api/imports/:id
```

`POST /api/imports` creates a project/import/job and stores raw transcript in R2.

### Jobs

```txt
GET /api/jobs/:id
POST /api/jobs/:id/retry
POST /api/jobs/:id/cancel
```

### Lessons

```txt
GET /api/lessons
GET /api/projects/:id/lessons
PATCH /api/lessons/:id
POST /api/lessons/:id/approve
POST /api/lessons/:id/reject
DELETE /api/lessons/:id
```

Approving a lesson saves it to Backboard memory.

### Preflight

```txt
POST /api/preflights
GET /api/preflights/:id
```

Creates a new project preflight using Backboard memory search.

## 16. Prompting Strategy

### 16.1 Chunk Analysis Prompt

Goal:

- Extract local signals from one transcript chunk.
- Do not generate final global lessons.
- Do not save memory.

Prompt should ask for:

- pain points
- repeated corrections
- scope drift
- agent failures
- user regrets
- architecture discoveries
- future-rule candidates
- evidence turn IDs

### 16.2 Reducer Prompt

Goal:

- Convert chunk findings into final lesson drafts.

Prompt should ask for:

- deduplication
- confidence scoring
- removal of generic observations
- preservation of evidence
- concise future rules

### 16.3 Memory Save Format

Goal:

- Save durable, reusable memories.

Format:

```txt
Builder lesson: <specific pattern>.
Future rule: <actionable rule for future projects>.
Context: Learned from <project name>, where <short evidence>.
```

### 16.4 Preflight Prompt

Goal:

- Compare a new project idea against saved builder memories.

Prompt should generate:

- risk pattern matches
- severity
- MVP recommendation
- agent rules
- starter prompt
- `AGENTS.md`

## 17. Environment Variables and Bindings

### 17.1 Frontend Vite Variables

These are safe to expose in the browser.

```bash
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
VITE_AUTH0_REDIRECT_URI=
```

Notes:

- `VITE_AUTH0_DOMAIN` example: `your-tenant.us.auth0.com`
- `VITE_AUTH0_AUDIENCE` should match the Auth0 API identifier for the Never Again backend.
- `VITE_AUTH0_REDIRECT_URI` can usually be `http://localhost:5173` locally and the deployed app URL in production.

### 17.2 Server Secret Variables

These must stay server-side only.

```bash
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
BACKBOARD_API_KEY=
BACKBOARD_BASE_URL=
FRONTEND_ORIGIN=
APP_ENV=
```

Notes:

- `AUTH0_DOMAIN` is used by the Worker to validate JWT issuer and fetch JWKS.
- `AUTH0_AUDIENCE` must match the access token audience expected by the API.
- `BACKBOARD_API_KEY` must never be exposed to the browser.
- `BACKBOARD_BASE_URL` can be optional if the SDK has a default.
- `FRONTEND_ORIGIN` is used for CORS.
- `APP_ENV` can be `development`, `preview`, or `production`.

### 17.3 Optional Server Variables

Only add these if the implementation needs them.

```bash
ANALYSIS_MAX_CHUNKS=
ANALYSIS_MAX_INPUT_BYTES=
ANALYSIS_CHUNK_TARGET_TOKENS=
JOB_CONCURRENCY=
RAW_TRANSCRIPT_RETENTION_DAYS=
```

### 17.4 Cloudflare Bindings

These are configured in Cloudflare, not as normal browser env vars.

```txt
DB                         D1 database binding
TRANSCRIPTS_BUCKET         R2 bucket binding
IMPORT_QUEUE               Cloudflare Queue binding, if using Queues
ANALYSIS_WORKFLOW          Cloudflare Workflow binding, if using Workflows
```

Recommended binding names:

```txt
DB
TRANSCRIPTS_BUCKET
IMPORT_QUEUE
ANALYSIS_WORKFLOW
```

### 17.5 Auth0 Dashboard Configuration

Create:

1. Auth0 Single Page Application for the Vite frontend.
2. Auth0 API for the Cloudflare Worker backend.

Configure SPA:

```txt
Allowed Callback URLs:
  http://localhost:5173
  https://<production-domain>

Allowed Logout URLs:
  http://localhost:5173
  https://<production-domain>

Allowed Web Origins:
  http://localhost:5173
  https://<production-domain>
```

Configure API:

```txt
Identifier:
  https://api.never-again.app
```

Use the same identifier as `VITE_AUTH0_AUDIENCE` and `AUTH0_AUDIENCE`.

## 18. Step-by-Step Implementation Plan

### Phase 1: Project Foundation

1. Keep the existing Vite + React + TypeScript project.
2. Add app shell layout:
   - sidebar
   - top status row
   - main workspace
   - right inspector
3. Replace default Vite styling with Never Again visual system.
4. Add route/view state for:
   - Dashboard
   - Import
   - Review Lessons
   - Memory Ledger
   - Preflight
5. Add mock data first so UI can be built before backend is complete.

Acceptance criteria:

- App no longer looks like a Vite starter.
- First screen is the actual workspace.
- UI feels technical, premium, and focused.

### Phase 2: Auth0 Frontend

1. Install Auth0 React SDK.
2. Configure Auth0 provider using Vite env vars.
3. Add sign in/sign out controls.
4. Add authenticated route guard.
5. Add API client that attaches Auth0 access token.

Acceptance criteria:

- User can log in and out.
- Authenticated API calls include Bearer token.
- Unauthenticated users are prompted to sign in.

### Phase 3: Cloudflare Worker API

1. Add Worker or Pages Functions structure.
2. Add CORS handling using `FRONTEND_ORIGIN`.
3. Implement Auth0 JWT validation.
4. Add `GET /api/me`.
5. Add D1 migrations for `users`.
6. Implement `getOrCreateUser()`.
7. Create Backboard assistant on first user provisioning.
8. Store `backboard_assistant_id` in D1.

Acceptance criteria:

- `GET /api/me` returns a local user.
- User has a stable `backboard_assistant_id`.
- Refreshing or logging in again reuses the same assistant.

### Phase 4: Projects and Imports

1. Add D1 migrations for `projects`, `imports`, and `jobs`.
2. Implement project CRUD endpoints.
3. Implement `POST /api/imports`.
4. Store raw pasted transcript in R2.
5. Create an analysis job in D1.
6. Return job ID to frontend.
7. Add job status polling UI.

Acceptance criteria:

- User can create a project.
- User can paste a transcript.
- Raw transcript is stored in R2.
- Job appears in the UI with status `queued`.

### Phase 5: Transcript Normalization

1. Implement code block compression.
2. Implement package-lock/generated-file noise removal.
3. Implement basic user/assistant turn detection.
4. Implement secret redaction.
5. Store normalized transcript in R2.
6. Record redacted secret count.

Acceptance criteria:

- Long code blocks are replaced by short summaries/placeholders.
- Likely secrets are redacted.
- Important conversational text remains intact.

### Phase 6: Async Processing

1. Choose Cloudflare Queues or Workflows.
2. Implement background job consumer/workflow.
3. Add chunking by turn boundaries.
4. Store chunk records in D1.
5. Update job status during each processing stage.

Acceptance criteria:

- Import request returns quickly.
- Background job continues after request completes.
- UI can show progress.

### Phase 7: Chunk Analysis

1. Add chunk analysis prompt.
2. Call Backboard from Worker with user's `backboard_assistant_id`.
3. Use memory disabled for chunk analysis.
4. Analyze chunks in parallel with a safe concurrency limit.
5. Store chunk findings in D1.

Acceptance criteria:

- Each chunk produces structured findings.
- Chunk failures are recorded.
- Job can continue or fail cleanly.

### Phase 8: Findings Reduction

1. Add reducer prompt.
2. Load all chunk findings for the import.
3. Merge duplicate findings.
4. Remove generic observations.
5. Produce final lesson drafts.
6. Store lesson drafts in D1 with status `draft`.

Acceptance criteria:

- User sees high-quality lesson drafts.
- Each lesson has title, category, evidence, future rule, and confidence.
- Job status becomes `ready_for_review`.

### Phase 9: Lesson Review and Memory Save

1. Build lesson review UI.
2. Add approve/edit/reject actions.
3. On approve, save lesson manually to Backboard memory.
4. Store `backboard_memory_id` in D1.
5. Show saved state in Memory Ledger.

Acceptance criteria:

- Lessons do not enter durable memory until approved.
- Approved lessons are saved to Backboard.
- Rejected lessons are not saved.

### Phase 10: Memory Ledger

1. Build Memory Ledger screen.
2. Add filters by category/project/status.
3. Show source project and evidence.
4. Add delete/archive action if time allows.

Acceptance criteria:

- User can see what is currently saved as builder memory.
- User can inspect why a memory exists.

### Phase 11: Preflight

1. Build Preflight screen.
2. User enters a new project idea.
3. Backend searches Backboard memories.
4. Generate structured preflight result.
5. Store preflight result in D1.
6. Render risk patterns, MVP, agent rules, starter prompt, and `AGENTS.md`.

Acceptance criteria:

- Preflight uses prior saved memories.
- Output clearly connects new risk warnings to past lessons.
- User can use the generated brief to start a coding agent.

### Phase 12: Demo Polish

1. Create a demo transcript based on the Artemis II simulator story.
2. Seed fallback demo data in development.
3. Add graceful loading and failure states.
4. Add empty states for first-time users.
5. Add a small "sample transcript" action.
6. Run through the full demo repeatedly.

Acceptance criteria:

- Demo can succeed even with slow AI responses.
- Product story is clear in under 3 minutes.
- Judges can see Backboard memory being used, not just summarization.

## 19. MVP Success Criteria

Functional success:

- Auth works.
- Each user gets a stable Backboard assistant.
- User can import a transcript.
- App extracts useful lessons.
- User can approve lessons.
- Approved lessons save to Backboard memory.
- Preflight uses saved memory.

Product success:

- The app feels premium and technical.
- The demo clearly shows "failed project -> memory -> better next project."
- The app avoids looking like a generic AI summarizer.

Hackathon success:

- Backboard is central to the architecture.
- The problem is emotionally obvious.
- The demo is grounded in a real founder story.
- The product is scoped tightly enough to work.

## 20. Demo Script

1. Open Never Again workspace.
2. Explain: "I tried to build a realistic Artemis II simulator with AI. It failed, but the failure contained lessons."
3. Import the Artemis transcript.
4. Show analysis progress.
5. Review extracted lessons:
   - over-scoping
   - hidden game-dev complexity
   - unclear vertical slice
   - agent should have challenged assumptions earlier
6. Approve selected lessons.
7. Show them saved in Memory Ledger.
8. Enter a new project idea.
9. Run Preflight.
10. Show warning:

```txt
This resembles your Artemis simulator pattern: ambitious simulation, hidden domain complexity, and unclear vertical slice.
```

11. Show generated MVP, agent rules, and `AGENTS.md`.
12. Close with:

```txt
Never Again remembers what the builder learned, so the next agent does not start from zero.
```

## 21. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Huge transcripts time out | Use async jobs and chunking |
| Bad memories get saved | Require user approval |
| Backboard assistant mismatch | Store one assistant ID per user in D1 |
| Auth complexity slows build | Use Auth0 Universal Login |
| AI output is generic | Use strict lesson schema and reducer |
| Demo AI call fails | Add sample transcript and fallback demo data |
| Secrets in pasted logs | Redact before analysis |
| Cost spikes | Add max input size, max chunks, and concurrency limits |

## 22. Initial Build Priority

If time gets tight, prioritize in this order:

1. Premium workspace UI with mock data.
2. Auth0 login.
3. Stable Backboard assistant per user.
4. Paste transcript import.
5. Simple extraction into lesson drafts.
6. Approve and save to Backboard memory.
7. Preflight using saved memory.
8. R2 and full async pipeline.
9. Advanced chunking and retry handling.

The smallest winning demo is:

```txt
Paste failed project conversation -> extract lessons -> approve memory -> new project preflight uses those memories.
```
