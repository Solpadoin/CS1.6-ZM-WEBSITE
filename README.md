# CS 1.6 ZM Website

Static GitHub Pages status page for a Counter-Strike 1.6 Zombie Mod server.

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

The site reads:

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

## Sync Data To Pages

From this repository:

```powershell
.\scripts\sync-from-hlds.ps1 -Push
```

This copies AMXX JSON files into `data/`, commits them, and pushes to GitHub Pages.

GitHub Pages is static hosting and cannot receive POST requests directly from AMXX. For true real-time updates, put a tiny API/proxy between the server and the website, then set `dataBase` in `config.js` to that API URL.
