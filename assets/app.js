const config = Object.assign({
  dataBase: "data",
  refreshMs: 10000,
  mapImageBase: "https://image.gametracker.com/images/maps/160x120/cs",
  chatWindowMinutes: 30
}, window.ZM_CONFIG || {});

const state = {
  status: null,
  players: [],
  chat: [],
  events: []
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

async function loadJson(name, fallback) {
  const url = `${config.dataBase.replace(/\/$/, "")}/${name}.json?ts=${Date.now()}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    const response = await fetch(`data/sample/${name}.json`, { cache: "no-store" });
    if (response.ok) return await response.json();
    return fallback;
  }
}

function teamName(team) {
  if (team === 1 || team === "TERRORIST") return "T";
  if (team === 2 || team === "CT") return "CT";
  if (team === 3 || team === "SPECTATOR") return "SPEC";
  return "UNASSIGNED";
}

function formatTime(value) {
  if (!value) return "never";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mapImageUrl(map) {
  const safeMap = encodeURIComponent(map || "unknown");
  return `${config.mapImageBase.replace(/\/$/, "")}/${safeMap}.jpg`;
}

function renderStatus() {
  const status = state.status || {};
  const playersOnline = status.players_online ?? state.players.length;
  const maxPlayers = status.players_max ?? 0;
  const map = status.map || "unknown";

  $("serverName").textContent = status.hostname || "CS 1.6 Zombie Mod";
  $("serverState").textContent = status.online === false ? "OFFLINE" : "ONLINE";
  $("serverState").classList.toggle("offline", status.online === false);
  $("onlinePlayers").textContent = playersOnline;
  $("maxPlayers").textContent = maxPlayers;
  $("currentMap").textContent = map;
  $("roundState").textContent = status.round_state || "live";
  $("updatedAt").textContent = formatTime(status.updated_at);

  const img = $("mapImage");
  const url = mapImageUrl(map);
  img.src = url;
  img.onerror = () => {
    img.removeAttribute("src");
    img.alt = "No image for current map";
    $("mapCaption").textContent = "NO IMAGE";
  };
  $("mapCaption").textContent = map;
  $("mapSource").href = url;
}

function renderPlayers() {
  const players = [...state.players].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  $("playersCount").textContent = `${players.length} connected`;
  $("playersList").innerHTML = players.length
    ? players.map((player) => `
      <div class="player">
        <div>
          <div class="player-name">${esc(player.name)}</div>
          <div class="chat-meta">${esc(teamName(player.team))}${player.alive ? " / alive" : " / dead"}</div>
        </div>
        <span class="tag ${player.bot ? "bot" : ""}">${player.bot ? "BOT" : "PLAYER"}</span>
      </div>
    `).join("")
    : `<div class="empty">No players online.</div>`;
}

function renderChat() {
  const minTime = Math.floor(Date.now() / 1000) - (config.chatWindowMinutes * 60);
  const messages = state.chat.filter((line) => !line.time || line.time >= minTime);
  $("chatLog").innerHTML = messages.length
    ? messages.map((line) => `
      <div class="chat-line">
        <div class="chat-meta">${formatTime(line.time)} ${line.team ? `/ ${esc(line.team)}` : ""}</div>
        <div><span class="chat-name">${esc(line.name)}</span></div>
        <div class="chat-text">${esc(line.message)}</div>
      </div>
    `).join("")
    : `<div class="empty">No recent chat messages.</div>`;
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

function renderEvents() {
  const events = state.events.slice(-12).reverse();
  $("eventCount").textContent = `${events.length} events`;
  $("eventsList").innerHTML = events.length
    ? events.map((event) => `
      <div class="event">
        <div class="event-time">${formatTime(event.time)}</div>
        <strong>${esc(event.type)}</strong>
        <div class="chat-meta">${esc(event.detail || "")}</div>
      </div>
    `).join("")
    : `<div class="empty">No events yet.</div>`;
}

async function refresh() {
  const [status, players, chat, events] = await Promise.all([
    loadJson("server_status", {}),
    loadJson("players", []),
    loadJson("chat", []),
    loadJson("events", [])
  ]);

  state.status = status;
  state.players = Array.isArray(players) ? players : players.players || [];
  state.chat = Array.isArray(chat) ? chat : chat.messages || [];
  state.events = Array.isArray(events) ? events : events.events || [];

  renderStatus();
  renderPlayers();
  renderChat();
  renderEvents();
}

refresh();
setInterval(refresh, config.refreshMs);
