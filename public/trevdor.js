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

import { render, drawGem, loadSpriteSheet } from "./ui/render.js";
import { createUIEvents } from "./ui/events.js";
import { createUIState } from "./ui/state.js";
import { createUIController } from "./ui/controller.js";
import { createTransport } from "./net/transport.js";
import { Intent } from "./ui/intent.js";
import { DEBUG } from "./debug.js";

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
const confirmOverlay   = document.getElementById("confirmOverlay");
const confirmLabel     = document.getElementById("confirmLabel");
const confirmPreview   = document.getElementById("confirmPreview");
const confirmBtn       = document.getElementById("confirmBtn");
const cancelBtn        = document.getElementById("cancelBtn");

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
  } else {
  roomListEl.innerHTML = rooms.map(r => {
    const statusText = r.gameOver ? `${escapeHtml(r.winnerName)} Won`
                     : r.started ? "In Progress"
                     : `${r.playerCount}/4`;
    const statusStyle = r.gameOver ? ' style="color:#ffd700;font-weight:bold"' : '';
    const watchLabel = (r.roomId === myPreviousRoomId) ? "Resume"
                     : r.gameOver                      ? "Results"
                     : r.started                       ? "Watch"
                     :                                   "Join";
    const btnStyle = r.gameOver ? ' style="background:#c0c0c0;color:#111"' : '';
    const showCloseBtn = myPreviousRoomIsHost && r.roomId === myPreviousRoomId;
    return `<div class="roomEntry">` +
      `<div class="roomEntryName">${escapeHtml(r.name)}</div>` +
      `<div class="roomEntryMeta"${statusStyle}>${statusText}` +
      (r.spectatorCount ? ` · ${r.spectatorCount} watching` : ``) +
      `</div>` +
      `<button class="joinRoomBtn"${btnStyle} data-room-id="${escapeHtml(r.roomId)}">${watchLabel}</button>` +
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
  } // end else (rooms.length > 0)

  // Connected users section
  const usersEl = document.getElementById("connectedUsers");
  if (usersEl) {
    const users = uiState.connectedUsers ?? [];
    if (users.length === 0) {
      usersEl.innerHTML = "";
    } else {
      usersEl.innerHTML =
        `<div class="connectedUsersHeader">Online (${users.length})</div>` +
        users.map(u => {
          const isMe = u.clientId === uiState.myClientId;
          return `<div class="connectedUserEntry">` +
            `<span class="playerDot" style="--dot-fill:${userDotFill(u)}"></span>` +
            `<span class="connectedUserName">${escapeHtml(u.name)}</span>` +
            (isMe ? `<span class="youLabel">(you)</span>` : ``) +
            `<span class="connectedUserLocation">${escapeHtml(u.location)}</span>` +
            `</div>`;
        }).join("");
    }
  }
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

function userDotFill(user) {
  if (!user.wsOpen) return '#e53935';
  const age = user.lastActivity ? (Date.now() - user.lastActivity) : 0;
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
  const fromCards  = (player.cards ?? []).reduce((sum, c) => sum + (c.points ?? 0), 0);
  const fromNobles = (player.nobles ?? []).reduce((sum, n) => sum + (n.points ?? 0), 0);
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
    if (!slot.occupied) continue;

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

  if (effectState?.gameOver && typeof effectState.winner === "number") {
    const winnerName = effectState.players[effectState.winner]?.name ?? `Player ${effectState.winner + 1}`;
    const winnerPts = playerPrestige(effectState.winner, effectState);
    html += `<div class="statusTurn statusWinner">Winner: ${escapeHtml(winnerName)} (${winnerPts}pt)</div>`;
  } else if (effectState?.finalRound) {
    html += `<div class="statusTurn statusFinalRound">Final Round! · Turn ${turn ?? ""}</div>`;
  } else if (turn !== null) {
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
  if (!state) {
    confirmOverlay.classList.add("hidden");
    return; // don't render until we have state
  }
  renderer.draw(state, uiState);
  updateConfirmOverlay();
}

/* ---------------------------------------------------------
   Confirm overlay (HTML popup for pending actions)
   --------------------------------------------------------- */

const CONFIRM_TOKEN_COLORS = {
  white:  { bg: "#E9EEF3", text: "#111" },
  blue:   { bg: "#0000FF", text: "#E9EEF3" },
  green:  { bg: "#2E9B5F", text: "#E9EEF3" },
  red:    { bg: "#D94A4A", text: "#E9EEF3" },
  black:  { bg: "#2B2B2B", text: "#E9EEF3" },
  yellow: { bg: "#D6B04C", text: "#111" },
};

const CONFIRM_CARD_COLORS = {
  white:  { bg: "#E9EEF3", text: "#111" },
  blue:   { bg: "#2D6CDF", text: "#E9EEF3" },
  green:  { bg: "#2E9B5F", text: "#E9EEF3" },
  red:    { bg: "#D94A4A", text: "#E9EEF3" },
  black:  { bg: "#2B2B2B", text: "#E9EEF3" },
};

function updateConfirmOverlay() {
  if (!state || !Intent.isCommitReady(state, uiState)) {
    confirmOverlay.classList.add("hidden");
    return;
  }
  confirmOverlay.classList.remove("hidden");

  const labels = { buyCard: "Buy Card?", reserveCard: "Reserve Card?", takeTokens: "Take Tokens?" };
  confirmLabel.textContent = labels[uiState.mode] ?? "Confirm?";
  confirmPreview.innerHTML = buildPreviewHTML(uiState);
  renderConfirmGems(confirmPreview);
}

function makeGemCanvas(color, size) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement("canvas");
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = size + "px";
  c.style.height = size + "px";
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  drawGem(ctx, size / 2, size / 2, size * 0.4, color, "");
  return c;
}

function buildPreviewHTML(uiState) {
  const mode = uiState.mode;

  if (mode === "takeTokens") {
    const tokens = uiState.pending?.tokens ?? {};
    let html = "";
    for (const [color, count] of Object.entries(tokens)) {
      if (!count) continue;
      const c = CONFIRM_TOKEN_COLORS[color] ?? { bg: "#888", text: "#fff" };
      for (let i = 0; i < count; i++) {
        html += `<span class="confirmToken" style="background:${c.bg};color:${c.text}" data-gem-color="${color}"></span>`;
      }
    }
    return html;
  }

  if (mode === "buyCard" || mode === "reserveCard") {
    const card = uiState.pending?.card;
    const meta = card?.meta;
    if (!meta) return "";

    const bonus = meta.bonus ?? "white";
    const cc = CONFIRM_CARD_COLORS[bonus] ?? { bg: "#ccc", text: "#111" };
    const points = meta.points ?? 0;
    const cost = meta.cost ?? {};
    const costOrder = ["white", "blue", "green", "red", "black"];

    let costHTML = "";
    for (const c of costOrder) {
      const n = cost[c];
      if (!n) continue;
      const tc = CONFIRM_TOKEN_COLORS[c] ?? { bg: "#888", text: "#fff" };
      costHTML += `<span class="confirmCostPip" style="background:${tc.bg};color:${tc.text}" data-gem-color="${c}">${n}</span>`;
    }

    let html = `<div class="confirmCard" style="background:${cc.bg};color:${cc.text}">`;
    html += `<div class="confirmCardHeader">`;
    if (points > 0) html += `<span class="confirmCardPoints">${points}</span>`;
    else html += `<span></span>`;
    html += `<span class="confirmCardGem" data-gem-color="${bonus}"></span>`;
    html += `</div>`;
    if (costHTML) html += `<div class="confirmCardBody">${costHTML}</div>`;
    html += `</div>`;

    if (mode === "reserveCard") {
      const gc = CONFIRM_TOKEN_COLORS.yellow;
      html += `<span class="confirmToken" style="background:${gc.bg};color:${gc.text}" data-gem-color="yellow"></span>`;
    }

    return html;
  }

  return "";
}

function renderConfirmGems(container) {
  // Replace CSS gem on tokens with canvas-drawn gem
  container.querySelectorAll(".confirmToken[data-gem-color]").forEach(el => {
    const color = el.dataset.gemColor;
    const gem = makeGemCanvas(color, 18);
    gem.style.position = "absolute";
    gem.style.zIndex = "1";
    gem.style.pointerEvents = "none";
    el.appendChild(gem);
  });
  // Replace CSS gem on card header
  container.querySelectorAll(".confirmCardGem[data-gem-color]").forEach(el => {
    const color = el.dataset.gemColor;
    const gem = makeGemCanvas(color, 16);
    el.style.background = "none";
    el.style.transform = "none";
    el.style.border = "none";
    el.style.boxShadow = "none";
    el.style.width = "16px";
    el.style.height = "16px";
    el.appendChild(gem);
  });
  // Replace CSS gem on cost pips
  container.querySelectorAll(".confirmCostPip[data-gem-color]").forEach(el => {
    const color = el.dataset.gemColor;
    const gem = makeGemCanvas(color, 20);
    gem.style.position = "absolute";
    gem.style.zIndex = "0";
    gem.style.pointerEvents = "none";
    el.style.position = "relative";
    el.style.background = "none";
    el.style.border = "1px solid rgba(0,0,0,0.1)";
    el.insertBefore(gem, el.firstChild);
    // Make text sit on top
    const text = el.childNodes[el.childNodes.length - 1];
    if (text?.nodeType === 3) {
      const span = document.createElement("span");
      span.style.position = "relative";
      span.style.zIndex = "1";
      span.textContent = text.textContent;
      el.replaceChild(span, text);
    }
  });
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
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + basePath + "/ws";

const transport = createTransport({
  url: WS_URL,
  name: savedName || "player",
  sessionId: mySessionId,

  onMessage: (msg) => {
    if (DEBUG) console.log("[server]", msg);

    // Room list — shown in game lobby
    if (msg.type === "ROOM_LIST") {
      if (msg.yourClientId != null) uiState.myClientId = msg.yourClientId;
      uiState.roomList = msg.rooms;
      uiState.connectedUsers = msg.users ?? [];
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

      if (DEBUG) console.log("WELCOME parsed:", uiState.mySeatIndex, uiState.myPlayerIndex);
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

  onOpen:  () => {
    if (DEBUG) console.log("[ws] open");
    const connStatus = document.getElementById("connStatus");
    if (connStatus) connStatus.textContent = "Game Lobby";
    const n = cleanName(nameInput.value);
    if (n) transport.sendRaw({ type: "IDENTIFY", name: n });
  },
  onClose: () => {
    if (DEBUG) console.log("[ws] close");
    const connStatus = document.getElementById("connStatus");
    if (connStatus && !currentRoomId) connStatus.textContent = "Connecting…";
  },
  onError: (e) => { if (DEBUG) console.log("[ws] error", e); },
});

/* ---------------------------------------------------------
   Game action dispatch
   --------------------------------------------------------- */

function dispatchGameAction(gameAction) {
  if (DEBUG) console.log(gameAction);
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

// Connect once the page is fully loaded. On mobile refreshes, connecting
// during module evaluation fails because the browser is still tearing down
// the old page's WebSocket. The load event fires after that cleanup.
if (document.readyState === "complete") {
  transport.connect();
} else {
  window.addEventListener("load", () => transport.connect());
}

// Safety net: if we're still not connected after 3 seconds, force a retry.
// On mobile Safari, the load-event connect can get killed by the browser
// during page transition. This catches that case without relying on user
// interaction (switching apps, tapping).
setTimeout(() => {
  if (!transport.isOpen()) transport.connect();
}, 3000);

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

// Wire HTML confirm/cancel buttons into controller
confirmBtn.addEventListener("click", () => {
  controller.onUIAction({ type: "click", hit: { kind: "button.confirm" } });
});
cancelBtn.addEventListener("click", () => {
  controller.onUIAction({ type: "cancel" });
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

  // Auto-zoom: fit relevant content (board + visible panels) into viewport
  const bounds = renderer.getBounds();
  if (bounds && !uiState.cameraUserAdjusted) {
    const numPlayers = state?.players?.length ?? 0;

    // Compute tight bounding box of board + visible panels only
    // Panel positions: 0=bottom(you), 1=right(+1), 2=top(+2), 3=left(+3)
    const rects = [bounds.boardRect];
    if (bounds.panelRects) {
      for (let i = 0; i < Math.min(numPlayers, 4); i++) {
        rects.push(bounds.panelRects[i]);
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }

    const pad = 15; // small margin around the content
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;

    // Scale to fit the tighter bounding box in the viewport
    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const fitScale = Math.min(scaleX, scaleY, 1);

    // Center the content in the viewport
    uiState.camera.scale = fitScale;
    uiState.camera.x = minX - (rect.width / fitScale - contentW) / 2;
    uiState.camera.y = minY - (rect.height / fitScale - contentH) / 2;
  }

  draw();
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);

// Load card sprite sheet (non-blocking — cards use flat color fallback until loaded)
loadSpriteSheet().then(() => draw());

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
  const now     = Date.now();
  const elapsed = now - lastPingSent;
  const throttle = elapsed > IDLE_THRESHOLD ? 0 : PING_INTERVAL;
  if (elapsed > throttle) {
    lastPingSent = now;
    transport.sendRaw({ type: "PING", roomId: currentRoomId ?? null });
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
  updateGameLobby();
}, 15_000);
