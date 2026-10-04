# Combine V27

## Changes

- Added a hard 15-card maximum per player hand in both online Cloudflare rooms and local Practice/Singleplayer modes.
- Practice Mode continues to support a custom target and now disables drawing when the 15-card cap is reached.
- Improved bot AI: after each bot draw, bots inspect the full living opponent hands (up to the six-card expression search window) for an expression that hits the current target.
- When a bot finds such a hand, it automatically invokes Dhappa and resolves the callout using the target player's cards.
- If no opponent hand fits, the bot checks its own hand and attempts when it can hit the target.
- Leaderboards now show a visible `+points` award pill immediately on the player who just earned round points, while preserving the existing round-total scoring flow.
- Gameplay rules remain unchanged.

- Bot expression search now scans beyond the first six cards in a 15-card hand, with a bounded search to keep the UI responsive.
