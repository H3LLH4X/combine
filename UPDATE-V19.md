# Combine V19

## Fixes
- Fixed the runtime crash `TypeError: tl is not a function`.
- Root cause was the diagonal background animation declaring `randomSpeed` as a number while calling it like a function.
- Changed `randomSpeed` to a function so animated glyphs can be seeded and respawned correctly.
- No gameplay rules changed.

## Deploy
- Push the V19 source to GitHub `main`.
- Vercel will redeploy the frontend.
- No Cloudflare Worker redeploy is required for this specific fix.
