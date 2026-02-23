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
const DEBUG = process.env.DEBUG === "1";

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

// sessions: sessionId -> { roomId, seatIndex, name }
// Persists across reconnects so players reclaim their seat.
const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit O/0/I/1 to avoid confusion
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

let nextClientId = 1;

// -----------------------------------------------------------------------------
// Room helpers
// -----------------------------------------------------------------------------

/**
 * Create a room on-demand.
 * For now, all rooms are 4 players.
 */
function getRoom(roomId, metadata = {}) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      clients: new Set(),
      seats: Array(4).fill(null),
      state: null,
      version: 0,
      ready: [false, false, false, false],
      started: false,
      name: metadata.name ?? roomId,
      createdBy: metadata.createdBy ?? null,
      createdAt: metadata.createdAt ?? Date.now(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

function createRoom({ creatorClientId, roomName }) {
  let roomId;
  do { roomId = generateRoomId(); } while (rooms.has(roomId));
  getRoom(roomId, { name: roomName, createdBy: creatorClientId, createdAt: Date.now() });
  return roomId;
}

function roomListSnapshot() {
  const list = [];
  for (const [roomId, room] of rooms) {
    const playerCount = room.seats.filter(s => s !== null).length;
    let spectatorCount = 0;
    for (const ws of room.clients) {
      const info = clientInfo.get(ws);
      if (info && info.playerIndex === null) spectatorCount++;
    }
    list.push({ roomId, name: room.name, playerCount, spectatorCount, started: room.started });
  }
  return list;
}

function connectedUsersSnapshot() {
  const list = [];
  for (const [ws, info] of clientInfo) {
    let location = "Lobby";
    if (info.roomId) {
      const room = rooms.get(info.roomId);
      location = room?.name ?? info.roomId;
    }
    list.push({
      clientId: info.clientId,
      name: info.name,
      location,
      lastActivity: info.lastActivity ?? null,
      wsOpen: ws.readyState === 1,
    });
  }
  return list;
}

function broadcastRoomList() {
  const snapshot = roomListSnapshot();
  const users = connectedUsersSnapshot();
  for (const [ws, info] of clientInfo) {
    if (info.roomId === null) safeSend(ws, { type: "ROOM_LIST", rooms: snapshot, users });
  }
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
  if (!room || !room.state) return;

  broadcastToRoom(roomId, {
    type: "STATE",
    roomId,
    version: room.version,
    state: room.state,
  });
}

/**
 * Broadcast the current ROOM message (roster + ready + started) to all room clients.
 */
function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  broadcastToRoom(roomId, {
    type: "ROOM",
    roomId,
    clients:    roomRoster(roomId),
    spectators: roomSpectators(roomId),
    ready:      room.ready,
    started:    room.started,
    name:       room.name,
    host:       room.createdBy,
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
    wsOpen: s ? (s.ws?.readyState === 1) : false,
    lastActivity: s ? (clientInfo.get(s.ws)?.lastActivity ?? null) : null,
  }));
}

/**
 * Returns the list of spectators (connected clients with no seat).
 */
function roomSpectators(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const result = [];
  for (const ws of room.clients) {
    const info = clientInfo.get(ws);
    if (info && info.playerIndex === null) {
      result.push({
        clientId: info.clientId,
        name: info.name,
        wsOpen: ws.readyState === 1,
      });
    }
  }
  return result;
}

/**
 * Assigns the ws to a seat if there is room.
 * Returns:
 *   - number 0..3  if seated
 *   - null         if room is full (spectator)
 */
function assignSeat(room, ws, stringRoomId) {
  // already seated?
  const existing = room.seats.findIndex(s => s?.ws === ws);
  if (existing !== -1) return existing;

  const info = clientInfo.get(ws);

  // try to restore saved seat from session
  if (info.sessionId) {
    const session = sessions.get(info.sessionId);
    if (session && session.roomId === stringRoomId && typeof session.seatIndex === "number") {
      const saved = session.seatIndex;
      const occupant = room.seats[saved];
      const occupantInfo = occupant ? clientInfo.get(occupant.ws) : null;
      // Reclaim if seat is empty, occupant ws already cleaned up, or occupant
      // is the same player reconnecting (same sessionId — stale ws from a
      // page refresh whose close event hasn't fired yet).
      if (occupant === null || !occupantInfo || occupantInfo.sessionId === info.sessionId) {
        // Clean up the stale ws if it's still lingering
        if (occupant && occupant.ws !== ws) {
          room.clients.delete(occupant.ws);
          if (occupantInfo) {
            occupantInfo.roomId = null;
            occupantInfo.playerIndex = null;
          }
        }
        room.seats[saved] = { ws, clientId: info.clientId, name: info.name };
        return saved;
      }
    }
  }

  // Once a game is in progress, don't seat new players — they become spectators.
  // Only the session-reclaim path above can restore a seat mid-game.
  if (room.started) return null;

  // first open seat (pre-game lobby only)
  const idx = room.seats.findIndex(s => s === null);
  if (idx === -1) return null; // spectator

  room.seats[idx] = { ws, clientId: info.clientId, name: info.name };
  return idx;
}

/**
 * During the pre-game lobby, pack all occupied seats toward index 0 so that
 * seat indices always form a contiguous range starting at 0. This ensures
 * initialState(N) and the seated playerIndex values stay in sync.
 * Updates clientInfo.playerIndex and session data for every moved player.
 * Resets all ready flags (composition changed, so everyone must re-ready).
 */
function compactSeats(room, roomId) {
  const occupied = room.seats
    .map((s, i) => s ? { seatObj: s, oldIndex: i } : null)
    .filter(Boolean);

  room.seats = Array(4).fill(null);
  room.ready = [false, false, false, false];

  occupied.forEach(({ seatObj }, newIndex) => {
    room.seats[newIndex] = seatObj;
    const info = clientInfo.get(seatObj.ws);
    if (info) {
      info.playerIndex = newIndex;
      if (info.sessionId) {
        const session = sessions.get(info.sessionId);
        if (session && session.roomId === roomId) session.seatIndex = newIndex;
      }
      // Tell the client their seat index changed
      safeSend(seatObj.ws, {
        type: "WELCOME",
        roomId,
        clientId: info.clientId,
        name: info.name,
        playerIndex: newIndex,
        sessionId: info.sessionId,
      });
    }
  });
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
    if (seat !== -1) {
      room.seats[seat] = null;
      room.ready[seat] = false;
    }

    // During pre-game lobby, compact remaining players to contiguous seats
    // so seat indices always match initialState(N) player indices.
    if (!room.started) {
      compactSeats(room, roomId);
    }

    // Notify others about roster change
    broadcastRoom(roomId);

    // Pre-game: close the room once it's completely empty.
    // Started rooms persist so disconnected players can reconnect via session reclaim.
    if (!room.started && room.clients.size === 0) {
      rooms.delete(roomId);
    }
  }

  // Clear clientInfo linkage
  info.roomId = null;
  info.playerIndex = null;

  // Update lobby browsers
  broadcastRoomList();
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
  const seatIndex = assignSeat(room, ws, roomId);
  info.playerIndex = seatIndex; // number 0..3 OR null

  // Persist session so this player can reclaim their seat on reconnect
  if (info.sessionId) {
    sessions.set(info.sessionId, { roomId, seatIndex, name: info.name });
  }

  // If seated and game is running, ensure this player's name is in state (reconnect case)
  if (typeof seatIndex === "number" && room.state?.players?.[seatIndex]) {
    room.state.players[seatIndex].name = info.name;
  }

  broadcastState(roomId);

  // WELCOME: tells the client who they are and what seat they got
  safeSend(ws, {
    type: "WELCOME",
    roomId,
    clientId: info.clientId,
    name: info.name,
    playerIndex: seatIndex,
    spectator: seatIndex === null,
    sessionId: info.sessionId,
  });

  // Broadcast roster to everyone (including the joiner)
  broadcastRoom(roomId);

  // Send authoritative snapshot to the joiner only if game is in progress
  if (room.state !== null) {
    safeSend(ws, {
      type: "STATE",
      roomId,
      version: room.version,
      state: room.state,
    });
  }

  // Update lobby browsers (player count changed)
  broadcastRoomList();
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
  if (DEBUG) console.log(`HTTP ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

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
      "Cache-Control": "no-cache",
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
    sessionId: null,
    lastActivity: Date.now(),
  });

  if (DEBUG) console.log(`connected clientId=${clientId} from ${req.socket.remoteAddress}`);

  // Immediately send room list so the game lobby can render without waiting
  safeSend(ws, { type: "ROOM_LIST", rooms: roomListSnapshot(), users: connectedUsersSnapshot(), yourClientId: clientId });

  // Notify existing lobby clients about the new connection
  broadcastRoomList();

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
    const prevActivity = info.lastActivity;
    info.lastActivity = Date.now();
    if (DEBUG) console.log("msg from", info.clientId, msg.type);

    // -------------------------
    // JOIN
    // -------------------------
    if (msg.type === "JOIN") {
      const roomId = String(msg.roomId || "").trim();
      if (!roomId) {
        safeSend(ws, { type: "ERROR", message: "JOIN requires roomId" });
        return;
      }

      // Reject joins to non-existent rooms — only CREATE_GAME creates rooms
      if (!rooms.has(roomId)) {
        safeSend(ws, { type: "ROOM_NOT_FOUND", roomId });
        safeSend(ws, { type: "ROOM_LIST", rooms: roomListSnapshot() });
        return;
      }

      // Restore or create session
      const info = clientInfo.get(ws);
      if (msg.sessionId && sessions.has(msg.sessionId)) {
        info.sessionId = msg.sessionId;
        const session = sessions.get(msg.sessionId);
        if (!msg.name && session.name) info.name = session.name;
      } else {
        info.sessionId = generateSessionId();
      }

      joinRoom(ws, roomId, msg.name);
      return;
    }

    // -------------------------
    // CREATE_GAME
    // -------------------------
    if (msg.type === "CREATE_GAME") {
      const info = clientInfo.get(ws);

      if (msg.sessionId && sessions.has(msg.sessionId)) {
        info.sessionId = msg.sessionId;
        const session = sessions.get(msg.sessionId);
        if (!msg.name && session.name) info.name = session.name;
      } else if (!info.sessionId) {
        info.sessionId = generateSessionId();
      }

      const name = typeof msg.name === "string" && msg.name.trim() ? msg.name.trim() : info.name;
      info.name = name;

      const roomId = createRoom({ creatorClientId: info.clientId, roomName: `${name}'s Game` });
      joinRoom(ws, roomId, name);
      // broadcastRoomList() called inside joinRoom()
      return;
    }

    // -------------------------
    // LEAVE_ROOM
    // -------------------------
    if (msg.type === "LEAVE_ROOM") {
      const info = clientInfo.get(ws);

      // Spectators: clear session roomId so they don't auto-rejoin
      if (info.playerIndex === null && info.sessionId) {
        const session = sessions.get(info.sessionId);
        if (session) { session.roomId = null; session.seatIndex = null; }
      }
      // Players: session preserved — they can reclaim their seat on return

      leaveRoom(ws);
      // leaveRoom() calls broadcastRoomList(); also send directly to this client
      safeSend(ws, { type: "ROOM_LIST", rooms: roomListSnapshot() });
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

      if (!room.started) {
        safeSend(ws, { type: "REJECTED", roomId: info.roomId, reason: "GAME_NOT_STARTED" });
        return;
      }

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
      if (actorIndex !== active && !room.state.hotSeat) {
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
    // READY (toggle ready state for sender's seat)
    // -------------------------
    if (msg.type === "READY") {
      if (!info.roomId) {
        safeSend(ws, { type: "ERROR", message: "You must JOIN a room first" });
        return;
      }

      const room = rooms.get(info.roomId);
      if (!room) return;

      const seat = info.playerIndex;
      if (typeof seat !== "number" || room.started) return;

      room.ready[seat] = !room.ready[seat]; // toggle

      // Check start condition: all occupied seats (min 2) must be ready
      const occupiedIndices = room.seats.map((s, i) => s ? i : null).filter(i => i !== null);
      const allReady = occupiedIndices.length >= 2 && occupiedIndices.every(i => room.ready[i]);

      if (allReady) {
        room.state = initialState(occupiedIndices.length, info.roomId);
        if (DEBUG) room.state.hotSeat = true;
        room.started = true;
        room.seats.forEach((seat, i) => {
          if (seat && room.state.players[i]) room.state.players[i].name = seat.name;
        });
      }

      broadcastRoom(info.roomId);
      if (room.started) {
        broadcastState(info.roomId);
        broadcastRoomList(); // lobby: room now shows started=true
      }
      return;
    }

    // -------------------------
    // RENAME_ROOM (host only, pre-game or mid-game)
    // -------------------------
    if (msg.type === "RENAME_ROOM") {
      if (!info.roomId) return;
      const room = rooms.get(info.roomId);
      if (!room || info.clientId !== room.createdBy) return;
      const newName = String(msg.name || "").trim().slice(0, 40);
      if (!newName) return;
      room.name = newName;
      broadcastRoom(info.roomId);
      broadcastRoomList();
      return;
    }

    // -------------------------
    // CLOSE_ROOM (host only)
    // -------------------------
    if (msg.type === "CLOSE_ROOM") {
      const closingRoomId = String(msg.roomId || "").trim();
      if (!closingRoomId) return;
      const room = rooms.get(closingRoomId);
      if (!room || info.clientId !== room.createdBy) return;
      for (const clientWs of room.clients) {
        const clientInf = clientInfo.get(clientWs);
        if (clientInf) {
          if (clientInf.sessionId) {
            const s = sessions.get(clientInf.sessionId);
            if (s) { s.roomId = null; s.seatIndex = null; }
          }
          clientInf.roomId = null;
          clientInf.playerIndex = null;
        }
        safeSend(clientWs, { type: "ROOM_NOT_FOUND", roomId: closingRoomId });
      }
      rooms.delete(closingRoomId);
      broadcastRoomList();
      return;
    }

    // -------------------------
    // IDENTIFY (set display name before joining a room)
    // -------------------------
    if (msg.type === "IDENTIFY") {
      const newName = typeof msg.name === "string" ? msg.name.trim().slice(0, 20) : "";
      if (newName) info.name = newName;
      broadcastRoomList();
      return;
    }

    // -------------------------
    // PING (client activity heartbeat — lastActivity already updated above)
    // -------------------------
    if (msg.type === "PING") {
      if (info.roomId) broadcastRoom(info.roomId);
      else broadcastRoomList(); // lobby user activity — refresh dots
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

  ws.on("close", (code, reason) => {
    const info = clientInfo.get(ws);
    if (DEBUG) console.log(`ws close code=${code} reason="${reason}" clientId=${info?.clientId ?? "?"}`);
    const roomId = info?.roomId;
    const room = roomId ? rooms.get(roomId) : null;

    // During an active game, preserve the seat for reconnect — just remove
    // from room.clients so broadcasts stop reaching the dead socket.
    if (room && room.started && typeof info?.playerIndex === "number") {
      room.clients.delete(ws);
      broadcastRoom(roomId);   // dot turns red for others
      info.roomId = null;
      info.playerIndex = null;
    } else {
      leaveRoom(ws);
    }

    clientInfo.delete(ws);
    broadcastRoomList(); // update lobby users list (disconnected user vanishes)
    if (DEBUG) console.log(`disconnected clientId=${info?.clientId ?? "?"}`);
  });
});

wss.on('close', () => {
  console.log('All connections closed. Server is shutting down.');
  // Perform additional reset logic here, such as restarting the server process
});

// -----------------------------------------------------------------------------
// Room TTL cleanup
// -----------------------------------------------------------------------------

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  let anyDeleted = false;
  for (const [roomId, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const ws of room.clients) {
        safeSend(ws, { type: "ROOM_NOT_FOUND", roomId });
        const inf = clientInfo.get(ws);
        if (inf) {
          if (inf.sessionId) {
            const s = sessions.get(inf.sessionId);
            if (s) { s.roomId = null; s.seatIndex = null; }
          }
          inf.roomId = null;
          inf.playerIndex = null;
        }
      }
      rooms.delete(roomId);
      anyDeleted = true;
    }
  }
  if (anyDeleted) broadcastRoomList();
}, 60 * 60 * 1000); // runs every hour

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`HTTP  : http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`WS    : ws://localhost:${PORT}`);
  console.log(`Static: ${PUBLIC_DIR}`);
});
