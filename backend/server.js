"use strict";

const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const port = Number(process.env.ZM_WEB_PORT || 8080);
const host = process.env.ZM_WEB_HOST || "0.0.0.0";
const dataDir = path.resolve(
  process.env.ZM_WEB_DATA_DIR ||
    path.join(__dirname, "..", "data")
);
const pollMs = Number(process.env.ZM_WEB_POLL_MS || 1000);
const maxWsClients = Number(process.env.ZM_WEB_MAX_WS_CLIENTS || 5);

const files = {
  status: "server_status.json",
  players: "players.json",
  chat: "chat.json",
  events: "events.json",
  system: "system.json"
};

let lastSignature = "";
let previousCpu = readCpuTimes();
let snapshot = readSnapshot();
const clients = new Set();

function readJson(file, fallback) {
  const fullPath = path.join(dataDir, file);

  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function readSnapshot() {
  const system = readSystemSnapshot();
  writeSystemSnapshot(system);

  return {
    status: readJson(files.status, { online: false, updated_at: Math.floor(Date.now() / 1000) }),
    players: readJson(files.players, []),
    chat: readJson(files.chat, []),
    events: readJson(files.events, []),
    system
  };
}

function readCpuTimes() {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch (error) {
    const cpus = os.cpus();
    const totals = cpus.reduce((acc, cpu) => {
      const times = cpu.times;
      acc.idle += times.idle;
      acc.total += times.user + times.nice + times.sys + times.idle + times.irq;
      return acc;
    }, { idle: 0, total: 0 });
    return totals;
  }
}

function readMemoryInfo() {
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    const values = Object.fromEntries(raw.split("\n").map((line) => {
      const match = line.match(/^([^:]+):\s+(\d+)/);
      return match ? [match[1], Number(match[2]) * 1024] : null;
    }).filter(Boolean));
    const total = values.MemTotal || os.totalmem();
    const available = values.MemAvailable || os.freemem();
    return { total, available };
  } catch (error) {
    return { total: os.totalmem(), available: os.freemem() };
  }
}

function readSystemSnapshot() {
  const currentCpu = readCpuTimes();
  const totalDelta = currentCpu.total - previousCpu.total;
  const idleDelta = currentCpu.idle - previousCpu.idle;
  const cpuPercent = totalDelta > 0
    ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
    : 0;
  previousCpu = currentCpu;

  const memory = readMemoryInfo();
  const used = Math.max(0, memory.total - memory.available);
  const cpu = os.cpus()[0] || { model: "unknown" };

  return {
    updated_at: Math.floor(Date.now() / 1000),
    cpu: {
      model: cpu.model,
      cores: os.cpus().length,
      load_percent: Number(cpuPercent.toFixed(1)),
      load_average: os.loadavg().map((value) => Number(value.toFixed(2)))
    },
    memory: {
      total_bytes: memory.total,
      used_bytes: used,
      free_bytes: memory.available,
      used_percent: memory.total > 0 ? Number(((used / memory.total) * 100).toFixed(1)) : 0
    }
  };
}

function writeSystemSnapshot(system) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, files.system), JSON.stringify(system, null, 2));
  } catch (error) {
    // The live snapshot still works even if the fallback file cannot be written.
  }
}

function signSnapshot(next) {
  return JSON.stringify(next);
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(payload);
}

function broadcast(next) {
  const payload = JSON.stringify({ type: "snapshot", payload: next });

  for (const client of clients) {
    sendWebSocketText(client, payload);
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, { ok: true, clients: clients.size, dataDir });
    return;
  }

  if (requestUrl.pathname === "/snapshot") {
    sendJson(response, 200, snapshot);
    return;
  }

  if (requestUrl.pathname === "/system") {
    sendJson(response, 200, snapshot.system || readSystemSnapshot());
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

function createAcceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function createTextFrame(text) {
  const payload = Buffer.from(text);

  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }

  if (payload.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function sendWebSocketText(socket, text) {
  if (socket.destroyed || !socket.writable) {
    clients.delete(socket);
    return;
  }

  try {
    socket.write(createTextFrame(text));
  } catch (error) {
    clients.delete(socket);
    socket.destroy();
  }
}

function rejectUpgrade(socket, statusCode, message) {
  socket.write([
    `HTTP/1.1 ${statusCode} ${message}`,
    "Connection: close",
    "Content-Length: 0",
    "",
    ""
  ].join("\r\n"));
  socket.destroy();
}

server.on("upgrade", (request, socket) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  if (maxWsClients >= 0 && clients.size >= maxWsClients) {
    rejectUpgrade(socket, 503, "Service Unavailable");
    return;
  }

  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${createAcceptKey(key)}`,
    "",
    ""
  ].join("\r\n"));

  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("end", () => clients.delete(socket));
  socket.on("data", (buffer) => {
    if ((buffer[0] & 0x0f) === 0x08) {
      clients.delete(socket);
      socket.end();
    }
  });

  sendWebSocketText(socket, JSON.stringify({ type: "snapshot", payload: snapshot }));
});

setInterval(() => {
  const next = readSnapshot();
  const signature = signSnapshot(next);

  if (signature === lastSignature) return;

  snapshot = next;
  lastSignature = signature;
  broadcast(snapshot);
}, pollMs);

server.listen(port, host, () => {
  lastSignature = signSnapshot(snapshot);
  console.log(`ZM live backend listening on ${host}:${port}`);
  console.log(`Reading AMXX JSON from: ${dataDir}`);
  console.log(`WebSocket path: /ws`);
  console.log(`Max WebSocket clients: ${maxWsClients}`);
});
