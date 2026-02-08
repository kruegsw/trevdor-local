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
import { initialState } from "./engine/state.js";
import { createUIEvents } from "./ui/events.js";
import { createUIState } from "./ui/state.js";
import { createUIController } from "./ui/controller.js";
import { createTransport } from "./net/transport.js";


/* ---------------------------------------------------------
   Game + UI state
   --------------------------------------------------------- */

const numberOfPlayers = 3;
let state = initialState(numberOfPlayers);
console.log(state);

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
  renderer.draw(state, uiState);
}


// web socket connection

const ROOM_ID = "room1";
const PLAYER_NAME = "playerA";
const WS_URL = "ws://localhost:8787";

const transport = createTransport({
  url: WS_URL,
  roomId: ROOM_ID,
  name: PLAYER_NAME,
  onMessage: (msg) => {
    if (msg.type === "STATE" && msg.roomId === ROOM_ID) {
      state = msg.state;
      draw();
    };
    console.log("[server]", msg); // temporary
  },
  onOpen: () => {
    console.log("[ws] open");
    transport.send("SAY", { text: "hello from trevdor client" });  // test for server
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
  dispatchGameAction
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
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  // Draw in CSS pixels, scaled for DPR
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  renderer.resize(
    { width: rect.width, height: rect.height },
    state
  );

  draw();
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);
