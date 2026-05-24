---
title: Tier List Gen
sdk: docker
pinned: false
---

# Tier List Gen

Hosted tier-list generator prototype using ChatGPT/Codex auth as the image-generation path, with a mock fallback when app-server auth is unavailable.

## V1 Shape

- Anonymous browser session owns local boards.
- ChatGPT/Codex device-code auth is scoped to the anonymous browser session.
- Classic `S A B C D F` tier board.
- Bottom tray for unranked tiles.
- Mutation field applies board changes.
- Real generation uses Codex app-server thread/turn APIs and image-generation events.
- The mock generator keeps the app usable when `CODEX_ENABLE_APP_SERVER` is off or the user has not connected ChatGPT.

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
CODEX_ENABLE_APP_SERVER=true
CODEX_HOME=/data/codex-home
```

When app-server is enabled, each browser session gets its own Codex home under `CODEX_HOME/sessions`.
