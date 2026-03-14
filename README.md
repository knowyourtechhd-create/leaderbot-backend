# LeaderBot Backend

Proxy server that fetches real Binance Futures leaderboard data for the LeaderBot trading dashboard.

## Endpoints

- `GET /` — health check
- `GET /api/leaderboard?limit=20` — top traders
- `GET /api/positions/:uid` — positions for one trader
- `POST /api/positions/batch` — positions for multiple traders `{ uids: [...] }`

## Deploy on Railway

1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Select this repo → Railway auto-detects Node.js and deploys
4. Copy the generated URL (e.g. leaderbot-backend.up.railway.app)
5. Paste it into the LeaderBot frontend as BACKEND_URL
