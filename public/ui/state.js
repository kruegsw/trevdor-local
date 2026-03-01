import { createCamera } from "./camera.js";

export function createUIState() {
  return {
    pointer: {
      x: 0,
      y: 0,
      isDown: false,
      pointerId: null,
    },

    hovered: null,   // hitRegion | null
    pressed: null,   // hitRegion | null

    // camera for pan/zoom
    camera: createCamera(),

    gesture: {
      pointers: new Map(), // pointerId -> {x,y}
      mode: null,          // "pan" | "pinch" | null
      startDist: 0,
      startScale: 1,
      startMid: { x: 0, y: 0 },
      lastMid: { x: 0, y: 0 },
      last: { x: 0, y: 0 },
      wasGesture: false,   // used to suppress accidental clicks after pinch/pan
    },

    // UI-only selections (never sent to reducer/server)
    pending: {
      tokens: { /*white: 0, blue: 0, green: 0, red: 0, black: 0, yellow: 0*/ },
      card: null
    },

    // Future-proofing:
    mode: "idle", // "idle" | "takeTokens" | "buyCard" | etc,

    playerPanelPlayerIndex: 0,
    myPlayerIndex: null,
    myName: null,
    isSpectator: false,

    // Multiplayer identity
    myClientId: null,

    // Optional
    roomClients: null,

    remoteCursors: {},  // { [clientId]: { x, y, ts, color, name } }
    showCursors: true,

    isHovered: null,
    roomList: [],
    connectedUsers: [],

    // Set to true when the user manually pans/pinches, so resize
    // auto-zoom doesn't override their preference.
    cameraUserAdjusted: false,

    // Simplified view: locks camera and disables drag scrolling
    simplifiedView: false,

    // Granny mode: enlarges gem pips on cards for readability
    grannyMode: false,
  };
}
