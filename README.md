---
title: Tier List Gen
sdk: docker
pinned: false
---

# Tier List Gen

Hosted tier-list generator prototype using ChatGPT/Codex auth as the planned image-generation path.

## V1 Shape

- Anonymous browser session owns local boards.
- ChatGPT/Codex device-code auth is the meaningful imagegen auth.
- Classic `S A B C D F` tier board.
- Bottom tray for unranked tiles.
- Mutation field applies board changes.
- Imagegen integration is isolated behind a Codex adapter; the app runs with a mock generator until the hosted app-server flow is proven.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Hugging Face Spaces

Use the included `Dockerfile`.

Recommended Space settings:

- SDK: Docker
- Port: `7860`
- Optional persistent storage mounted at `/data`

Environment variables:

```bash
APP_DATA_DIR=/data/tier-list-gen
CODEX_ENABLE_APP_SERVER=false
CODEX_HOME=/data/codex-home
```

Set `CODEX_ENABLE_APP_SERVER=true` after the app-server device-code harness is validated in the hosted container.
