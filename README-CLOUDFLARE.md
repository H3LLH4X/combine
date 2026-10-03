# Combine — Cloudflare Durable Objects backend

This repository now supports two deployment targets:

- **Vercel:** React/Vite frontend (`npm run build`)
- **Cloudflare Workers + Durable Objects:** authoritative WebSocket game server (`wrangler deploy`)

## Why this backend

The Combine room is one Durable Object per room code. WebSocket clients connect directly to that room. Game state is stored with the Durable Object Storage API so it survives hibernation and reconnects. WebSocket Hibernation keeps connected clients alive while the object is idle.

## Local Cloudflare development

1. Install Node.js.
2. Install dependencies:

```bash
npm install
```

3. Log in to Cloudflare:

```bash
npx wrangler login
```

4. Run the Worker locally:

```bash
npm run dev:cloudflare
```

The Worker exposes `/health`, `/api/create`, `/api/join`, `/api/rejoin`, and `/ws`.

## Deploy

```bash
npm run deploy:cloudflare
```

Wrangler will deploy the Worker and register the `CombineRoom` SQLite-backed Durable Object migration.

## Vercel

Keep the React frontend on Vercel. After deployment, set the Vercel environment variable:

```text
VITE_WS_URL=wss://combine-server.<your-subdomain>.workers.dev
```

The frontend converts that same origin to HTTPS for room create/join/rejoin API requests.

## Important

The frontend and backend are deliberately separate. Do not configure Vercel to run `server.js`; Vercel only builds/serves the React app. Cloudflare is the multiplayer authority.


## Recommended deployment from GitHub (no manual server)

Cloudflare Workers Builds can connect directly to the GitHub repository and automatically deploy on every push to the selected production branch.

In Cloudflare:

1. Workers & Pages -> Create application -> Import repository.
2. Connect GitHub and choose `H3LLH4X/combine`.
3. Select branch `main`.
4. Set the root directory to `/`.
5. Build command: leave blank (the Worker itself is already ready for Wrangler deployment).
6. Deploy command: `npx wrangler deploy`.
7. Save and Deploy.

Cloudflare will deploy the `CombineRoom` Durable Object using `wrangler.jsonc`.

After the Worker is live, set the Vercel environment variable:

```text
VITE_WS_URL=wss://combine-server.<your-subdomain>.workers.dev
```

Because the frontend converts `wss://` to `https://` for `/api/create`, `/api/join`, and `/api/rejoin`, no second API URL is required.
