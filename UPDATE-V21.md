# Combine V21

## Rejoin / join-flow fix
- If a browser already has a valid session for the room code entered, JOIN now reconnects that existing player session instead of attempting to create a duplicate player.
- Existing players can reconnect after the game has started, including after closing/reopening the browser.
- New players are still prevented from joining once the room leaves the lobby.
- "Room already started" errors now explain the distinction and direct existing players to RESUME ROOM / reconnect.
- Existing lobby broadcast behavior is preserved.

## Gameplay
No gameplay rules were changed.
