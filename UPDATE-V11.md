# Combine V11 Update

Fixes included:

- Added missing `Summary` component to prevent the blank screen / `Summary is not defined` crash.
- Added missing `GameOver` component.
- Added Cloudflare `serverNow` timestamp to synchronized game state.
- Client now compensates for browser/server clock difference when displaying turn and Dhappa timers.
- Fixed Dhappa expression submission to send the `tokens` format expected by the Cloudflare Worker.
- Changed the permanent Vite build script to bypass the non-executable `.bin/vite` launcher on Vercel.

Deployment:

1. Push all files to GitHub.
2. Vercel will redeploy the frontend.
3. Redeploy the Cloudflare Worker because `cloudflare/worker.js` changed.
4. Keep `VITE_WS_URL=wss://combine.clockcombine.workers.dev` in Vercel Environment Variables.
