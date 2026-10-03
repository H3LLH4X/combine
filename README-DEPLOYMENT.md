# Deployment: Vercel frontend + Render game server

The recommended production setup is to use Vercel for the React/Vite frontend and a Render Web Service for the authoritative Node/WebSocket game server. Both can deploy automatically from the same GitHub repository.

## Vercel
Create/import the GitHub repo as a Vercel project. Vercel should detect Vite. Add this Environment Variable in the Vercel project:

`VITE_WS_URL=wss://YOUR-RENDER-SERVICE.onrender.com`

Then every Vercel deployment will build the frontend and the browser will connect to the Render server automatically.

## Render
Create a **Web Service** from the same GitHub repository. The included `render.yaml` can also be used as a Blueprint. Render uses the repository's start command (`npm start`) and automatically redeploys when the connected Git branch changes.

The Render service is the server; users should open only the Vercel URL. Room join links can therefore use the Vercel URL and never expose an IP address or port.

## Important
The current room store is in server memory. A Render restart/redeploy will clear active rooms. Before treating this as production infrastructure, add durable/shared storage for rooms and reconnect state.
