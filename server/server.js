// server.js
// WebSocket server with rooms + authoritative state
// PLUS: static file hosting from ./public (no Express)
//
// Run: node server.js
//
// HTTP:
//   GET /health -> "ok"
//   GET /       -> serves ./public/index.html
//   GET /...    -> serves files under ./public
//
// WS:
//   ws://<host>:8787
//   Protocol:
//     Client -> { type:"JOIN", roomId:"abc", name?:"Sam" }
//     Client -> { type:"ACTION", action:{...} }
//     Server -> { type:"WELCOME", roomId, clientId }
//     Server -> { type:"ROOM", roomId, clients:[{clientId,name}] }
//     Server -> { type:"STATE", roomId, version, state }
//     Server -> { type:"REJECTED", roomId, reason }

import http from "http";
import { WebSocketServer } from "ws";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { initialState } from "../engine/state.js";
import { applyAction } from "../engine/reducer.js";

const PORT = Number(process.env.PORT || 8787);

// -------------------------
// Static hosting config
// -------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Put your client here:
//   public/index.html
//   public/trevdor.js
//   public/ui/... etc
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ENGINE_DIR = path.join(__dirname, "..", "engine");


// Minimal MIME map (important for ES modules)
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

// -------------------------
// Rooms + client registry
// -------------------------

// roomId -> { clients:Set(ws), state:any, version:number }
const rooms = new Map();

// ws -> { clientId, name, roomId }
const clientInfo = new Map();

let nextClientId = 1;

// -------------------------
// Room helpers
// -------------------------

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      clients: new Set(),
      state: initialState(4), // default players for now; can be configurable later
      version: 0,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function isOpen(ws) {
  // WebSocket OPEN readyState === 1
  return ws && ws.readyState === 1;
}

function safeSend(ws, obj) {
  if (isOpen(ws)) ws.send(JSON.stringify(obj));
}

function broadcastToRoom(roomId, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const ws of room.clients) safeSend(ws, obj);
}

function broadcastState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  broadcastToRoom(roomId, {
    type: "STATE",
    roomId,
    version: room.version,
    state: room.state,
  });
}

function roomRoster(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];

  const list = [];
  for (const ws of room.clients) {
    const info = clientInfo.get(ws);
    if (info) list.push({ clientId: info.clientId, name: info.name });
  }
  return list;
}

function leaveRoom(ws) {
  const info = clientInfo.get(ws);
  if (!info?.roomId) return;

  const roomId = info.roomId;
  const room = rooms.get(roomId);

  if (room) {
    room.clients.delete(ws);

    // notify others about roster change
    broadcastToRoom(roomId, {
      type: "ROOM",
      roomId,
      clients: roomRoster(roomId),
    });

    // cleanup empty room
    if (room.clients.size === 0) rooms.delete(roomId);
  }

  info.roomId = null;
}

function joinRoom(ws, roomId, name) {
  // leave previous room if any
  leaveRoom(ws);

  const info = clientInfo.get(ws);
  info.roomId = roomId;
  if (typeof name === "string" && name.trim()) info.name = name.trim();

  const room = getRoom(roomId);
  room.clients.add(ws);

  // welcome joiner
  safeSend(ws, { type: "WELCOME", roomId, clientId: info.clientId });

  // broadcast roster
  broadcastToRoom(roomId, {
    type: "ROOM",
    roomId,
    clients: roomRoster(roomId),
  });

  // send authoritative snapshot to the joiner
  safeSend(ws, {
    type: "STATE",
    roomId,
    version: room.version,
    state: room.state,
  });
}

// -------------------------
// HTTP server (health + static hosting)
// -------------------------

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  // Health check
  if (urlPath === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  // Decide which root to serve from
  let rootDir = PUBLIC_DIR;
  let rel = urlPath === "/" ? "/index.html" : urlPath;

  // If requesting engine files, switch root
  if (rel.startsWith("/engine/")) {
    rootDir = ENGINE_DIR;
    rel = rel.slice("/engine".length); // "/engine/state.js" -> "/state.js"
  }

  // Prevent directory traversal
  rel = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");

  const filePath = path.join(rootDir, rel);

  // Ensure path stays inside chosen root
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    res.end(data);
  });
});


// -------------------------
// WebSocket server
// -------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const clientId = nextClientId++;
  clientInfo.set(ws, { clientId, name: `guest-${clientId}`, roomId: null });

  console.log(`connected clientId=${clientId} from ${req.socket.remoteAddress}`);

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      safeSend(ws, { type: "ERROR", message: "Invalid JSON" });
      return;
    }

    const info = clientInfo.get(ws);

    if (msg.type === "JOIN") {
      const roomId = String(msg.roomId || "").trim();
      if (!roomId) {
        safeSend(ws, { type: "ERROR", message: "JOIN requires roomId" });
        return;
      }
      joinRoom(ws, roomId, msg.name);
      return;
    }

    if (msg.type === "ACTION") {
      if (!info.roomId) {
        safeSend(ws, { type: "ERROR", message: "You must JOIN a room first" });
        return;
      }
      if (!msg.action?.type) {
        safeSend(ws, { type: "ERROR", message: "ACTION requires action.type" });
        return;
      }

      const room = rooms.get(info.roomId);
      if (!room) return;

      const prev = room.state;
      const next = applyAction(prev, msg.action);

      // Convention: if reducer returns same state reference, treat as invalid/no-op
      if (next === prev) {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "INVALID_ACTION" });
        // resync sender
        safeSend(ws, {
          type: "STATE",
          roomId: info.roomId,
          version: room.version,
          state: room.state,
        });
        return;
      }

      room.state = next;
      room.version += 1;

      broadcastState(info.roomId);
      return;
    }


    /////////// TEMPORARY MANUAL RESET BUTTON FOR TO RESET SERVER GAME STATE from CLIENT ////////////
    if (msg.type === "RESET_GAME") {

      safeSend(ws, { type: "ERROR", message: "RESET REQUEST RECEIVED BY SERVER" })

      if (!info.roomId) {
        safeSend(ws, { type: "ERROR", message: "You must JOIN a room first" });
        return;
      }
      //if (!msg.action?.type) {
      //  safeSend(ws, { type: "ERROR", message: "ACTION requires action.type" });
      //  return;
      //}

      const room = rooms.get(info.roomId);
      if (!room) return;

      const prev = room.state;
      const next = initialState(4);

      // Convention: if reducer returns same state reference, treat as invalid/no-op
      if (next === prev) {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "INVALID_ACTION" });
        // resync sender
        safeSend(ws, {
          type: "STATE",
          roomId: info.roomId,
          version: room.version,
          state: room.state,
        });
        return;
      }

      room.state = next;
      room.version = 0;

      broadcastState(info.roomId);
      return;
    }
    /////////// TEMPORARY MANUAL RESET BUTTON FOR TO RESET SERVER GAME STATE from CLIENT ////////////


    // Optional: keep SAY for debugging/chat
    if (msg.type === "SAY") {
      if (!info.roomId) {
        safeSend(ws, { type: "ERROR", message: "You must JOIN a room first" });
        return;
      }
      const text = String(msg.text || "");
      broadcastToRoom(info.roomId, {
        type: "MSG",
        roomId: info.roomId,
        from: info.clientId,
        text,
      });
      return;
    }

    safeSend(ws, { type: "ERROR", message: `Unknown type: ${msg.type}` });
  });

  ws.on("close", () => {
    const info = clientInfo.get(ws);
    leaveRoom(ws);
    clientInfo.delete(ws);
    console.log(`disconnected clientId=${info?.clientId ?? "?"}`);
  });
});

server.listen(PORT, () => {
  console.log(`HTTP  : http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`WS    : ws://localhost:${PORT}`);
  console.log(`Static: ${PUBLIC_DIR}`);
});
