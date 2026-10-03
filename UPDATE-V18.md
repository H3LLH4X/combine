# Combine V18

## Stability update

- Hardened render-time array/function handling on the game and Dhappa screens.
- Made QR-code generation lazy and non-fatal so it cannot crash the app render.
- Added HTTP lobby refresh fallback every 1.2s so the host sees players even when a WebSocket broadcast is delayed.
- Kept the Cloudflare WebSocket as the real-time path.
- Added inline source maps to make any remaining browser error point to source code.
- Pinned React/Vite toolchain versions instead of `latest` for reproducible Vercel builds.
- Kept monospace + Vapourwave UI and diagonal rapidly changing glyph background.
- Gameplay rules unchanged.
