# Tier List Gen Plan

## One-Line Concept

A hosted tier-list app where users log in with their ChatGPT account, describe the tier list they want, and use a structured mutation field to generate, add, remove, and retry image-backed rankable items without bringing an OpenAI API key.

## Current Product Decision

The first version is not a general chat app. It is a board-first editor with one mutation input.

Implementation status: the repo now includes the board-first UI, anonymous session boards, per-session Codex app-server auth homes, app-server device-code login, app-server thread/turn calls, image-generation event capture, generated asset caching, and a mock fallback for environments where app-server auth is unavailable.

The user experience should feel like:

1. User opens the app.
2. User authenticates with ChatGPT through Codex app-server managed auth.
3. User enters a request like `make a tier list of cheeses`.
4. The app creates a classic tier-list board with `S`, `A`, `B`, `C`, `D`, and `F` rows.
5. The app generates a variable number of items at the model's discretion, unless the user specifies a count.
6. Each item appears in the bottom tray with a title and a generated image.
7. The user manually drags items into tiers.
8. The user can type mutation requests like `add cheddar and remove parm`.
9. The app patches the board state instead of regenerating the full board.
10. The session persists as a clean JSON document.

## Why Codex App Server

The point of using Codex app-server is not that it is the simplest image-generation API. It is that it may let the app use a user's logged-in ChatGPT/Codex entitlement for image generation, instead of requiring the app owner or user to provide an OpenAI API key.

This makes the product a structured interface over Codex image generation:

- The user authenticates with ChatGPT.
- The app starts or resumes a Codex session for the board.
- The app sends structured board-generation and board-mutation instructions to Codex.
- Codex generates titles, item specs, and image-generation calls.
- The app extracts image-generation events and stores them as board assets.

## Important Platform Findings

### Codex App Server

Official docs: https://developers.openai.com/codex/app-server

Codex app-server is a JSON-RPC-style protocol designed to power rich clients. It supports:

- Long-running app-server process.
- Transports including stdio, Unix socket, and experimental WebSocket.
- ChatGPT-managed authentication modes.
- Thread and turn lifecycle APIs.
- Streamed item events.
- Local schema generation through:

```bash
codex app-server generate-ts --out ./schemas
codex app-server generate-json-schema --out ./schemas
```

The locally generated schema for the current Codex install includes image-related thread and response items:

- `image_generation_call`
- `imageGeneration`
- `imageView`
- `image`
- `localImage`

The locally generated schema also exposes turn-level reasoning effort:

```ts
effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
```

That controls the Codex/text model, not image-generation quality directly.

### ChatGPT Managed Auth

Codex app-server supports ChatGPT managed auth modes:

- `chatgpt` for browser login.
- `chatgptDeviceCode` for device-code login.
- Experimental externally managed ChatGPT tokens when the client enables experimental API capability.

For a hosted prototype, device-code auth is the most likely viable path because browser login callbacks are designed around app-server hosting a local callback.

### Image Generation

Codex app image generation docs: https://developers.openai.com/codex/app/features#image-generation

OpenAI image generation API docs: https://platform.openai.com/docs/guides/image-generation

Image quality is not the same as model reasoning effort.

For direct API use, image generation supports `quality` controls like `low`, `medium`, `high`, and `auto`. For Codex app-server built-in image generation, the clean parameter surface may not be directly exposed through app-server. The product should still store `desiredImageQuality: "low"` in its own job metadata and use it wherever the active imagegen path supports quality.

V1 decision:

- Desired image quality: `low`.
- Visual style: professional studio photography for image clarity.
- If exact image quality cannot be controlled through Codex app-server, prompt for clear simple studio images and compress/cache generated thumbnails before display.

### Vercel Constraint

A pure Vercel-only backend is probably not compatible with Codex app-server because app-server is a long-running process, while Vercel Functions are not designed to be a durable WebSocket server or long-running process host.

Recommended V1 deployment shape:

- Vercel hosts the frontend and lightweight app API.
- A separate always-on or sleeping container/VM runs the Codex worker and app-server.
- The frontend talks to the app API.
- The app API queues mutations.
- The worker consumes jobs, talks to Codex app-server, uploads generated assets, and patches persisted board state.

If the goal is a single free-ish host that can run both the frontend and Codex worker, evaluate:

- Hugging Face Spaces Docker for a scrappy demo.
- Oracle Cloud Always Free VM for the most realistic free always-on option.
- Render/Koyeb free tiers only if sleeping and weak persistence are acceptable.

## V1 Product Scope

### In Scope

- Real hosted app.
- Real ChatGPT managed auth through Codex app-server.
- Anonymous browser session ownership for V1 boards instead of full app auth.
- Create a new tier-list board from a user prompt.
- Classic tier rows: `S`, `A`, `B`, `C`, `D`, `F`.
- Bottom tray for unranked generated items.
- Manual drag-and-drop ranking.
- Mutation field for board changes.
- Add items.
- Remove items.
- Retry failed image generation.
- Loading tile state while images generate.
- Placeholder tile state when image generation fails.
- Persist board state as JSON.
- Store successful generated images so reloads and dragging do not regenerate them.
- No visible chat transcript.
- No duplicate prevention.
- Allow off-theme additions.
- Removed items disappear immediately.

### Out of Scope For V1

- Editable item titles.
- AI-driven ranking.
- Visible conversational transcript.
- Board operation through chat, like `move cheddar to S`.
- Duplicate detection.
- Theme coherence enforcement.
- Image style selector.
- Initial item count setting UI.
- Export image.
- Public sharing.
- Collaboration.
- Multi-board library beyond the minimal saved-session list required for testing.

## UX Requirements

### Start Screen

The start screen should be direct and utilitarian:

- App title.
- Auth status.
- One large input: `What tier list do you want to make?`
- Submit button.
- Loading state while the board is being created.

Examples:

- `make a tier list of cheeses`
- `rank 12 sci-fi movies by rewatchability`
- `make a tier list of airport snacks`
- `make a tier list of browser tabs as office supplies`

The app should not ask for categories up front. The point is that users decide on the fly.

### Board Screen

The board screen should prioritize the board:

- Classic tier grid.
- Rows ordered from `S` at top to `F` at bottom.
- Bottom tray for unranked items.
- Mutation input fixed near the top or bottom.
- Small activity/status area only if needed for job status.

No chat transcript is required.

### Mutation Input

Every mutation input is interpreted as a request to update the board.

Examples:

- `add cheddar`
- `remove parm`
- `add 5 more weird cheeses`
- `add Jurassic Park`
- `remove anything blue`
- `add three more budget airlines`

V1 can implement mutations as model-produced structured patches:

- `add_items`
- `remove_items`
- `retry_images`
- `rename_board`
- `no_op`

Even if the model internally reasons conversationally, the UI only needs to show resulting board changes.

### Tile States

Each tile has:

- Title.
- Image.
- Status.

Statuses:

- `pending`: title exists, image job not started.
- `generating`: image request in progress.
- `ready`: image generated and cached.
- `failed`: image generation failed; show placeholder and retry button.
- `removed`: not shown in normal UI, retained only in history if useful.

### Drag And Drop

V1 behavior:

- Items start in tray.
- User drags item from tray into a tier.
- User can move items between tiers.
- User can move items back to tray.
- Tray does not need advanced sorting or ranking behavior.

## State Model

The board should be stored as a clean JSON document from the start.

```json
{
  "id": "board_123",
  "ownerId": "user_123",
  "title": "Cheese Tier List",
  "originalPrompt": "make a tier list of cheeses",
  "desiredImageQuality": "low",
  "visualStyle": "professional studio photography",
  "createdAt": "2026-05-24T00:00:00.000Z",
  "updatedAt": "2026-05-24T00:00:00.000Z",
  "codex": {
    "threadId": "thread_123",
    "authAccountId": "acct_123",
    "model": null,
    "reasoningEffort": "low"
  },
  "tiers": [
    { "id": "tier_s", "label": "S", "itemIds": [] },
    { "id": "tier_a", "label": "A", "itemIds": [] },
    { "id": "tier_b", "label": "B", "itemIds": [] },
    { "id": "tier_c", "label": "C", "itemIds": [] },
    { "id": "tier_d", "label": "D", "itemIds": [] },
    { "id": "tier_f", "label": "F", "itemIds": [] }
  ],
  "trayItemIds": ["item_1", "item_2"],
  "items": {
    "item_1": {
      "id": "item_1",
      "title": "Brie",
      "prompt": "Professional studio photograph of brie cheese...",
      "status": "ready",
      "imageAssetId": "asset_1",
      "imageUrl": "https://...",
      "createdAt": "2026-05-24T00:00:00.000Z",
      "updatedAt": "2026-05-24T00:00:00.000Z"
    },
    "item_2": {
      "id": "item_2",
      "title": "Cheddar",
      "prompt": "Professional studio photograph of cheddar cheese...",
      "status": "generating",
      "imageAssetId": null,
      "imageUrl": null,
      "createdAt": "2026-05-24T00:00:00.000Z",
      "updatedAt": "2026-05-24T00:00:00.000Z"
    }
  },
  "turns": [
    {
      "id": "turn_1",
      "kind": "create",
      "input": "make a tier list of cheeses",
      "status": "completed",
      "createdAt": "2026-05-24T00:00:00.000Z"
    }
  ]
}
```

## Data Storage

### Tables

Minimum database tables:

- `users`
- `auth_accounts`
- `boards`
- `jobs`
- `assets`

### Users

Stores the app user identity.

Fields:

- `id`
- `email`
- `display_name`
- `created_at`
- `updated_at`

### Auth Accounts

Stores per-user Codex/ChatGPT auth metadata and encrypted token state.

Fields:

- `id`
- `user_id`
- `provider`
- `status`
- `encrypted_token_blob`
- `codex_home_path` or remote storage pointer
- `created_at`
- `updated_at`

Security note: do not store raw tokens in plaintext. Use platform secrets/KMS where available.

### Boards

Stores board JSON.

Fields:

- `id`
- `user_id`
- `title`
- `state_json`
- `created_at`
- `updated_at`

### Jobs

Tracks create/mutation/image jobs.

Fields:

- `id`
- `board_id`
- `type`
- `status`
- `input`
- `result`
- `error`
- `created_at`
- `updated_at`

### Assets

Tracks generated images.

Fields:

- `id`
- `board_id`
- `item_id`
- `storage_url`
- `mime_type`
- `width`
- `height`
- `source`
- `created_at`

## App Architecture

### Selected Prototype Architecture

The current V1 target is Hugging Face Spaces with Docker. This keeps the frontend, lightweight app API, filesystem-backed state, and Codex app-server worker path in one container while the prototype proves the hosted ChatGPT/Codex auth and imagegen flow.

The first runnable scaffold uses mock generation by default and gates real app-server usage behind `CODEX_ENABLE_APP_SERVER=true`.

### Longer-Term Architecture

```text
Browser
  |
  | HTTPS
  v
Vercel Frontend / App API
  |
  | Database + queue
  v
Persistent Worker Service
  |
  | stdio / unix / websocket
  v
codex app-server
  |
  | ChatGPT managed auth + imagegen
  v
Codex / ChatGPT backend
```

### Components

#### Web App

Responsibilities:

- User authentication to the app.
- ChatGPT device-code login initiation/status UI.
- Board creation UI.
- Tier-list board rendering.
- Drag-and-drop interactions.
- Mutation input.
- Job status display.
- Retry image action.

Suggested stack:

- Next.js App Router.
- TypeScript.
- React.
- `dnd-kit` for drag and drop.
- Tailwind or plain CSS modules.
- Server actions or route handlers for API calls.

#### App API

Responsibilities:

- Create boards.
- Read board state.
- Save drag-and-drop tier placements.
- Submit mutation jobs.
- Submit retry-image jobs.
- Return job status.
- Return auth status.

The App API should not perform heavy Codex work inside a short-lived Vercel Function unless the deployed platform supports it reliably.

#### Worker

Responsibilities:

- Own the Codex app-server process lifecycle.
- Start/resume Codex threads.
- Send initial board prompts and mutation prompts.
- Parse streamed app-server events.
- Detect image generation events.
- Save generated images to durable storage.
- Patch board JSON.
- Mark jobs complete or failed.

Worker process design:

- One process can multiplex multiple boards initially if usage is low.
- Long term, isolate per-user Codex homes or per-user app-server sessions.
- Use a durable job queue for production, even if V1 begins with a polling table.

## Auth Design

There are two kinds of auth:

1. App auth.
2. ChatGPT/Codex auth.

### App Auth

For V1, full app auth is not required. A random anonymous session cookie owns boards on that browser. ChatGPT/Codex device-code auth is the meaningful auth gate for image generation.

This is acceptable for the first hosted proof because:

- Boards are not shared.
- Cross-device account recovery is out of scope.
- The app is proving the structured imagegen workflow, not account management.

Full app auth becomes necessary when adding:

- Cross-device board access.
- Public or private sharing.
- Billing or quotas.
- User-managed board history.
- Durable multi-user token storage.

Future app auth options:

- Clerk.
- Auth.js.
- Supabase Auth.
- Minimal magic-link auth.

For a future account-backed version, use one of:

- Clerk if convenience matters.
- Auth.js if avoiding another hosted dependency matters.
- Supabase Auth if using Supabase Postgres.

### ChatGPT/Codex Auth

Use Codex app-server managed ChatGPT device-code login.

Expected flow:

1. User opens the app and receives an anonymous session cookie.
2. App asks worker to start Codex login.
3. Worker calls app-server login with `chatgptDeviceCode`.
4. App shows the user the device code and verification URL.
5. User completes login in ChatGPT/OpenAI auth flow.
6. Worker receives login completion.
7. App marks ChatGPT auth as connected.
8. Future board jobs use the user's persisted Codex auth state.

Open concern:

- Need to confirm the exact current app-server request names and event shapes by generating JSON schema in the implementation repo and writing a minimal login harness.

## Codex Thread Strategy

Use one Codex thread per board.

Rationale:

- The board is naturally one evolving session.
- Mutations can preserve context.
- App state still remains canonical in our JSON.

Thread rules:

- The board JSON is the source of truth.
- Codex is used to propose patches and generate images.
- Every mutation prompt should include the current board state, or enough compressed state for correct patching.
- Do not rely only on hidden Codex conversation context for canonical state.

## Prompting Strategy

### Initial Board Prompt

The initial prompt should ask Codex for structured output and image generation.

It should include:

- User's original request.
- Desired item count behavior: use user's count if specified; otherwise choose a reasonable V1 count.
- Desired image style: professional studio photography, clear subject, isolated or simple background.
- Desired image quality: low where supported.
- Required structured board patch.

Expected output contract:

```json
{
  "boardTitle": "Cheese Tier List",
  "items": [
    {
      "title": "Brie",
      "imagePrompt": "Professional studio photograph of brie cheese, clear subject, simple background."
    }
  ]
}
```

Implementation detail:

- Codex may not expose a clean structured-output plus imagegen flow in one step.
- If necessary, split into:
  1. Ask Codex to produce item JSON.
  2. For each item, ask Codex/imagegen to create the image.

### Mutation Prompt

Every mutation request should produce a patch:

```json
{
  "operations": [
    {
      "type": "add_item",
      "title": "Cheddar",
      "imagePrompt": "Professional studio photograph of cheddar cheese, clear subject, simple background."
    },
    {
      "type": "remove_item",
      "match": "parm"
    }
  ]
}
```

Mutation rules:

- Interpret every user input as a board mutation request.
- Allow anything, even off-theme additions.
- Do not block on duplicates.
- Remove matched items immediately.
- Preserve existing tier placements for unaffected items.
- Only generate images for newly added or retried items.

### Image Prompt Template

Default image prompt:

```text
Professional studio photograph of {item title} for a tier-list tile.
Clear single subject, recognizable, centered composition, simple neutral background,
clean lighting, high visual clarity, no text, no watermark, square crop.
Use low image quality or fastest generation settings if supported.
```

This template is intentionally general so the app can handle food, media, objects, concepts, and odd user requests.

## Image Generation Flow

### Initial Generation

1. User submits board prompt.
2. App creates board with empty tray and tiers.
3. App creates a `create_board` job.
4. Worker asks Codex to generate item list.
5. Worker creates item records in `pending` state.
6. UI shows loading tiles.
7. Worker requests image generation for each item.
8. Each successful image is uploaded to durable storage.
9. Item status changes to `ready`.
10. Failed image status changes to `failed`.

### Retry Generation

1. User clicks retry on a failed item.
2. App creates `retry_image` job.
3. Worker reuses or revises the existing image prompt.
4. Item status changes to `generating`.
5. Success updates `imageUrl`; failure returns to `failed`.

### Removal

1. User asks to remove an item.
2. Worker produces remove operation.
3. App removes item id from tray and all tiers.
4. Item disappears immediately.
5. Asset can remain in storage for audit/cache cleanup later.

## API Sketch

### Public App Routes

```http
GET /
GET /boards/:boardId
```

### Backend API

```http
GET /api/auth/codex/status
POST /api/auth/codex/start-device-login
GET /api/auth/codex/device-login/:loginId

POST /api/boards
GET /api/boards/:boardId
PATCH /api/boards/:boardId/placements

POST /api/boards/:boardId/mutations
POST /api/boards/:boardId/items/:itemId/retry-image

GET /api/jobs/:jobId
```

### Board Creation Request

```json
{
  "prompt": "make a tier list of cheeses"
}
```

### Board Creation Response

```json
{
  "boardId": "board_123",
  "jobId": "job_123"
}
```

### Placement Patch

```json
{
  "tiers": [
    { "id": "tier_s", "itemIds": ["item_1"] },
    { "id": "tier_a", "itemIds": [] }
  ],
  "trayItemIds": ["item_2", "item_3"]
}
```

### Mutation Request

```json
{
  "input": "add cheddar and remove parm"
}
```

## Worker Implementation Sketch

### Codex App Server Adapter

Create a small adapter around app-server.

Responsibilities:

- Spawn or connect to `codex app-server`.
- Initialize client capabilities.
- Start/resume threads.
- Start turns.
- Subscribe to notifications.
- Normalize app-server events into app-domain events.

Interface:

```ts
interface CodexAppServerAdapter {
  startDeviceLogin(userId: string): Promise<DeviceLoginStart>;
  getAuthStatus(userId: string): Promise<CodexAuthStatus>;
  startBoardThread(input: StartBoardInput): Promise<CodexThreadRef>;
  runTurn(input: RunTurnInput): AsyncIterable<CodexEvent>;
}
```

### Board Service

Responsibilities:

- Create board state.
- Apply patches.
- Validate placement updates.
- Persist board JSON.
- Emit frontend updates.

### Image Service

Responsibilities:

- Track image-generation jobs.
- Extract image result from app-server event.
- Save image bytes or file to object storage.
- Create thumbnail if needed.
- Return stable asset URL.

## Real-Time Updates

Options:

1. Poll job and board state every 1-2 seconds.
2. Server-Sent Events from an always-on backend.
3. WebSocket from the external worker host.

V1 recommendation:

- Use polling from the Vercel frontend for simplicity.
- Revisit realtime once the worker flow is proven.

Polling is acceptable because image generation is already slow relative to UI interactions.

## Hosting Options

### Recommended Hosted Prototype

Frontend:

- Vercel.

Worker:

- Fly.io, Render, Railway, Hugging Face Spaces Docker, or Oracle Cloud Always Free VM.

Database:

- Neon Postgres, Supabase Postgres, Vercel Postgres, or hosted Postgres on the worker VM.

Asset storage:

- Vercel Blob, Cloudflare R2, S3, Supabase Storage, or local disk only for single-VM prototypes.

### Cheapest Practical Path

Use one Docker app on Hugging Face Spaces:

- Serves the frontend.
- Runs the backend.
- Runs Codex app-server.
- Stores temporary state.

Tradeoffs:

- Sleeps after inactivity.
- Persistence is limited unless paid persistent storage or external DB/storage is added.
- Good for demo, not reliable product.

### Most Real Free Path

Use Oracle Cloud Always Free VM:

- Run Docker Compose.
- Run frontend, backend, worker, Postgres, and object storage/minio or local storage.
- Put Cloudflare in front if needed.

Tradeoffs:

- More ops.
- Account and capacity friction.
- Better fit for app-server than serverless.

## Security Notes

### Token Storage

Do not store ChatGPT/Codex tokens as plaintext.

Use:

- Encrypted token blobs.
- Per-user token scopes where possible.
- A server-side encryption key from environment/secrets manager.
- Strict separation between app auth identity and Codex auth state.

### Process Isolation

Codex app-server can access filesystem and run tools depending on configuration.

For this product:

- Run with a restricted workspace.
- Disable unnecessary tools where possible.
- Use a dedicated `CODEX_HOME` per user or per isolated session.
- Do not mount sensitive host directories.
- Keep generated files in a controlled workspace.

### Prompt Safety

The app should not give Codex broad autonomous filesystem goals. It should ask for:

- Structured item patches.
- Image generation.
- No shell execution unless explicitly required by implementation.

### Generated Content

Need to rely on OpenAI/Codex content safeguards for image generation. The app should gracefully show failures when requested content cannot be generated.

## Implementation Milestones

### Milestone 0: Repo And Research Harness

Deliverables:

- Repo scaffold.
- `PLAN.md`.
- App-server generated TypeScript schema checked into `schemas/` or generated during setup.
- Minimal script that starts app-server and prints auth status.
- Minimal script that starts device-code login.

Validation:

- `codex app-server --help` works.
- `codex app-server generate-ts` works.
- Device-code login can complete for a test account.

### Milestone 1: Local Board UI

Deliverables:

- Next.js app.
- Static board with classic tiers.
- Tray.
- Drag-and-drop between tray and tiers.
- Local JSON state.
- No Codex integration yet.

Validation:

- User can drag items into tiers.
- Placement state survives page reload through local storage or test persistence.

### Milestone 2: Backend State

Deliverables:

- Database schema.
- Board create/read/update APIs.
- Placement persistence.
- Basic app auth.

Validation:

- Authenticated user can create a board.
- Board state persists server-side.
- User cannot access another user's board.

### Milestone 3: Codex Auth

Deliverables:

- Device-code login UI.
- Worker app-server auth adapter.
- Persisted encrypted Codex auth state.
- Auth status visible in app.

Validation:

- User can connect ChatGPT account.
- Worker can start a Codex thread under the connected auth state.
- Reconnection works after worker restart.

### Milestone 4: Item Generation Without Images

Deliverables:

- Initial prompt creates board title and item titles.
- Mutation field adds/removes item titles.
- Loading and failed states mocked or represented.

Validation:

- `make a tier list of cheeses` produces item tiles.
- `add cheddar and remove parm` patches board without resetting placements.

### Milestone 5: Image Generation

Deliverables:

- Codex image-generation turn flow.
- Extract image-generation result from app-server events.
- Store image asset.
- Update item tile.
- Retry failed image.

Validation:

- New items get generated images.
- Failed image has retry button.
- Existing images are cached and not regenerated on reload.

### Milestone 6: Hosted Prototype

Deliverables:

- Frontend hosted on Vercel or single-service host.
- Worker hosted on selected long-running service.
- DB and asset storage configured.
- End-to-end authenticated flow.

Validation:

- Fresh user can auth with app.
- Fresh user can connect ChatGPT/Codex.
- Fresh user can create a board.
- Fresh user can mutate the board.
- Board reload preserves state and images.

## Technical Risks

### Codex App Server Is Experimental

Risk:

- App-server schema and behavior may change.

Mitigation:

- Generate schemas at build/setup.
- Keep a narrow adapter layer.
- Avoid coupling UI directly to raw app-server events.

### Hosted ChatGPT Auth May Be Awkward

Risk:

- Browser OAuth mode may assume local callback behavior.

Mitigation:

- Prefer device-code auth.
- Build auth harness before board implementation.

### Image Quality Parameter May Not Be Exposed

Risk:

- Codex app-server imagegen may not let the app pass `quality: "low"` directly.

Mitigation:

- Store desired quality in job metadata.
- Prompt for simple fast thumbnail-style studio photos.
- Compress/store thumbnails after generation.
- If direct API is ever allowed, map `desiredImageQuality` to image API `quality`.

### Serverless Mismatch

Risk:

- Vercel cannot host the full app-server worker correctly.

Mitigation:

- Split Vercel frontend from long-running worker.
- Or use a single container/VM host.

### Account And Usage Limits

Risk:

- Codex imagegen usage may be rate-limited or counted against the user's Codex/ChatGPT plan.

Mitigation:

- Use low quality.
- Cache all outputs.
- Generate only new/retried items.
- Avoid unnecessary regeneration.
- Show clear failed/rate-limited tile states.

## Open Implementation Questions

These should be answered by prototype harnesses, not more theory:

1. What exact app-server request starts `chatgptDeviceCode` login in the current local schema?
2. Can app-server run image generation from a non-desktop hosted worker under managed ChatGPT auth?
3. Does app-server expose image generation quality or only the image result event?
4. What does an image result payload contain: base64, path, URL, or file reference?
5. How stable is auth state across worker restarts?
6. Can we safely run one app-server daemon per worker or do we need one isolated app-server process per user/session?
7. What is the minimum viable host memory/CPU for app-server plus a small Node backend?

## V1 Acceptance Criteria

The prototype is good enough when:

1. A user can sign in to the hosted app.
2. A user can connect ChatGPT/Codex through managed device-code auth.
3. A user can create a tier list from a free-form prompt.
4. The app creates a board with `S A B C D F` and a tray.
5. The app generates title + image tiles.
6. The user can manually drag tiles into tiers.
7. The user can submit a mutation like `add cheddar and remove parm`.
8. The app adds/removes only the affected items.
9. Existing ranked item placements remain intact.
10. Failed image tiles show retry.
11. Reloading the board preserves state and generated images.

## Notable Defaults

- Board tiers: classic `S`, `A`, `B`, `C`, `D`, `F`.
- User ranks manually.
- No chat transcript.
- Mutation input only.
- One Codex thread per board.
- One board JSON document is canonical state.
- Image style: professional studio photography.
- Desired image quality: low.
- Allow anything.
- No duplicate prevention.
- Removed items disappear immediately.
- Cache generated images.
