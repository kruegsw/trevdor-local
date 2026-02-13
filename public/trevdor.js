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
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

// Local dev:
// const WS_URL = "ws://localhost:8787";  //  this is no longer necessary since static files are served by the server
// Remote example:
// const WS_URL = "ws://charlization.com:8787"; // if server is running but need to point client to server, no necessary if server is also sending client

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

    if (msg.type === "WELCOME" && msg.roomId === ROOM_ID) {
      if (typeof msg.playerIndex === "number") {
        uiState.myPlayerIndex = msg.playerIndex;          // <-- store as number
        uiState.playerPanelPlayerIndex = msg.playerIndex; // <-- default panel = me
        console.log("Seated as playerIndex:", msg.playerIndex);
      } else {
        uiState.myPlayerIndex = null; // spectator
        console.log("Joined as spectator (no open seats)");
      }
    }

    if (msg.type === "REJECTED") {
      console.log("REJECTED:", msg.reason, msg);
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
    console.log("gameAction.type = RESET_GAME")
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

// store identity on uiState so handlers/rules can use it
uiState.myPlayerIndex = () => myPlayerIndex;

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
