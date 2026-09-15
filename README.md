# Combine — Client / Server Multiplayer

This version uses an authoritative Node.js + WebSocket server for shared game state. The browser is a client only: turn validation, cards, timers, Dhappa, elimination, round scoring and game winning are decided by the server.

## Development

Install dependencies:

```bash
npm install
```

Run the Vite client (terminal 1):

```bash
npm run dev
```

Run the game server (terminal 2):

```bash
npm start
```

Vite proxies `/ws` to `ws://localhost:3001`.

Open the Vite URL (`http://localhost:5173`) on the host machine. For another device on the same LAN, use the host's LAN IP with the Vite dev server or use the production mode below.

## LAN / Production mode

Build and run the combined server:

```bash
npm run build
npm start
```

The server serves `dist/` and WebSockets at `/ws`. Open `http://<host-lan-ip>:3001/` from each device.

## Online deployment

Deploy the React frontend and the Node/WebSocket server on infrastructure that supports persistent WebSocket connections. Keep the server authoritative.

## Game rules implemented

- 2–6 players
- number deck: four copies of 0–9
- operator deck: four copies each of +, -, *, /
- two number cards form the round target as a concatenated number
- exactly one draw per turn
- public hands
- per-player main timer
- Attempt and Dhappa challenge timer
- adjacent number cards concatenate into one number
- operator precedence follows BEDMAS-style multiplication/division before addition/subtraction, evaluated left-to-right within equal precedence
- I WON points: 5, 3, 2, 1, 1, last = 0
- successful kick: caller +3, target +0
- round points become cumulative only at round end
- first cumulative total to reach the global target wins


## v4 fixes
- Live expression results are shown while building expressions.
- Adjacent number cards concatenate during evaluation.
- Stale local sessions are cleared if their room no longer exists.
- Removed accidental target-card/target-player chooser state collision.


## Public deployment (Render)
This is a single Node web service that serves the built React client and the WebSocket server from the same origin. Deploy the repository as a Render Web Service using the included `render.yaml`. Render supports inbound WebSockets; the deployed app uses `https`/`wss` automatically via the current origin. Share the generated `onrender.com` URL or the room's Copy Join Link. No IP:port is required.

Important: rooms are currently in server memory. A server restart/redeploy clears active rooms. For longer-lived production rooms, add persistent storage (e.g. Redis/Postgres) and/or a session store.
