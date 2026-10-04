# Combine V29 — Preserve Player Time Across Turns

- Fixed local Singleplayer timer resetting to full time every turn.
- Local player and bot turns now preserve and deduct from each player's remainingTime across turns.
- Starting Attempt/Dhappa in Singleplayer freezes the player's current remaining time and resumes from that value if the challenge is canceled.
- Cloudflare timer serialization now derives `turnDeadlineAt` from the active player's current remaining time instead of reusing the original turn start timestamp.
- Cloudflare alarm scheduling now uses the active player's current effective remaining time, preserving the per-player total clock.
- Gameplay rules unchanged.
