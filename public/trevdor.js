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
import { createUIEvents } from "./ui/events.js";
import { createUIState } from "./ui/state.js";
import { createUIController } from "./ui/controller.js";
import { createTransport } from "./net/transport.js";

/* ---------------------------------------------------------
   Game + UI state
   --------------------------------------------------------- */

// Authoritative state arrives from server
let state = null;

// Active room (set from WELCOME, cleared on leave)
let currentRoomId = null;

// Set when a player leaves their in-progress game via the lobby button.
// Used to show "Resume" on the correct room list entry.
// Persisted in localStorage so the label survives page refresh.
let myPreviousRoomId = localStorage.getItem("trevdor.previousRoomId") || null;

// True when myPreviousRoomId belongs to a game this client created (host).
// Used to show "Close Game" next to "Resume" in the room list.
let myPreviousRoomIsHost = localStorage.getItem("trevdor.previousRoomIsHost") === "true";

// Snapshot of the last started game the player was in.
// Kept after returnToGameLobby() so the status bar can stay visible
// with a "Jump to Game" button while the player browses the lobby.
let snapRoomId = null;
let snapRoom   = null;   // uiState.room at time of departure
let snapState  = null;   // engine state at time of departure
let snapMyIdx  = null;   // myPlayerIndex at time of departure

// Current session ID (updated from WELCOME; used in CREATE_GAME)
let mySessionId = localStorage.getItem("trevdor.sessionId") || null;

const uiState = createUIState();

/* ---------------------------------------------------------
   DOM references
   --------------------------------------------------------- */

const lobbyScene       = document.getElementById("lobbyScene");
const gameLobbySection = document.getElementById("gameLobbySection");
const waitingSection   = document.getElementById("waitingSection");
const createGameBtn    = document.getElementById("createGameBtn");
const statusBar        = document.getElementById("statusBar");
const statusContent    = document.getElementById("statusContent");

/* ---------------------------------------------------------
   Scene management
   --------------------------------------------------------- */

function setScene(scene) {
  if (scene === "gameLobby") {
    lobbyScene.classList.remove("hidden");
    gameLobbySection.classList.remove("hidden");
    waitingSection.classList.add("hidden");
    createGameBtn.textContent = "Create Game";
    createGameBtn.disabled = false;
    // Keep status bar visible as a snapshot of the last game if one exists
    if (snapRoomId) {
      statusBar.classList.remove("hidden");
      lobbyScene.classList.add("withStatusBar");
      updateStatusBar(); // refresh label ("Jump to Game") and snap content immediately
    } else {
      statusBar.classList.add("hidden");
      lobbyScene.classList.remove("withStatusBar");
    }
  } else if (scene === "reconnecting") {
    lobbyScene.classList.remove("hidden");
    gameLobbySection.classList.remove("hidden");
    waitingSection.classList.add("hidden");
    lobbyScene.classList.remove("withStatusBar");
    statusBar.classList.add("hidden");
    createGameBtn.textContent = "Reconnecting…";
    createGameBtn.disabled = true;
  } else if (scene === "roomLobby") {
    lobbyScene.classList.remove("hidden");
    gameLobbySection.classList.add("hidden");
    waitingSection.classList.remove("hidden");
    lobbyScene.classList.remove("withStatusBar");
    statusBar.classList.add("hidden");
    createGameBtn.textContent = "Create Game";
    createGameBtn.disabled = false;
  } else if (scene === "game") {
    lobbyScene.classList.add("hidden");
    lobbyScene.classList.remove("withStatusBar");
    statusBar.classList.remove("hidden");
  }
}

function setPreviousRoom(roomId, isHost) {
  myPreviousRoomId = roomId;
  myPreviousRoomIsHost = isHost;
  if (roomId) {
    localStorage.setItem("trevdor.previousRoomId", roomId);
    localStorage.setItem("trevdor.previousRoomIsHost", String(isHost));
  } else {
    localStorage.removeItem("trevdor.previousRoomId");
    localStorage.removeItem("trevdor.previousRoomIsHost");
  }
}

function returnToGameLobby() {
  if (currentRoomId) {
    // Capture before clearing uiState — used by room list and status bar snap.
    const wasStartedPlayer = uiState.room?.started && !uiState.isSpectator;
    setPreviousRoom(
      wasStartedPlayer ? currentRoomId : null,
      wasStartedPlayer
        && uiState.myClientId !== null
        && uiState.room?.host === uiState.myClientId,
    );
    if (wasStartedPlayer) {
      snapRoomId = currentRoomId;
      snapRoom   = uiState.room;
      snapState  = state;
      snapMyIdx  = uiState.myPlayerIndex;
    } else {
      snapRoomId = null; snapRoom = null; snapState = null; snapMyIdx = null;
    }
    transport.sendRaw({ type: "LEAVE_ROOM", roomId: currentRoomId });
  }
  currentRoomId = null;
  state = null;
  uiState.room = null;
  uiState.myPlayerIndex = null;
  uiState.myClientId = null;
  uiState.isSpectator = false;
  transport.setRoomId(null);
  localStorage.removeItem("trevdor.roomId");
  setScene("gameLobby");
}

/* ---------------------------------------------------------
   Name input
   --------------------------------------------------------- */

const nameInput = document.getElementById("nameInput");
const nameHint  = document.getElementById("nameHint");

const savedName       = localStorage.getItem("trevdor.name")      || "";
const STORED_ROOM_ID  = localStorage.getItem("trevdor.roomId")    || null;

nameInput.value = savedName;

function cleanName(s) {
  return (s ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function setNameHint() {
  let n = cleanName(nameInput.value);
  nameHint.textContent = n ? `Playing as: ${n}` : "Enter a name to be shown to other players.";
}

setNameHint();

nameInput.addEventListener("input", () => {
  let n = cleanName(nameInput.value);
  localStorage.setItem("trevdor.name", n);
  setNameHint();
});

/* ---------------------------------------------------------
   Utility
   --------------------------------------------------------- */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------------------------------------------------
   Game lobby (room list)
   --------------------------------------------------------- */

function updateGameLobby() {
  const roomListEl = document.getElementById("roomList");
  if (!roomListEl) return;
  const rooms = uiState.roomList ?? [];
  if (rooms.length === 0) {
    roomListEl.innerHTML = '<div class="roomListEmpty">No active games — create one!</div>';
    return;
  }
  roomListEl.innerHTML = rooms.map(r => {
    const statusText = r.started ? "In Progress" : `${r.playerCount}/4`;
    const watchLabel = (r.roomId === myPreviousRoomId) ? "Resume"
                     : r.started                       ? "Watch"
                     :                                   "Join";
    const showCloseBtn = myPreviousRoomIsHost && r.roomId === myPreviousRoomId;
    return `<div class="roomEntry">` +
      `<div class="roomEntryName">${escapeHtml(r.name)}</div>` +
      `<div class="roomEntryMeta">${escapeHtml(statusText)}` +
      (r.spectatorCount ? ` · ${r.spectatorCount} watching` : ``) +
      `</div>` +
      `<button class="joinRoomBtn" data-room-id="${escapeHtml(r.roomId)}">${watchLabel}</button>` +
      (showCloseBtn ? `<button class="closeGameLobbyBtn" data-close-room-id="${escapeHtml(r.roomId)}">Close Game</button>` : ``) +
      `</div>`;
  }).join("");

  roomListEl.querySelectorAll(".joinRoomBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const roomId = btn.dataset.roomId;
      const currentName = cleanName(nameInput.value);
      if (!currentName) {
        nameHint.textContent = "Please enter your name first.";
        return;
      }
      uiState.myName = currentName;
      transport.setName(currentName);
      transport.joinRoom(roomId);
    });
  });

  roomListEl.querySelectorAll(".closeGameLobbyBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      transport.sendRaw({ type: "CLOSE_ROOM", roomId: btn.dataset.closeRoomId });
    });
  });
}

/* ---------------------------------------------------------
   Room lobby (waiting room)
   --------------------------------------------------------- */

function seatFill(slot) {
  if (!slot?.occupied) return '#444';
  if (!slot.wsOpen) return '#e53935';
  const age = slot.lastActivity ? (Date.now() - slot.lastActivity) : 0;
  return age > 60000 ? '#ffd700' : '#4caf50';
}

function updateWaitingRoom() {
  // Room name header — editable input for host, plain text for guests
  const headerEl = document.getElementById("roomLobbyHeader");
  if (headerEl) {
    const roomName = uiState.room?.name ?? currentRoomId ?? "";
    const isHost   = uiState.myClientId !== null
                  && uiState.room?.host === uiState.myClientId;
    const nameInputEl = document.getElementById("roomNameInput");
    // Don't clobber the input while the host is actively typing
    if (!nameInputEl || document.activeElement !== nameInputEl) {
      if (isHost) {
        headerEl.innerHTML =
          `<div class="roomLobbyNameRow">` +
          `<input id="roomNameInput" class="roomNameInput" value="${escapeHtml(roomName)}" maxlength="40" placeholder="Room name" />` +
          `</div>`;
        document.getElementById("roomNameInput").addEventListener("blur", (e) => {
          const newName = e.target.value.trim();
          if (newName && newName !== uiState.room?.name)
            transport.sendRaw({ type: "RENAME_ROOM", roomId: currentRoomId, name: newName });
        });
        document.getElementById("roomNameInput").addEventListener("keydown", (e) => {
          if (e.key === "Enter") e.target.blur();
        });
      } else {
        headerEl.innerHTML = `<div class="roomLobbyName">${escapeHtml(roomName)}</div>`;
      }
    }
  }

  // Show/hide the Close Room button at the bottom for host only
  const closeRoomBtnEl = document.getElementById("closeRoomBtn");
  if (closeRoomBtnEl) {
    const isHost = uiState.myClientId !== null && uiState.room?.host === uiState.myClientId;
    closeRoomBtnEl.classList.toggle("hidden", !isHost);
  }

  const clients = uiState.room?.clients ?? [];
  const ready   = uiState.room?.ready   ?? [false, false, false, false];
  const myIdx   = uiState.myPlayerIndex;

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
  rosterEl.innerHTML = slots.filter(s => s.occupied).map(slot => {
    const isMe    = typeof myIdx === "number" && slot.seat === myIdx;
    const isReady = ready[slot.seat];
    return `<div class="rosterSlot${isMe ? " isMe" : ""}">` +
      `<span class="playerDot" style="--dot-fill:${seatFill(slot)}"></span>` +
      `<span>${escapeHtml(slot.name)}</span>` +
      (isReady ? `<span class="readyCheck">✓</span>` : "") +
      (isMe ? ` <span class="youLabel">(you)</span>` : "") +
      `</div>`;
  }).join("");

  const occupiedSlots = slots.filter(s => s.occupied);
  const readyCount    = occupiedSlots.filter(s => ready[s.seat]).length;
  const totalCount    = occupiedSlots.length;

  const statusEl = document.getElementById("waitingStatus");
  if (totalCount < 2) {
    statusEl.textContent = "Waiting for more players… (need at least 2)";
  } else {
    statusEl.textContent = `${readyCount} / ${totalCount} ready`;
  }

  // Append spectators below the player roster
  const spectators = uiState.room?.spectators ?? [];
  if (spectators.length > 0) {
    rosterEl.innerHTML += spectators.map(spec => {
      const isMe = uiState.isSpectator && spec.clientId === uiState.myClientId;
      return `<div class="rosterSlot">` +
        `<span class="playerDot" style="--dot-fill:${spec.wsOpen ? '#4caf50' : '#e53935'}"></span>` +
        `<span>${escapeHtml(spec.name)}</span>` +
        ` <span class="youLabel">watching${isMe ? " (you)" : ""}</span>` +
        `</div>`;
    }).join("");
  }

  const readyBtn = document.getElementById("readyBtn");
  if (readyBtn) {
    const amReady = typeof myIdx === "number" && ready[myIdx];
    readyBtn.textContent = amReady ? "Not Ready" : "Ready";
    readyBtn.style.display = uiState.isSpectator ? "none" : "";
  }
}

/* ---------------------------------------------------------
   Status bar
   --------------------------------------------------------- */

function playerPrestige(playerIndex, fromState = state) {
  const player = fromState?.players?.[playerIndex];
  if (!player) return null;
  const fromCards  = player.cards.reduce((sum, c) => sum + (c.points ?? 0), 0);
  const fromNobles = player.nobles.reduce((sum, n) => sum + (n.points ?? 0), 0);
  return fromCards + fromNobles;
}

function playerTotalGems(playerIndex, fromState = state) {
  const player = fromState?.players?.[playerIndex];
  if (!player) return null;
  return player.cards.filter(c => c.bonus).length;
}

function playerTotalTokens(playerIndex, fromState = state) {
  const player = fromState?.players?.[playerIndex];
  if (!player) return null;
  return Object.values(player.tokens ?? {}).reduce((s, n) => s + n, 0);
}

function updateStatusBar() {
  // When browsing the game lobby after leaving a game, use the saved snapshot.
  const isSnap      = !currentRoomId && !!snapRoomId;
  const room        = isSnap ? snapRoom  : uiState.room;
  const effectState = isSnap ? snapState : state;
  const myIdx       = isSnap ? snapMyIdx : uiState.myPlayerIndex;
  const roomId      = isSnap ? snapRoomId : currentRoomId;

  const clients   = room?.clients ?? [];
  const activeIdx = effectState?.activePlayerIndex ?? null;
  const turn      = effectState?.turn ?? null;
  const roomName  = room?.name ?? roomId ?? "";

  // Ensure we always show 4 seat slots
  const slots = Array(4).fill(null).map((_, i) => {
    return clients.find(c => c.seat === i) ?? { seat: i, name: null, occupied: false };
  });

  let html = `<div class="statusRoom">${escapeHtml(roomName)}</div>`;

  for (const slot of slots) {
    // Once the game is running, don't show slots that were never filled
    if (effectState !== null && !slot.occupied) continue;

    const isMe     = typeof myIdx === "number" && slot.seat === myIdx;
    const isActive = typeof activeIdx === "number" && slot.seat === activeIdx;
    const prestige = slot.occupied ? playerPrestige(slot.seat, effectState) : null;
    const classes  = [
      "statusSeat",
      slot.occupied ? "isOccupied" : "",
      isActive      ? "isActive"   : "",
    ].filter(Boolean).join(" ");

    const gems   = slot.occupied ? playerTotalGems(slot.seat, effectState)   : null;
    const tokens = slot.occupied ? playerTotalTokens(slot.seat, effectState) : null;

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

  const spectators = room?.spectators ?? [];
  if (spectators.length > 0) {
    const specItems = spectators.map(spec => {
      const isMe = !isSnap && uiState.isSpectator && spec.clientId === uiState.myClientId;
      const fill = spec.wsOpen ? '#4caf50' : '#e53935';
      return `<span class="statusSpectatorEntry">` +
        `<span class="playerDot" style="--dot-fill:${fill}"></span>` +
        `${escapeHtml(spec.name)}${isMe ? " (you)" : ""}` +
        `</span>`;
    }).join("");
    html += `<div class="statusSpectators"><span>Spectators:</span>${specItems}</div>`;
  }

  if (turn !== null) {
    html += `<div class="statusTurn">Turn ${turn}</div>`;
  }

  statusContent.innerHTML = html;

  // Swap lobby button label depending on context
  const lobbyBtnEl = document.getElementById("lobbyBtn");
  if (lobbyBtnEl) {
    lobbyBtnEl.textContent = isSnap ? "Jump to Game" : "← Lobby";
  }
}

/* ---------------------------------------------------------
   Canvas + renderer
   --------------------------------------------------------- */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

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
   WebSocket / transport
   --------------------------------------------------------- */

// When served behind Apache reverse proxy (charlization.com/trevdor/),
// the WS URL needs the /trevdor prefix so Apache routes the upgrade.
// When accessed directly (localhost:8787 or LAN IP:8787), no prefix needed.
const isBehindProxy = !location.port || location.port === "80" || location.port === "443";
const basePath = isBehindProxy ? "/trevdor" : "";
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + basePath;

const transport = createTransport({
  url: WS_URL,
  name: savedName || "player",
  sessionId: mySessionId,

  onMessage: (msg) => {
    console.log("[server]", msg);

    // Room list — shown in game lobby
    if (msg.type === "ROOM_LIST") {
      uiState.roomList = msg.rooms;
      // If the snap room has disappeared, clear the snapshot and hide the status bar
      if (snapRoomId && !msg.rooms.find(r => r.roomId === snapRoomId)) {
        snapRoomId = null; snapRoom = null; snapState = null; snapMyIdx = null;
        setPreviousRoom(null, false);
        statusBar.classList.add("hidden");
        lobbyScene.classList.remove("withStatusBar");
      }
      updateGameLobby();
      return;
    }

    // Room no longer exists (closed by host, expired, etc.) — drop back to game lobby
    if (msg.type === "ROOM_NOT_FOUND") {
      localStorage.removeItem("trevdor.roomId");
      // Only wipe snap/previous if it's that specific room that vanished
      if (msg.roomId === snapRoomId || msg.roomId === myPreviousRoomId) {
        snapRoomId = null; snapRoom = null; snapState = null; snapMyIdx = null;
        setPreviousRoom(null, false);
      }
      currentRoomId = null;
      state = null;
      uiState.room = null;
      uiState.myPlayerIndex = null;
      uiState.isSpectator = false;
      transport.setRoomId(null);
      setScene("gameLobby");
      return;
    }

    if (msg.type === "WELCOME") {
      currentRoomId = msg.roomId;
      setPreviousRoom(null, false);
      snapRoomId = null; snapRoom = null; snapState = null; snapMyIdx = null;
      uiState.mySeatIndex    = msg.playerIndex;
      uiState.myPlayerIndex  = msg.playerIndex;
      uiState.isSpectator    = !!msg.spectator;
      uiState.myClientId     = msg.clientId;
      uiState.playerPanelPlayerIndex = uiState.myPlayerIndex;

      // Persist session token so we can reclaim our seat on reconnect
      if (msg.sessionId) {
        mySessionId = msg.sessionId;
        localStorage.setItem("trevdor.sessionId", msg.sessionId);
        transport.setSessionId(msg.sessionId);
      }
      localStorage.setItem("trevdor.roomId", msg.roomId);
      transport.setRoomId(msg.roomId);

      console.log("WELCOME parsed:", uiState.mySeatIndex, uiState.myPlayerIndex);
      updateStatusBar();
      draw();
      return;
    }

    if (msg.type === "ROOM" && msg.roomId === currentRoomId) {
      uiState.room = {
        started:     !!msg.started,
        ready:       msg.ready      ?? [false, false, false, false],
        clients:     msg.clients    ?? [],
        spectators:  msg.spectators ?? [],
        playerCount: msg.playerCount ?? null,
        name:        msg.name       ?? currentRoomId,
        host:        msg.host       ?? null,
      };
      if (!msg.started) {
        setScene("roomLobby");
      }
      updateStatusBar();
      updateWaitingRoom();
      draw();
      return;
    }

    if (msg.type === "STATE" && msg.roomId === currentRoomId) {
      state = msg.state;
      if (state !== null) setScene("game");
      updateStatusBar();
      if (!didInitialResize) resize();
      else draw();
      return;
    }

    // If server rejects moves, log clearly
    if (msg.type === "REJECTED") {
      console.warn("[server rejected]", msg.reason, msg);
    }
  },

  onOpen:  () => console.log("[ws] open"),
  onClose: () => console.log("[ws] close"),
  onError: (e) => console.log("[ws] error", e),
});

/* ---------------------------------------------------------
   Game action dispatch
   --------------------------------------------------------- */

function dispatchGameAction(gameAction) {
  console.log(gameAction);
  transport.sendRaw({ type: "ACTION", roomId: currentRoomId, action: gameAction });
}

/* ---------------------------------------------------------
   Button handlers
   --------------------------------------------------------- */

createGameBtn.addEventListener("click", () => {
  const currentName = cleanName(nameInput.value);
  if (!currentName) {
    nameHint.textContent = "Please enter your name first.";
    return;
  }
  uiState.myName = currentName;
  transport.setName(currentName);
  transport.sendRaw({ type: "CREATE_GAME", name: currentName, sessionId: mySessionId });
});

document.getElementById("readyBtn").addEventListener("click", () => {
  transport.sendRaw({ type: "READY", roomId: currentRoomId });
});

document.getElementById("lobbyBtn").addEventListener("click", () => {
  if (currentRoomId) {
    returnToGameLobby();
  } else if (snapRoomId) {
    // "Jump to Game" — rejoin the last game from the game lobby
    const name = cleanName(nameInput.value) || uiState.myName || "player";
    transport.setName(name);
    transport.joinRoom(snapRoomId);
  }
});
document.getElementById("lobbyFromRoomBtn").addEventListener("click", returnToGameLobby);

document.getElementById("closeRoomBtn").addEventListener("click", () => {
  transport.sendRaw({ type: "CLOSE_ROOM", roomId: currentRoomId });
});


/* ---------------------------------------------------------
   Auto-reconnect / initial connection
   --------------------------------------------------------- */

// If we have a saved name + session + room, try to rejoin automatically.
// The transport will auto-send JOIN when the socket opens (via setRoomId).
if (savedName && mySessionId && STORED_ROOM_ID) {
  uiState.myName = savedName;
  setScene("reconnecting");
  transport.setRoomId(STORED_ROOM_ID);
} else {
  setScene("gameLobby");
}

// Always connect immediately so the room list loads without waiting.
transport.connect();

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

  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);

  renderer.resize({ width: rect.width, height: rect.height, dpr }, uiState);

  draw();
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);

/* ---------------------------------------------------------
   Activity ping
   --------------------------------------------------------- */

// Reports client activity to the server via a throttled PING.
// Two-speed throttle: immediate if the client was idle (>60s since last ping)
// so the idle→active dot transition feels instant; otherwise throttled to 15s.
const IDLE_THRESHOLD = 60_000;
const PING_INTERVAL  = 15_000;
let lastPingSent = 0;

function reportActivity() {
  if (!uiState.room || !currentRoomId) return;
  const now     = Date.now();
  const elapsed = now - lastPingSent;
  const throttle = elapsed > IDLE_THRESHOLD ? 0 : PING_INTERVAL;
  if (elapsed > throttle) {
    lastPingSent = now;
    transport.sendRaw({ type: "PING", roomId: currentRoomId });
  }
}

document.addEventListener("mousemove",  reportActivity);
document.addEventListener("click",      reportActivity);
document.addEventListener("touchstart", reportActivity);

// Periodically re-render dots so the idle (>1 min) color transition
// fires without needing a new server event.
setInterval(() => {
  updateStatusBar();
  updateWaitingRoom();
}, 15_000);
