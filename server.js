// server.js
// Minimal WebSocket server with "rooms" (multiple game instances) + authoritative state
// - No Express
// - One dependency: ws
// - ES Modules (requires package.json: { "type": "module" })
//
// Protocol (JSON messages):
//   Client -> { type:"JOIN", roomId:"abc", name?:"Sam" }
//   Client -> { type:"SAY",  text:"hi" }                 // demo broadcast
//   Client -> { type:"ACTION", action:{ type:"TAKE_TOKENS", ... } }
//   Server -> { type:"WELCOME", roomId, clientId }
//   Server -> { type:"ROOM", roomId, clients:[{clientId,name}] }
//   Server -> { type:"MSG", from, text }
//   Server -> { type:"STATE", roomId, version, state }
//   Server -> { type:"REJECTED", roomId, reason }

//    FROM COMMAND LINE START SERVER WITH "node server.js"

import http from "http";
import { WebSocketServer } from "ws";

import { initialState } from "./engine/state.js";
import { applyAction } from "./engine/reducer.js";

const PORT = Number(process.env.PORT || 8787);

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
      state: initialState(3), // default players for now; can be configurable later
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
// HTTP server (optional health + info)
// -------------------------

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Trevdor WS server running");
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
});
