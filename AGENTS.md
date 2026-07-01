# AGENTS.md

## Cursor Cloud specific instructions

This is the **Fixera frontend** — a Next.js 15 / React 19 app (marketplace web UI). It talks to the `fixera-server` backend. Standard scripts are in `package.json`.

### Services & how to run
- **Run dev:** `npm run dev` — runs `scripts/generate-fcm-sw-config.mjs` then `next dev` on port `3000`.
- Requires the backend API running and reachable via `NEXT_PUBLIC_BACKEND_URL`. Copy `.env` from `.env.example`, but set `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000` (the example file defaults to `https://localhost:4000`, which fails against the local http backend).

### Non-obvious caveats
- `.npmrc` sets `legacy-peer-deps=true`, so `npm install` resolves peer deps loosely (needed for React 19 + some Radix/Stripe packages).
- **Lint:** `npm run lint` passes (emits warnings only). There is **no test suite**.
- The customer signup flow (`/signup/customer`) validates phone numbers against the selected country code and geocodes the address via a backend proxy; use a real, autocompletable address to pass validation.
