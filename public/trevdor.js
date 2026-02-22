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
  setScene("lobby");
}

const lobbyScene = document.getElementById("lobbyScene");
const enterGameBtn = document.getElementById("enterGameBtn");
const statusBar = document.getElementById("statusBar");

function setScene(scene) {
  if (scene === "lobby") {
    lobbyScene.classList.remove("hidden");
    statusBar.classList.add("hidden");
  } else if (scene === "game") {
    lobbyScene.classList.add("hidden");
    statusBar.classList.remove("hidden");
  }
}

enterGameBtn.addEventListener("click", () => {
  console.log("clicked enterGameBtn button");
  uiState.myName = savedName;
  transport.connect();
  setScene("game");
})

setScene("lobby");

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

function updateStatusBar() {
  const clients = uiState.room?.clients ?? [];
  const myIdx = uiState.myPlayerIndex;
  const activeIdx = state?.activePlayerIndex ?? null;
  const turn = state?.turn ?? null;

  // Ensure we always show 4 seat slots
  const slots = Array(4).fill(null).map((_, i) => {
    return clients.find(c => c.seat === i) ?? { seat: i, name: null, occupied: false };
  });

  let html = "";
  for (const slot of slots) {
    const isMe = typeof myIdx === "number" && slot.seat === myIdx;
    const isActive = typeof activeIdx === "number" && slot.seat === activeIdx;
    const classes = [
      "statusSeat",
      slot.occupied ? "isOccupied" : "",
      isActive      ? "isActive"   : "",
    ].filter(Boolean).join(" ");

    html += `<div class="${classes}">`;
    html += `<span class="statusDot"></span>`;
    if (slot.occupied) {
      html += `<span>${escapeHtml(slot.name ?? `Player ${slot.seat + 1}`)}</span>`;
      if (isMe) html += ` <span class="statusYou">(you)</span>`;
    } else {
      html += `<span class="statusEmpty">empty</span>`;
    }
    html += `</div>`;
  }

  if (turn !== null) {
    html += `<div class="statusTurn">Turn ${turn}</div>`;
  }

  statusBar.innerHTML = html;
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
      updateStatusBar();
      draw();
      return;
    }

    if (msg.type === "STATE" && msg.roomId === ROOM_ID) {
      state = msg.state;
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
    showLobby();
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
