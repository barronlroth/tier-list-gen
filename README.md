# TierListGen

A private, phone-friendly tier-list maker. Gemini proposes contenders and generates coherent images; ranking progress and image data are shared through the host and cached in IndexedDB on each device.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev -- --hostname 0.0.0.0
```

Open `http://localhost:3000` (demo access code: `demo`). Without `GEMINI_API_KEY`, the app uses deterministic mock items and placeholder images. Add a Gemini API key to enable `gemini-3.1-flash-lite` item generation and `gemini-3.1-flash-lite-image` images using minimal thinking and square 1K output. Secrets are only read by route handlers.

For phone access, connect the phone to the same Wi-Fi and open `http://MAC_IP:3000`; find the address with `ipconfig getifaddr en0`. macOS may ask you to allow incoming Node connections.

## Validate

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Lists autosave to `.tierlistgen-data/lists.json` on the host and cache locally. When another device opens the app through the same Mac mini URL, its existing local lists merge into that shared library. Export creates a clean PNG of the ranking rows.

The default file store is designed for the always-on Mac mini. Vercel's function filesystem is ephemeral, so a Vercel deployment needs a durable database/object store before shared history can be relied on there. Set `TIERLISTGEN_DATA_DIR` to relocate the host data directory; do not place it inside a synced or public Git directory.
