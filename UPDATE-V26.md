# Combine V26

## Fix
Added the missing local `shuffle()` helper used by Practice Mode and Singleplayer bot mode when creating number/operator decks.

This fixes:
- `ReferenceError: shuffle is not defined` in Practice Mode
- `ReferenceError: shuffle is not defined` in Singleplayer Mode

No gameplay rules or multiplayer/Cloudflare behavior were changed.
