# CS 1.6 ZM Live Backend

Small WebSocket bridge for the GitHub Pages status site.

The AMXX plugin writes JSON files on the HLDS machine. This backend reads those files and broadcasts a live snapshot to every browser connected to `/ws`.

## Install

No npm packages are required. Node.js 18+ is enough.

```powershell
cd backend
```

## Run Near The HLDS Server

```powershell
$env:ZM_WEB_DATA_DIR="C:\Path\To\hlds\cstrike\addons\amxmodx\data\zm_web"
$env:ZM_WEB_PORT="8080"
$env:ZM_WEB_MAX_WS_CLIENTS="5"
node server.js
```

Open health check:

```text
http://127.0.0.1:8080/health
```

WebSocket URL:

```text
ws://127.0.0.1:8080/ws
```

For a public GitHub Pages site, expose it as TLS through a reverse proxy and use:

```text
wss://your-domain.example/ws
```

Then set `liveSocketUrl` in `config.js`.

## Environment

- `ZM_WEB_DATA_DIR`: folder with `server_status.json`, `players.json`, `chat.json`, `events.json`.
- `ZM_WEB_HOST`: bind host, default `0.0.0.0`.
- `ZM_WEB_PORT`: bind port, default `8080`.
- `ZM_WEB_POLL_MS`: file polling interval, default `1000`.
- `ZM_WEB_MAX_WS_CLIENTS`: maximum simultaneous WebSocket clients, default `5`. Set `-1` to disable the limit.

## HTTP Fallback

The backend also exposes:

- `/snapshot`: current full state as JSON.
- `/health`: service health and connected client count.
