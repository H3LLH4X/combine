# Combine V24 — Singleplayer + Practice

## Added
- Singleplayer mode with 1–5 local bots.
- Bot count selection (2–6 total players).
- Singleplayer game target score selection.
- Singleplayer player timer selection.
- Bot AI that draws exactly one card, searches for valid expressions, attempts when it can hit the target, and passes otherwise.
- Human can use normal Attempt and Dhappa flow against bots.
- Singleplayer rounds use the existing Combine scoring and round progression rules.
- Practice mode is solo and lets the player choose a custom target from 1–9999.
- Practice keeps the target fixed until the player hits it.
- Practice uses the same card drawing and expression rules.
- Both modes reuse the V23 virtual tabletop UI, Vapourwave theme, monospace font, and animated background.

## Multiplayer
- No Cloudflare Worker changes are required for these modes.
- Existing online multiplayer flow is unchanged.

## Deploy
Frontend-only changes. Push the project to GitHub and let Vercel redeploy.
