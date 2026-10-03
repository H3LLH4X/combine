# Combine V13 Update

## Leave Room Fix
- Fixed the blank-screen transition caused by rendering a lobby/game view after room state is cleared.
- The app now immediately falls back to the main menu whenever room state is unavailable.
- Added a `LEAVE ROOM` control to the in-game top bar on desktop.
- Added `LEAVE ROOM` inside in-game Settings so the option remains available on mobile.
- Leaving the room still uses the existing authoritative Cloudflare `leaveRoom` action, so host reassignment and room deletion behavior remain server-controlled.

## Gameplay
No game rules were changed.
