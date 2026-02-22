/*
  trevdor.js
  -----------
  Main entry point for the game.
  Responsibility:
    - create game state
    - create UI state
    - wire renderer, events, controller
    - handle resize + redraw
*/

import { render } from "./ui/render.js";
// import { initialState } from "../engine/state.js"; // (optional) keep for offline mode later
import { createUIEvents } from "./ui/events.js";
import { createUIState } from "./ui/state.js";
import { createUIController } from "./ui/controller.js";
import { createTransport } from "./net/transport.js";

/* ---------------------------------------------------------
   Game + UI state
   --------------------------------------------------------- */

// Authoritative state arrives from server
let state = null;

const uiState = createUIState();

/* ---------------------------------------------------------
   Lobby
   --------------------------------------------------------- */

function showLobby() {
  setScene("join");
}

const lobbyScene = document.getElementById("lobbyScene");
const joinSection = document.getElementById("joinSection");
const waitingSection = document.getElementById("waitingSection");
const enterGameBtn = document.getElementById("enterGameBtn");
const statusBar = document.getElementById("statusBar");

function setScene(scene) {
  if (scene === "join") {
    lobbyScene.classList.remove("hidden");
    joinSection.classList.remove("hidden");
    waitingSection.classList.add("hidden");
    statusBar.classList.add("hidden");
  } else if (scene === "waiting") {
    lobbyScene.classList.remove("hidden");
    joinSection.classList.add("hidden");
    waitingSection.classList.remove("hidden");
    statusBar.classList.add("hidden");
  } else if (scene === "game") {
    lobbyScene.classList.add("hidden");
    statusBar.classList.remove("hidden");
  }
}

enterGameBtn.addEventListener("click", () => {
  console.log("clicked enterGameBtn button");
  const currentName = cleanName(nameInput.value);
  uiState.myName = currentName;
  transport.setName(currentName);
  setScene("waiting");
  transport.connect();
})

document.getElementById("readyBtn").addEventListener("click", () => {
  transport.sendRaw({ type: "READY", roomId: ROOM_ID });
});

setScene("join");

const nameInput = document.getElementById("nameInput");
const nameHint = document.getElementById("nameHint");

// Load saved name
const savedName = localStorage.getItem("trevdor.name") || "";
nameInput.value = savedName;

function cleanName(s) {
  return (s ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function setNameHint() {
  let n = cleanName(nameInput.value);
  nameHint.textContent = n ? `Playing as: ${n}` : "Enter a name to be shown to other players.";
}

setNameHint();

// Save as they type
nameInput.addEventListener("input", () => {
  let n = cleanName(nameInput.value);
  localStorage.setItem("trevdor.name", n);
  setNameHint();
});

/* ---------------------------------------------------------
   Canvas + renderer
   --------------------------------------------------------- */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
// ctx.imageSmoothingEnabled = false; // enable later for pixel art

const renderer = render(ctx);

/* ---------------------------------------------------------
   Status bar
   --------------------------------------------------------- */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function seatFill(slot) {
  if (!slot?.occupied) return '#444';
  if (!slot.wsOpen) return '#e53935';
  const age = slot.lastActivity ? (Date.now() - slot.lastActivity) : 0;
  return age > 60000 ? '#ffd700' : '#4caf50';
}

function playerPrestige(playerIndex) {
  const player = state?.players?.[playerIndex];
  if (!player) return null;
  const fromCards  = player.cards.reduce((sum, c) => sum + (c.points ?? 0), 0);
  const fromNobles = player.nobles.reduce((sum, n) => sum + (n.points ?? 0), 0);
  return fromCards + fromNobles;
}

function playerTotalGems(playerIndex) {
  const player = state?.players?.[playerIndex];
  if (!player) return null;
  return player.cards.filter(c => c.bonus).length;
}

function playerTotalTokens(playerIndex) {
  const player = state?.players?.[playerIndex];
  if (!player) return null;
  return Object.values(player.tokens ?? {}).reduce((s, n) => s + n, 0);
}

function updateStatusBar() {
  const clients = uiState.room?.clients ?? [];
  const myIdx = uiState.myPlayerIndex;
  const activeIdx = state?.activePlayerIndex ?? null;
  const turn = state?.turn ?? null;

  // Ensure we always show 4 seat slots
  const slots = Array(4).fill(null).map((_, i) => {
    return clients.find(c => c.seat === i) ?? { seat: i, name: null, occupied: false };
  });

  let html = `<div class="statusRoom">${escapeHtml(ROOM_ID)}</div>`;

  for (const slot of slots) {
    // Once the game is running, don't show slots that were never filled
    if (state !== null && !slot.occupied) continue;

    const isMe = typeof myIdx === "number" && slot.seat === myIdx;
    const isActive = typeof activeIdx === "number" && slot.seat === activeIdx;
    const prestige = slot.occupied ? playerPrestige(slot.seat) : null;
    const classes = [
      "statusSeat",
      slot.occupied ? "isOccupied" : "",
      isActive      ? "isActive"   : "",
    ].filter(Boolean).join(" ");

    const gems   = slot.occupied ? playerTotalGems(slot.seat)   : null;
    const tokens = slot.occupied ? playerTotalTokens(slot.seat) : null;

    html += `<div class="${classes}">`;
    html += `<span class="playerDot${isActive ? ' isActive' : ''}" style="--dot-fill:${seatFill(slot)}"></span>`;
    if (slot.occupied) {
      html += `<span>${escapeHtml(slot.name ?? `Player ${slot.seat + 1}`)}</span>`;
      if (prestige !== null) html += `<span class="statusPoints">${prestige}pt</span>`;
      if (gems   !== null)   html += `<span class="statusGem">${gems}</span>`;
      if (tokens !== null)   html += `<span class="statusToken">${tokens}</span>`;
      if (isMe)              html += `<span class="statusYou">(you)</span>`;
    } else {
      html += `<span class="statusEmpty">open</span>`;
    }
    html += `</div>`;
  }

  if (turn !== null) {
    html += `<div class="statusTurn">Turn ${turn}</div>`;
  }

  statusBar.innerHTML = html;
}

/* ---------------------------------------------------------
   Waiting room UI
   --------------------------------------------------------- */

function updateWaitingRoom() {
  const clients = uiState.room?.clients ?? [];
  const ready = uiState.room?.ready ?? [false, false, false, false];
  const myIdx = uiState.myPlayerIndex;

  const slots = Array(4).fill(null).map((_, i) => {
    const c = clients.find(c => c.seat === i);
    return {
      seat: i,
      name: c?.name ?? null,
      occupied: c?.occupied ?? false,
      wsOpen: c?.wsOpen ?? false,
      lastActivity: c?.lastActivity ?? null,
    };
  });

  const rosterEl = document.getElementById("waitingRoster");
  rosterEl.innerHTML = slots.map(slot => {
    if (!slot.occupied) {
      return `<div class="rosterSlot isEmpty"><span class="playerDot" style="--dot-fill:#444"></span>Open</div>`;
    }
    const isMe = typeof myIdx === "number" && slot.seat === myIdx;
    const isReady = ready[slot.seat];
    return `<div class="rosterSlot${isMe ? " isMe" : ""}">` +
      `<span class="playerDot" style="--dot-fill:${seatFill(slot)}"></span>` +
      `<span>${escapeHtml(slot.name ?? `Player ${slot.seat + 1}`)}</span>` +
      (isReady ? `<span class="readyCheck">✓</span>` : "") +
      (isMe ? ` <span class="youLabel">(you)</span>` : "") +
      `</div>`;
  }).join("");

  const occupiedSlots = slots.filter(s => s.occupied);
  const readyCount = occupiedSlots.filter(s => ready[s.seat]).length;
  const totalCount = occupiedSlots.length;

  const statusEl = document.getElementById("waitingStatus");
  if (totalCount < 2) {
    statusEl.textContent = "Waiting for more players… (need at least 2)";
  } else {
    statusEl.textContent = `${readyCount} / ${totalCount} ready`;
  }

  const readyBtn = document.getElementById("readyBtn");
  if (readyBtn) {
    const amReady = typeof myIdx === "number" && ready[myIdx];
    readyBtn.textContent = amReady ? "Not Ready" : "Ready";
  }
}

/* ---------------------------------------------------------
   Draw helper (single source of truth)
   --------------------------------------------------------- */

function draw() {
  if (!state) return; // don't render until we have state
  renderer.draw(state, uiState);
}

// Track whether we have sized the canvas at least once
let didInitialResize = false;

/* ---------------------------------------------------------
   WebSocket connection
   --------------------------------------------------------- */

const ROOM_ID = "room1";
const PLAYER_NAME = savedName;
const STORED_SESSION_ID = localStorage.getItem("trevdor.sessionId") || null;

// Prefer this when client is served from the same host as server:
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

// Local dev:
// const WS_URL = "ws://localhost:8787";  //  this is no longer necessary since static files are served by the server
// Remote example:
// const WS_URL = "ws://charlization.com:8787"; // if server is running but need to point client to server, no necessary if server is also sending client

const transport = createTransport({
  url: WS_URL,
  roomId: ROOM_ID,
  name: PLAYER_NAME,
  sessionId: STORED_SESSION_ID,

  onMessage: (msg) => {
    console.log("[server]", msg);

    if (msg.type === "WELCOME" && msg.roomId === ROOM_ID) {
      uiState.mySeatIndex = msg.playerIndex;   // 0..3 or null
      uiState.myPlayerIndex = msg.playerIndex; // null until START, then 0..N-1
      uiState.playerPanelPlayerIndex = uiState.myPlayerIndex; // default player panel to show current player's data

      // Persist session token so we can reclaim our seat on reconnect
      if (msg.sessionId) {
        localStorage.setItem("trevdor.sessionId", msg.sessionId);
        transport.setSessionId(msg.sessionId);
      }

      console.log("WELCOME parsed:", uiState.mySeatIndex, uiState.myPlayerIndex);
      updateStatusBar();
      draw();
      return;
    }

    if (msg.type === "ROOM" && msg.roomId === ROOM_ID) {
      uiState.room = {
        started: !!msg.started,
        ready: msg.ready ?? [false,false,false,false],
        clients: msg.clients ?? [],
        playerCount: msg.playerCount ?? null,
      };
      if (!msg.started) {
        state = null;
        setScene("waiting");
      }
      updateStatusBar();
      updateWaitingRoom();
      draw();
      return;
    }

    if (msg.type === "STATE" && msg.roomId === ROOM_ID) {
      state = msg.state;
      if (state !== null) setScene("game");
      updateStatusBar();
      if (!didInitialResize) resize();
      else draw();
      return;
    }

    // 4) If server rejects moves, it’s useful to log clearly
    if (msg.type === "REJECTED") {
      console.warn("[server rejected]", msg.reason, msg);
    }
  },

  onOpen: () => {
    console.log("[ws] open");
    // send test message only after socket is open
    transport.send("SAY", { text: "hello from trevdor client" });
  },

  onClose: () => console.log("[ws] close"),
  onError: (e) => console.log("[ws] error", e),
});

function dispatchGameAction(gameAction) {
  console.log(gameAction)

  /////////// TEMPORARY MANUAL RESET BUTTON FOR TO RESET SERVER GAME STATE from CLIENT ////////////
  if (gameAction.type == "RESET_GAME") {
    console.log("gameAction.type = RESET_GAME");
    setScene("waiting");
    transport.sendRaw({
      type: "RESET_GAME",
      roomId: ROOM_ID,
      action: null,
    });
  /////////// TEMPORARY MANUAL RESET BUTTON FOR TO RESET SERVER GAME STATE from CLIENT ////////////
  } else {
    transport.sendRaw({
    type: "ACTION",
    roomId: ROOM_ID,
    action: gameAction,
  });
  }
}

/* ---------------------------------------------------------
   UI events + controller
   --------------------------------------------------------- */

const ui = createUIEvents({
  canvas,
  renderer,
  uiState,
  enableHover: true,
  requireSameTargetForClick: false,
});

const controller = createUIController({
  getState: () => state,
  uiState,
  requestDraw: draw,
  dispatchGameAction,
});

// Wire controller into event system
ui.setHandlers({
  onAction: controller.onUIAction,
  onUIChange: controller.onUIChange,
});

/* ---------------------------------------------------------
   Resize handling
   --------------------------------------------------------- */

function resize() {
  didInitialResize = true;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  // REMOVED for scrolling on mobile:  removed ctx.setTransform(...) from here
  renderer.resize({ width: rect.width, height: rect.height, dpr }, uiState);

  draw();
}


window.addEventListener("load", resize);
window.addEventListener("resize", resize);

// Reports client activity to the server via a throttled PING.
// Two-speed throttle: immediate if the client was idle (>60s since last ping)
// so the idle→active dot transition feels instant; otherwise throttled to 15s
// to avoid spamming the server during normal active play.
const IDLE_THRESHOLD = 60_000;
const PING_INTERVAL  = 15_000;
let lastPingSent = 0;
function reportActivity() {
  if (!uiState.room) return;
  const now = Date.now();
  const elapsed = now - lastPingSent;
  const throttle = elapsed > IDLE_THRESHOLD ? 0 : PING_INTERVAL;
  if (elapsed > throttle) {
    lastPingSent = now;
    transport.sendRaw({ type: "PING", roomId: ROOM_ID });
  }
}
document.addEventListener("mousemove", reportActivity);
document.addEventListener("click", reportActivity);
document.addEventListener("touchstart", reportActivity);

// Periodically re-render dots so the idle (>1 min) color transition
// fires without needing a new server event.
setInterval(() => {
  updateStatusBar();
  updateWaitingRoom();
}, 15_000);
