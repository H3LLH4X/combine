# Combine V22

## Runtime crash fix
- Fixed a remaining `roundState is not defined` runtime error in `CombineApp`.
- `roundState` is now derived safely from the synchronized room state before rendering the game board.
- Target cards, deck counts, turn state, and event list now use the safe round-state object so stale/missing round state cannot crash the screen.
- No gameplay rules changed.
