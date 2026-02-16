// server.js
// -----------------------------------------------------------------------------
// Trevdor Server
// -----------------------------------------------------------------------------
// Responsibilities:
//   1) HTTP server:
//        - GET /health -> "ok"
//        - serves static client files from ../public
//        - optionally serves engine modules from ../engine via /engine/*
//
//   2) WebSocket server:
//        - rooms (multiple games in parallel)
//        - per-room authoritative state (the ONLY source of truth)
//        - seat assignment (playerIndex 0..3) or spectator (null)
//        - turn enforcement (only activePlayerIndex can act)
//
// Protocol (client -> server):
//   { type:"JOIN", roomId:"abc", name?:"Sam" }
//   { type:"ACTION", roomId:"abc", action:{ type:"TAKE_TOKENS" | ... } }
//   { type:"RESET_GAME", roomId:"abc" }   // temporary manual reset (debug)
//
// Protocol (server -> client):
//   { type:"WELCOME", roomId, clientId, playerIndex }           // sent to joiner only
//   { type:"ROOM", roomId, clients:[{seat,clientId,name,occupied}] } // broadcast to room
//   { type:"STATE", roomId, version, state }                    // broadcast or resync
//   { type:"REJECTED", roomId, reason, ...optionalFields }      // rejected action
//   { type:"ERROR", message }                                   // malformed messages, etc.
// -----------------------------------------------------------------------------

import http from "http";
import { WebSocketServer } from "ws";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { initialState } from "../engine/state.js";
import { applyAction } from "../engine/reducer.js";

const PORT = Number(process.env.PORT || 8787);

// -----------------------------------------------------------------------------
// Static hosting config
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve client from ../public
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Allow importing engine modules from the server via /engine/*
// (useful while prototyping; later you might bundle these for the browser)
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

// -----------------------------------------------------------------------------
// Rooms + client registry
// -----------------------------------------------------------------------------

/**
 * rooms: roomId -> room
 *
 * room = {
 *   clients: Set<ws>,                     // everyone connected to the room
 *   seats: Array<null | {ws,clientId,name}>, // exactly 4 slots; null means empty seat
 *   state: any,                           // authoritative engine state
 *   version: number                       // increments on every accepted action
 * }
 */
const rooms = new Map();

/**
 * clientInfo: ws -> {
 *   clientId: number,
 *   name: string,
 *   roomId: string|null,
 *   playerIndex: number|null              // 0..3 if seated, otherwise null spectator
 * }
 */
const clientInfo = new Map();

let nextClientId = 1;

// -----------------------------------------------------------------------------
// Room helpers
// -----------------------------------------------------------------------------

/**
 * Create a room on-demand.
 * For now, all rooms are 4 players.
 */
function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      clients: new Set(),
      // IMPORTANT: seats are either null OR an object { ws, clientId, name }
      seats: Array(4).fill(null),
      state: initialState(2),
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

/**
 * Broadcast the authoritative state snapshot to everyone in the room.
 * This is the simplest (and safest) multiplayer sync model.
 */
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

/**
 * Build a seat-aware roster. Safe when seats are null.
 * This is broadcast to all room clients after JOIN/LEAVE.
 */
function roomRoster(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];

  return room.seats.map((s, i) => ({
    seat: i,
    clientId: s?.clientId ?? null,
    name: s?.name ?? null,
    occupied: !!s,
  }));
}

/**
 * Assigns the ws to a seat if there is room.
 * Returns:
 *   - number 0..3  if seated
 *   - null         if room is full (spectator)
 */
function assignSeat(room, ws) {
  // already seated?
  const existing = room.seats.findIndex(s => s?.ws === ws);
  if (existing !== -1) return existing;

  // first open seat
  const idx = room.seats.findIndex(s => s === null);
  if (idx === -1) return null; // spectator

  const info = clientInfo.get(ws);
  room.seats[idx] = { ws, clientId: info.clientId, name: info.name };
  return idx;
}

/**
 * Removes a client from their current room (if any) and frees their seat.
 * Also broadcasts updated roster and deletes empty rooms.
 */
function leaveRoom(ws) {
  const info = clientInfo.get(ws);
  if (!info?.roomId) return;

  const roomId = info.roomId;
  const room = rooms.get(roomId);

  if (room) {
    // Remove from room client set
    room.clients.delete(ws);

    // Free their seat (if seated)
    const seat = room.seats.findIndex(s => s?.ws === ws);
    if (seat !== -1) room.seats[seat] = null;

    // Notify others about roster change
    broadcastToRoom(roomId, {
      type: "ROOM",
      roomId,
      clients: roomRoster(roomId),
    });

    // Cleanup empty room
    if (room.clients.size === 0) rooms.delete(roomId);
  }

  // Clear clientInfo linkage
  info.roomId = null;
  info.playerIndex = null;
}

/**
 * Adds client to room, assigns a seat if available, then sends:
 *   - WELCOME (joiner only)
 *   - ROOM roster (broadcast)
 *   - STATE snapshot (joiner only)
 */
function joinRoom(ws, roomId, name) {
  // Leave previous room if any
  leaveRoom(ws);

  const info = clientInfo.get(ws);
  info.roomId = roomId;

  // Update displayed name if provided
  if (typeof name === "string" && name.trim()) info.name = name.trim();

  const room = getRoom(roomId);
  room.clients.add(ws);

  // Seat assignment happens once, using the seat object representation
  const seatIndex = assignSeat(room, ws);
  info.playerIndex = seatIndex; // number 0..3 OR null

  // If seated, bind the human name into the authoritative engine state
  // so state.players[seatIndex].name matches the roster.
  if (typeof seatIndex === "number") {
    const p = room.state?.players?.[seatIndex];
    if (p) p.name = info.name;
  }

  broadcastState(roomId);

  // WELCOME: tells the client who they are and what seat they got
  safeSend(ws, {
    type: "WELCOME",
    roomId,
    clientId: info.clientId,
    playerIndex: seatIndex,
  });

  // Broadcast roster to everyone (including the joiner)
  broadcastToRoom(roomId, {
    type: "ROOM",
    roomId,
    clients: roomRoster(roomId),
  });

  // Send authoritative snapshot to the joiner
  safeSend(ws, {
    type: "STATE",
    roomId,
    version: room.version,
    state: room.state,
  });
}

// -----------------------------------------------------------------------------
// HTTP server (health + static hosting)
// -----------------------------------------------------------------------------

/**
 * Very small static server (no Express).
 * - /health returns ok
 * - / serves index.html from PUBLIC_DIR
 * - /engine/* maps to ENGINE_DIR
 */
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

// -----------------------------------------------------------------------------
// WebSocket server
// -----------------------------------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  // Assign a server-side clientId for debugging / roster.
  // (This is separate from playerIndex/seat.)
  const clientId = nextClientId++;
  clientInfo.set(ws, {
    clientId,
    name: `guest-${clientId}`,
    roomId: null,
    playerIndex: null,
  });

  console.log(`connected clientId=${clientId} from ${req.socket.remoteAddress}`);

  ws.on("message", (buf) => {
    // Parse JSON
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      safeSend(ws, { type: "ERROR", message: "Invalid JSON" });
      return;
    }

    const info = clientInfo.get(ws);

    // -------------------------
    // JOIN
    // -------------------------
    if (msg.type === "JOIN") {
      const roomId = String(msg.roomId || "").trim();
      if (!roomId) {
        safeSend(ws, { type: "ERROR", message: "JOIN requires roomId" });
        return;
      }
      joinRoom(ws, roomId, msg.name);
      return;
    }

    // -------------------------
    // ACTION (authoritative game action)
    // -------------------------
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

      // -------------------------
      // Increment 2: seat + turn enforcement
      // -------------------------
      const actorIndex = info.playerIndex;

      // Spectators cannot act
      if (typeof actorIndex !== "number") {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "SPECTATOR_CANNOT_ACT" });
        safeSend(ws, { type: "STATE", roomId: info.roomId, version: room.version, state: room.state });
        return;
      }

      // Only active player can act
      const active = room.state?.activePlayerIndex ?? 0;
      if (actorIndex !== active) {
        safeSend(ws, {
          type: "REJECTED",
          roomId: info.roomId,
          reason: "NOT_YOUR_TURN",
          activePlayerIndex: active,
          yourPlayerIndex: actorIndex,
        });
        safeSend(ws, { type: "STATE", roomId: info.roomId, version: room.version, state: room.state });
        return;
      }

      // Apply reducer (pure function is ideal; your reducer uses "return prev" as invalid/no-op)
      const prev = room.state;
      const next = applyAction(prev, msg.action);

      // Convention: if reducer returns same state reference, treat as invalid/no-op
      if (next === prev) {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "INVALID_ACTION" });
        safeSend(ws, { type: "STATE", roomId: info.roomId, version: room.version, state: room.state });
        return;
      }

      room.state = next;
      room.version += 1;

      broadcastState(info.roomId);
      return;
    }

    // -------------------------
    // RESET_GAME (temporary debug)
    // -------------------------
    if (msg.type === "RESET_GAME") {
      // Keep this as ERROR if you want it visible during debug; later change to INFO/LOG.
      safeSend(ws, { type: "ERROR", message: "RESET REQUEST RECEIVED BY SERVER" });

      if (!info.roomId) {
        safeSend(ws, { type: "ERROR", message: "You must JOIN a room first" });
        return;
      }

      const room = rooms.get(info.roomId);
      if (!room) return;

      // enforce seat + turn (same as ACTION)
      const actorIndex = info.playerIndex;
      if (typeof actorIndex !== "number") {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "SPECTATOR_CANNOT_ACT" });
        safeSend(ws, { type: "STATE", roomId: info.roomId, version: room.version, state: room.state });
        return;
      }
      const active = room.state?.activePlayerIndex ?? 0;
      if (actorIndex !== active) {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "NOT_YOUR_TURN" });
        safeSend(ws, { type: "STATE", roomId: info.roomId, version: room.version, state: room.state });
        return;
      }

      room.state = initialState(2);
      room.version = 0;

      broadcastState(info.roomId);
      return;
    }

    // -------------------------
    // SAY (optional chat/debug broadcast)
    // -------------------------
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

    // Unknown message type
    safeSend(ws, { type: "ERROR", message: `Unknown type: ${msg.type}` });
  });

  ws.on("close", () => {
    const info = clientInfo.get(ws);
    leaveRoom(ws);
    clientInfo.delete(ws);
    console.log(`disconnected clientId=${info?.clientId ?? "?"}`);
  });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`HTTP  : http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`WS    : ws://localhost:${PORT}`);
  console.log(`Static: ${PUBLIC_DIR}`);
});
