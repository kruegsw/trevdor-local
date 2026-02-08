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
   Canvas + renderer
   --------------------------------------------------------- */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
// ctx.imageSmoothingEnabled = false; // enable later for pixel art

const renderer = render(ctx);

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
const PLAYER_NAME = "playerA";

// Prefer this when client is served from the same host as server:
// const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

// Local dev:
const WS_URL = "ws://localhost:8787";
// Remote example:
// const WS_URL = "ws://charlization.com:8787";

const transport = createTransport({
  url: WS_URL,
  roomId: ROOM_ID,
  name: PLAYER_NAME,

  onMessage: (msg) => {
    console.log("[server]", msg); // temporary

    if (msg.type === "STATE" && msg.roomId === ROOM_ID) {
      state = msg.state;

      // If the server state arrives before the initial load/resize event,
      // force a resize once so layout is computed, then draw.
      if (!didInitialResize) resize();
      else draw();
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
  transport.sendRaw({
    type: "ACTION",
    roomId: ROOM_ID,
    action: gameAction,
  });
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

  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  // Draw in CSS pixels, scaled for DPR
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  // Pass state only if it exists; renderer.resize should be able to compute layout regardless
  renderer.resize({ width: rect.width, height: rect.height }, state || undefined);

  draw(); // no-op until state is ready
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);
