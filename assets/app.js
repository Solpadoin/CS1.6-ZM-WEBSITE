const config = Object.assign({
  liveSocketUrl: "",
  dataBase: "data",
  refreshMs: 10000,
  reconnectMs: 5000,
  mapImageBase: "https://image.gametracker.com/images/maps/160x120/cs",
  chatWindowMinutes: 30
}, window.ZM_CONFIG || {});

const state = {
  status: null,
  players: [],
  chat: [],
  events: [],
  system: null,
  systemHistory: [],
  live: false,
  socket: null,
  reconnectTimer: null,
  pollingTimer: null
};

const $ = (id) => document.getElementById(id);

function applyUrlConfig() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("liveSocketUrl")) {
    config.liveSocketUrl = params.get("liveSocketUrl");
  }

  if (params.has("dataBase")) {
    config.dataBase = params.get("dataBase");
  }
}

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

function formatBytes(value) {
  const bytes = Number(value || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function pushSystemHistory(system) {
  if (!system || !system.cpu || !system.memory) return;

  const last = state.systemHistory[state.systemHistory.length - 1];
  if (last && last.time === system.updated_at) return;

  state.systemHistory.push({
    time: system.updated_at || Math.floor(Date.now() / 1000),
    cpu: Number(system.cpu.load_percent || 0),
    ram: Number(system.memory.used_percent || 0)
  });

  if (state.systemHistory.length > 90) {
    state.systemHistory.splice(0, state.systemHistory.length - 90);
  }
}

function drawLineChart(canvas, values, color) {
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const ratio = window.devicePixelRatio || 1;

  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!values.length) return;

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
    const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}55`);
  gradient.addColorStop(1, `${color}00`);

  ctx.beginPath();
  ctx.moveTo(points[0].x, height);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.lineTo(points[points.length - 1].x, height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
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
  $("serverState").textContent = status.online === false ? "OFFLINE" : (state.live ? "LIVE" : (config.liveSocketUrl ? "RETRY" : "ONLINE"));
  $("serverState").classList.toggle("offline", status.online === false || !state.live && Boolean(config.liveSocketUrl));
  $("onlinePlayers").textContent = playersOnline;
  $("maxPlayers").textContent = maxPlayers;
  $("currentMap").textContent = map;
  $("roundState").textContent = status.round_state || "live";
  $("updatedAt").textContent = formatTime(status.updated_at);

  const img = $("mapImage");
  const url = mapImageUrl(map);
  img.classList.remove("is-missing");
  img.alt = `Preview for ${map}`;
  img.onload = () => {
    img.classList.remove("is-missing");
    $("mapCaption").textContent = map;
  };
  img.src = url;
  img.onerror = () => {
    img.removeAttribute("src");
    img.classList.add("is-missing");
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

function renderSystem() {
  const system = state.system || {};
  const cpu = system.cpu || {};
  const memory = system.memory || {};

  pushSystemHistory(system);

  $("systemUpdated").textContent = formatTime(system.updated_at);
  $("cpuUsed").textContent = Number(cpu.load_percent || 0).toFixed(1);
  $("cpuInfo").textContent = `${cpu.cores || 0} cores / ${cpu.model || "unknown CPU"}`;
  $("ramUsed").textContent = formatBytes(memory.used_bytes);
  $("ramTotal").textContent = formatBytes(memory.total_bytes);
  $("ramInfo").textContent = `${Number(memory.used_percent || 0).toFixed(1)}% used / ${formatBytes(memory.free_bytes)} free`;

  drawLineChart($("cpuChart"), state.systemHistory.map((point) => point.cpu), "#a6ff72");
  drawLineChart($("ramChart"), state.systemHistory.map((point) => point.ram), "#e6b15a");
}

async function refresh() {
  const [status, players, chat, events, system] = await Promise.all([
    loadJson("server_status", {}),
    loadJson("players", []),
    loadJson("chat", []),
    loadJson("events", []),
    loadJson("system", {})
  ]);

  state.status = status;
  state.players = Array.isArray(players) ? players : players.players || [];
  state.chat = Array.isArray(chat) ? chat : chat.messages || [];
  state.events = Array.isArray(events) ? events : events.events || [];
  state.system = system;

  renderStatus();
  renderPlayers();
  renderChat();
  renderEvents();
  renderSystem();
}

function applySnapshot(snapshot) {
  const payload = snapshot && snapshot.payload ? snapshot.payload : snapshot || {};

  state.status = payload.status || payload.server_status || {};
  state.players = Array.isArray(payload.players) ? payload.players : payload.players?.players || [];
  state.chat = Array.isArray(payload.chat) ? payload.chat : payload.chat?.messages || [];
  state.events = Array.isArray(payload.events) ? payload.events : payload.events?.events || [];
  state.system = payload.system || {};

  renderStatus();
  renderPlayers();
  renderChat();
  renderEvents();
  renderSystem();
}

function startPolling() {
  if (state.pollingTimer) return;

  refresh();
  state.pollingTimer = setInterval(refresh, config.refreshMs);
}

function stopPolling() {
  if (!state.pollingTimer) return;

  clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectLiveSocket();
  }, config.reconnectMs);
}

function connectLiveSocket() {
  if (!config.liveSocketUrl) {
    startPolling();
    return;
  }

  try {
    state.socket = new WebSocket(config.liveSocketUrl);
  } catch (error) {
    state.live = false;
    renderStatus();
    startPolling();
    scheduleReconnect();
    return;
  }

  state.socket.addEventListener("open", () => {
    state.live = true;
    stopPolling();
    renderStatus();
  });

  state.socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot" || !message.type) {
        applySnapshot(message);
      }
    } catch (error) {
      console.warn("Bad live payload", error);
    }
  });

  state.socket.addEventListener("close", () => {
    state.live = false;
    renderStatus();
    startPolling();
    scheduleReconnect();
  });

  state.socket.addEventListener("error", () => {
    state.live = false;
    renderStatus();
  });
}

applyUrlConfig();
connectLiveSocket();
