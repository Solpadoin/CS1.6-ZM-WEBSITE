"use strict";

const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const path = require("path");

const port = Number(process.env.ZM_WEB_PORT || 8080);
const host = process.env.ZM_WEB_HOST || "0.0.0.0";
const dataDir = path.resolve(
  process.env.ZM_WEB_DATA_DIR ||
    path.join(__dirname, "..", "data")
);
const pollMs = Number(process.env.ZM_WEB_POLL_MS || 1000);

const files = {
  status: "server_status.json",
  players: "players.json",
  chat: "chat.json",
  events: "events.json"
};

let lastSignature = "";
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
  return {
    status: readJson(files.status, { online: false, updated_at: Math.floor(Date.now() / 1000) }),
    players: readJson(files.players, []),
    chat: readJson(files.chat, []),
    events: readJson(files.events, [])
  };
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

server.on("upgrade", (request, socket) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
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
});
