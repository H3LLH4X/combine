# Combine V14 Update

## Fixes
- Fixed the normal **ATTEMPT** flow so a missing target-player state no longer produces an invisible/blank challenge screen; a visible recovery modal is shown instead.
- Added a React error boundary so unexpected client render errors show an actionable error screen instead of a completely blank page.
- Fixed lobby synchronization: when a player joins, the Cloudflare Durable Object immediately broadcasts the updated room state to already-connected players. The host no longer needs to reload to see new players.
- Also broadcasts state on rejoin.

## Visual changes
- Global font changed to **monospace**.
- Theme changed from Monokai to **Vapourwave** with neon cyan/pink/purple styling.
- Initial screen now has a moving canvas background of changing letters, numbers, operators and symbols.

## Settings
The settings modal now has dedicated sections for:
- **GENERAL** — player name and reset local UI preferences.
- **BACKGROUND** — animated matrix background, plain background, custom image URL, image upload.
- **AUDIO** — sound effects and volume.
- **VIDEO** — interface animations and moving background.
- **GAMEPLAY** — global target, player timer, Dhappa timer, and turn direction. Gameplay settings are editable from the menu and locked once inside a room.

UI preferences are saved in browser localStorage.

## Deployment
Push the frontend changes to GitHub so Vercel redeploys the frontend.
Deploy the updated `cloudflare/worker.js` to Cloudflare Workers as well, because the lobby broadcast fix is server-side.

Keep the Vercel environment variable:

`VITE_WS_URL=wss://combine.clockcombine.workers.dev`
