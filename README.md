# CS 1.6 ZM Website

Static GitHub Pages status page for a Counter-Strike 1.6 Zombie Mod server.

https://solpadoin.github.io/CS1.6-ZM-WEBSITE/

## What It Shows

- Server name
- Current map
- Online/max players
- Player list
- Chat from the last 30 minutes
- Recent server events
- Map preview from GameTracker map images, with a built-in `NO IMAGE` fallback

## GitHub Pages

Use repository root as the Pages source.

The site can work in two modes.

### Live WebSocket Mode

Set `liveSocketUrl` in `config.js`:

```js
window.ZM_CONFIG = {
  liveSocketUrl: "wss://your-domain.example/ws",
  dataBase: "data",
  refreshMs: 10000,
  reconnectMs: 5000,
  mapImageBase: "https://image.gametracker.com/images/maps/160x120/cs",
  chatWindowMinutes: 30
};
```

Run the backend from `backend/` on the same machine or VPS where the HLDS server can write JSON files. GitHub Pages serves the frontend only; no commits are needed for live updates.

For testing without editing `config.js`, open:

```text
https://solpadoin.github.io/CS1.6-ZM-WEBSITE/?liveSocketUrl=wss%3A%2F%2Fyour-domain.example%2Fws
```

### Static JSON Fallback

If `liveSocketUrl` is empty, the site polls:

- `data/server_status.json`
- `data/players.json`
- `data/chat.json`
- `data/events.json`

If live data is missing, it falls back to `data/sample/*.json`.

## AMXX Exporter

Compile `amxx/zm_web_exporter.sma` and install:

```text
addons/amxmodx/plugins/zm_web_exporter.amxx
```

Add to `addons/amxmodx/configs/plugins.ini`:

```text
zm_web_exporter.amxx
```

The plugin writes JSON to:

```text
addons/amxmodx/data/zm_web
```

## Live Backend

Install and run:

```powershell
cd backend
$env:ZM_WEB_DATA_DIR="C:\Path\To\hlds\cstrike\addons\amxmodx\data\zm_web"
$env:ZM_WEB_PORT="8080"
node server.js
```

Local WebSocket:

```text
ws://127.0.0.1:8080/ws
```

For GitHub Pages, put the backend behind HTTPS/TLS and configure:

```text
wss://your-domain.example/ws
```

The backend also exposes:

- `GET /health`
- `GET /snapshot`

## Legacy Sync Data To Pages

From this repository:

```powershell
.\scripts\sync-from-hlds.ps1 -Push
```

This copies AMXX JSON files into `data/`, commits them, and pushes to GitHub Pages.

This path is only a fallback. Real-time updates should use the WebSocket backend.
