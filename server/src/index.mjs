/**
 * Игровой сервер Starfall — команды, WebSocket, API для пати.
 * Деплой: cd server && fly deploy
 */
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);
const PARTY_TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, { room: object, updatedAt: number }>} */
const parties = new Map();
/** @type {Map<string, Set<import('ws').WebSocket>>} */
const wsRooms = new Map();

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function pruneParties() {
  const now = Date.now();
  for (const [code, entry] of parties) {
    if (now - entry.updatedAt > PARTY_TTL_MS) parties.delete(code);
  }
}

function broadcastParty(code, room) {
  const roomId = `party:${code}`;
  const set = wsRooms.get(roomId);
  if (!set) return;
  const payload = JSON.stringify({ type: "party:update", code, room });
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    pruneParties();
    return json(res, 200, { ok: true, parties: parties.size, ts: Date.now() });
  }

  if (url.pathname === "/") {
    return json(res, 200, { service: "starfall-game-server", version: "0.2.0" });
  }

  const partyMatch = url.pathname.match(/^\/api\/party\/([A-Z0-9]+)$/i);
  if (partyMatch) {
    const code = partyMatch[1].toUpperCase();

    if (req.method === "GET") {
      const entry = parties.get(code);
      if (!entry) return json(res, 404, { error: "not found" });
      return json(res, 200, { code, room: entry.room, updatedAt: entry.updatedAt });
    }

    if (req.method === "PUT") {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}");
        if (!body.room || typeof body.room !== "object") {
          return json(res, 400, { error: "room required" });
        }
        const updatedAt = Date.now();
        parties.set(code, { room: body.room, updatedAt });
        broadcastParty(code, body.room);
        return json(res, 200, { ok: true, code, updatedAt });
      } catch {
        return json(res, 400, { error: "invalid json" });
      }
    }

    if (req.method === "DELETE") {
      parties.delete(code);
      return json(res, 200, { ok: true });
    }
  }

  json(res, 404, { error: "not found" });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/ws", `http://${req.headers.host}`);
  const roomId = url.searchParams.get("room") ?? "lobby";
  if (!wsRooms.has(roomId)) wsRooms.set(roomId, new Set());
  wsRooms.get(roomId).add(ws);

  ws.send(JSON.stringify({ type: "welcome", roomId, ts: Date.now() }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  });

  ws.on("close", () => {
    const set = wsRooms.get(roomId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) wsRooms.delete(roomId);
  });
});

setInterval(pruneParties, 10 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.info(`[game-server] listening on :${PORT}`);
});
