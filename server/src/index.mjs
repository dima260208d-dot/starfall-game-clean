/**
 * Игровой сервер Starfall — команды, онлайн-статус, WebSocket.
 */
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);
const PARTY_TTL_MS = 6 * 60 * 60 * 1000;
const PRESENCE_TTL_MS = 5 * 60 * 1000;
const INVITE_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { room: object, updatedAt: number }>} */
const parties = new Map();
/** @type {Map<string, { data: object, updatedAt: number }>} */
const presence = new Map();
/** @type {Map<string, Array<object>>} */
const partyInvites = new Map();
/** @type {Map<string, Set<import('ws').WebSocket>>} */
const wsRooms = new Map();

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
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

function normalizePlayerId(id) {
  return String(id ?? "").trim().toUpperCase();
}

function pruneParties() {
  const now = Date.now();
  for (const [code, entry] of parties) {
    if (now - entry.updatedAt > PARTY_TTL_MS) parties.delete(code);
  }
}

function prunePresence() {
  const now = Date.now();
  for (const [id, entry] of presence) {
    if (now - entry.updatedAt > PRESENCE_TTL_MS) presence.delete(id);
  }
}

function pruneInvites() {
  const now = Date.now();
  for (const [toId, list] of partyInvites) {
    const kept = list.filter((inv) => now - (inv.sentAt ?? 0) < INVITE_TTL_MS);
    if (kept.length) partyInvites.set(toId, kept);
    else partyInvites.delete(toId);
  }
}

function broadcast(roomId, payload) {
  const set = wsRooms.get(roomId);
  if (!set) return;
  const text = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(text);
  }
}

function broadcastParty(code, room) {
  broadcast(`party:${code}`, { type: "party:update", code, room });
}

function broadcastPresence(playerId, data) {
  broadcast("presence", { type: "presence:update", playerId, presence: data });
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
    prunePresence();
    pruneInvites();
    return json(res, 200, {
      ok: true,
      parties: parties.size,
      online: presence.size,
      ts: Date.now(),
    });
  }

  if (url.pathname === "/") {
    return json(res, 200, { service: "starfall-game-server", version: "0.3.0" });
  }

  const presenceMatch = url.pathname.match(/^\/api\/presence\/([A-Z0-9]+)$/i);
  if (presenceMatch) {
    const playerId = normalizePlayerId(presenceMatch[1]);

    if (req.method === "GET") {
      const entry = presence.get(playerId);
      if (!entry) return json(res, 404, { error: "not found" });
      return json(res, 200, { playerId, presence: entry.data, updatedAt: entry.updatedAt });
    }

    if (req.method === "PUT") {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}");
        if (!body.presence || typeof body.presence !== "object") {
          return json(res, 400, { error: "presence required" });
        }
        const updatedAt = Date.now();
        const data = { ...body.presence, playerId, updatedAt };
        presence.set(playerId, { data, updatedAt });
        broadcastPresence(playerId, data);
        return json(res, 200, { ok: true, playerId, updatedAt });
      } catch {
        return json(res, 400, { error: "invalid json" });
      }
    }

    if (req.method === "DELETE") {
      presence.delete(playerId);
      broadcastPresence(playerId, { playerId, screen: "offline", updatedAt: Date.now() });
      return json(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/presence/batch" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const ids = Array.isArray(body.ids) ? body.ids.map(normalizePlayerId) : [];
      const now = Date.now();
      const players = {};
      for (const id of ids) {
        const entry = presence.get(id);
        if (!entry) continue;
        if (now - entry.updatedAt > PRESENCE_TTL_MS) {
          presence.delete(id);
          continue;
        }
        players[id] = entry.data;
      }
      return json(res, 200, { players, ts: now });
    } catch {
      return json(res, 400, { error: "invalid json" });
    }
  }

  const inviteMatch = url.pathname.match(/^\/api\/party-invites\/([A-Z0-9]+)$/i);
  if (inviteMatch) {
    const toId = normalizePlayerId(inviteMatch[1]);

    if (req.method === "GET") {
      pruneInvites();
      const list = partyInvites.get(toId) ?? [];
      return json(res, 200, { playerId: toId, invites: list });
    }

    if (req.method === "DELETE") {
      const code = url.searchParams.get("code")?.toUpperCase();
      if (!code) return json(res, 400, { error: "code required" });
      const list = (partyInvites.get(toId) ?? []).filter((inv) => inv.code !== code);
      if (list.length) partyInvites.set(toId, list);
      else partyInvites.delete(toId);
      broadcast(`player:${toId}`, { type: "party-invite:cleared", code });
      return json(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/party-invite" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const toId = normalizePlayerId(body.toPlayerId);
      const fromId = normalizePlayerId(body.fromPlayerId);
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!toId || !fromId || !code) {
        return json(res, 400, { error: "toPlayerId, fromPlayerId, code required" });
      }
      const invite = {
        code,
        fromPlayerId: fromId,
        fromUsername: String(body.fromUsername ?? "Игрок"),
        sentAt: body.sentAt ?? Date.now(),
      };
      const list = partyInvites.get(toId) ?? [];
      const filtered = list.filter((inv) => inv.code !== code && inv.fromPlayerId !== fromId);
      filtered.push(invite);
      partyInvites.set(toId, filtered);
      broadcast(`player:${toId}`, { type: "party-invite:new", invite });
      return json(res, 200, { ok: true, invite });
    } catch {
      return json(res, 400, { error: "invalid json" });
    }
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

setInterval(() => {
  pruneParties();
  prunePresence();
  pruneInvites();
}, 10 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.info(`[game-server] listening on :${PORT}`);
});
