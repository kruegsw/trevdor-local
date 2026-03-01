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

import { render, drawGem, loadSpriteSheet, drawCardSprite, drawCardProcedural, setCardArtMode, getCardArtMode } from "./ui/render.js";
import { createUIEvents } from "./ui/events.js";
import { createUIState } from "./ui/state.js";
import { createUIController } from "./ui/controller.js";
import { createTransport } from "./net/transport.js";
import { Intent } from "./ui/intent.js";
import { screenToWorld } from "./ui/camera.js";
import { DEBUG } from "./debug.js";
import sfx from "./ui/sounds.js";

/* ---------------------------------------------------------
   Game + UI state
   --------------------------------------------------------- */

// Authoritative state arrives from server
let state = null;
let prevState = null;        // previous game state (for sound diffing)
let prevClientIds = new Set(); // previous occupied client IDs (for join/leave sounds)

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

// Options preferences (persisted in localStorage, default on)
let soundEnabled   = localStorage.getItem("trevdor.sound")   !== "false";
// Card art mode: 0=none, 1=procedural, 2=sprites (backwards-compat: "true"→2, "false"→0)
const _storedCardArt = localStorage.getItem("trevdor.cardArt");
let cardArtPref = _storedCardArt === "true" ? 2
  : _storedCardArt === "false" ? 0
  : _storedCardArt != null ? (parseInt(_storedCardArt, 10) || 0)
  : 2;
let cursorsPref    = localStorage.getItem("trevdor.cursors") !== "false";
let chatPref       = localStorage.getItem("trevdor.chat")    !== "false";
const _storedSimplified = localStorage.getItem("trevdor.simplified");
let simplifiedPref = _storedSimplified !== null
  ? _storedSimplified !== "false"
  : window.innerWidth <= 768;   // default ON mobile, OFF desktop
let lightModePref  = localStorage.getItem("trevdor.lightMode") === "true";
let grannyModePref = localStorage.getItem("trevdor.grannyMode") === "true";
sfx.enabled = soundEnabled;
setCardArtMode(cardArtPref);
if (lightModePref) document.body.classList.add("lightMode");

// Chat state
let chatMessages = [];
let chatOpen = false;
let chatUnreadCount = 0;
let chatToastTimer = null;

const uiState = createUIState();
uiState.showCursors = cursorsPref;
uiState.simplifiedView = simplifiedPref;
uiState.lightMode = lightModePref;
uiState.grannyMode = grannyModePref;

/* ---------------------------------------------------------
   DOM references
   --------------------------------------------------------- */

const lobbyScene       = document.getElementById("lobbyScene");
const gameLobbySection = document.getElementById("gameLobbySection");
const waitingSection   = document.getElementById("waitingSection");
// "Create Game" is now a tile in the room grid, wired in updateGameLobby()
const statusBar        = document.getElementById("statusBar");
const statusContent    = document.getElementById("statusContent");
const confirmOverlay   = document.getElementById("confirmOverlay");
const confirmLabel     = document.getElementById("confirmLabel");
const confirmPreview   = document.getElementById("confirmPreview");
const confirmBtn       = document.getElementById("confirmBtn");
const cancelBtn        = document.getElementById("cancelBtn");
const optionsBtn       = document.getElementById("optionsBtn");
const optionsDropdown  = document.getElementById("optionsDropdown");
const optSound         = document.getElementById("optSound");
const optCardArtToggle = document.getElementById("optCardArtToggle");
const cardArtIndicator = document.getElementById("cardArtIndicator");
const optCursors       = document.getElementById("optCursors");
const optChat          = document.getElementById("optChat");
const optResources     = document.getElementById("optResources");
const optLightMode     = document.getElementById("optLightMode");
const optGrannyMode    = document.getElementById("optGrannyMode");
const resourceBanner   = document.getElementById("resourceBanner");
const resourceContent  = document.getElementById("resourceContent");
const chatPanel        = document.getElementById("chatPanel");
const chatToggleBtn    = document.getElementById("chatToggleBtn");
const chatBadge        = document.getElementById("chatBadge");
const chatToast        = document.getElementById("chatToast");
const chatBox          = document.getElementById("chatBox");
const chatMessagesEl   = document.getElementById("chatMessages");
const chatInput        = document.getElementById("chatInput");
const chatSendBtn      = document.getElementById("chatSendBtn");

/* ---------------------------------------------------------
   Scene management
   --------------------------------------------------------- */

function setScene(scene) {
  if (scene === "gameLobby") {
    lobbyScene.classList.remove("hidden");
    gameLobbySection.classList.remove("hidden");
    waitingSection.classList.add("hidden");
    chatPanel.classList.add("hidden");
    resourceBanner.classList.add("hidden");
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
    chatPanel.classList.add("hidden");
    resourceBanner.classList.add("hidden");
    // Create-game tile is disabled implicitly (updateGameLobby re-renders it)
  } else if (scene === "roomLobby") {
    lobbyScene.classList.remove("hidden");
    gameLobbySection.classList.add("hidden");
    waitingSection.classList.remove("hidden");
    lobbyScene.classList.remove("withStatusBar");
    statusBar.classList.add("hidden");
    chatPanel.classList.toggle("hidden", !chatPref);
    resourceBanner.classList.add("hidden");
  } else if (scene === "game") {
    lobbyScene.classList.add("hidden");
    lobbyScene.classList.remove("withStatusBar");
    statusBar.classList.remove("hidden");
    chatPanel.classList.toggle("hidden", !chatPref);
    resourceBanner.classList.remove("hidden");
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
  prevState = null;
  prevClientIds = new Set();
  uiState.room = null;
  uiState.myPlayerIndex = null;
  uiState.myClientId = null;
  uiState.isSpectator = false;
  uiState.remoteCursors = {};
  transport.setRoomId(null);
  localStorage.removeItem("trevdor.roomId");

  // Clear chat state
  chatMessages = [];
  chatUnreadCount = 0;
  chatOpen = false;
  if (chatToastTimer) { clearTimeout(chatToastTimer); chatToastTimer = null; }
  chatMessagesEl.innerHTML = "";
  chatBox.classList.add("hidden");
  chatToast.classList.add("hidden");
  chatBadge.classList.add("hidden");

  setScene("gameLobby");
}

/* ---------------------------------------------------------
   Name input
   --------------------------------------------------------- */

const nameHint  = document.getElementById("nameHint");

const savedName       = localStorage.getItem("trevdor.name")      || "";
const STORED_ROOM_ID  = localStorage.getItem("trevdor.roomId")    || null;

function cleanName(s) {
  return (s ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
}

// nameInput lives inside #connStatus — rendered by updateConnStatus()
let nameInput;

function updateConnStatus(connected) {
  const el = document.getElementById("connStatus");
  if (!el) return;
  if (!connected) {
    el.innerHTML = `Connecting…`;
    nameInput = null;
    return;
  }
  const currentName = localStorage.getItem("trevdor.name") || "";
  el.innerHTML = `Playing as ` +
    `<input id="nameInput" class="nameInputInline" type="text" placeholder="your name" maxlength="20" value="${escapeHtmlAttr(currentName)}" />` +
    `<span id="nameInputMeasure" class="nameInputMeasure"></span>`;
  nameInput = document.getElementById("nameInput");
  const measure = document.getElementById("nameInputMeasure");
  function sizeInput() {
    measure.textContent = nameInput.value || nameInput.placeholder;
    nameInput.style.width = measure.offsetWidth + "px";
  }
  sizeInput();
  nameInput.addEventListener("input", () => {
    const n = cleanName(nameInput.value);
    localStorage.setItem("trevdor.name", n);
    sizeInput();
    if (n) transport.sendRaw({ type: "IDENTIFY", name: n });
  });
}

function escapeHtmlAttr(s) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

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
   Chat helpers
   --------------------------------------------------------- */

const CHAT_SEAT_COLORS = ["#2D6CDF", "#D94A4A", "#2E9B5F", "#D6B04C"];

function chatSenderColor(seat) {
  return typeof seat === "number" && seat >= 0 && seat < 4
    ? CHAT_SEAT_COLORS[seat]
    : "#aaa";
}

function renderChatMessage(msg) {
  const color = chatSenderColor(msg.seat);
  const name = msg.name || "Unknown";
  return `<div class="chatMsg"><span class="chatSender" style="color:${color}">${escapeHtml(name)}</span> ${escapeHtml(msg.text)}</div>`;
}

function renderChatMessages() {
  chatMessagesEl.innerHTML = chatMessages.map(renderChatMessage).join("");
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updateChatBadge() {
  if (chatUnreadCount > 0) {
    chatBadge.textContent = chatUnreadCount > 99 ? "99+" : String(chatUnreadCount);
    chatBadge.classList.remove("hidden");
  } else {
    chatBadge.classList.add("hidden");
  }
}

function showChatToast(msg) {
  if (chatOpen) return;
  const color = chatSenderColor(msg.seat);
  const name = msg.name || "Unknown";
  const truncated = msg.text.length > 80 ? msg.text.slice(0, 80) + "…" : msg.text;
  chatToast.innerHTML = `<span class="chatSender" style="color:${color}">${escapeHtml(name)}</span> ${escapeHtml(truncated)}`;
  chatToast.classList.remove("hidden");
  if (chatToastTimer) clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(() => {
    chatToast.classList.add("hidden");
    chatToastTimer = null;
  }, 4000);
}

function openChat() {
  chatOpen = true;
  chatBox.classList.remove("hidden");
  chatToast.classList.add("hidden");
  if (chatToastTimer) { clearTimeout(chatToastTimer); chatToastTimer = null; }
  chatUnreadCount = 0;
  updateChatBadge();
  renderChatMessages();
  chatInput.focus();
}

function closeChat() {
  chatOpen = false;
  chatBox.classList.add("hidden");
}

function sendChatMessage() {
  const text = chatInput.value.trim().slice(0, 200);
  if (!text) return;
  transport.sendRaw({ type: "SAY", text });
  chatInput.value = "";
}

/* ---------------------------------------------------------
   Sound triggers on state change
   --------------------------------------------------------- */

function tokenCount(tokens) {
  return Object.values(tokens ?? {}).reduce((s, n) => s + n, 0);
}

function playSoundsForStateChange(prev, next) {
  // Game starts (first STATE after null, only on a fresh game — not rejoin)
  if (prev === null && next !== null) {
    if (next.turn === 1) {
      sfx.shuffle();
      setTimeout(() => sfx.gameStart(), 850);
    }
    return;
  }
  if (!prev || !next) return;

  // Game over
  if (!prev.gameOver && next.gameOver) {
    if (next.winner === uiState.myPlayerIndex) sfx.gameOverWin();
    else if (!uiState.isSpectator) sfx.gameOverLose();
    return;
  }

  // Your turn
  if (prev.activePlayerIndex !== next.activePlayerIndex
      && next.activePlayerIndex === uiState.myPlayerIndex
      && !next.gameOver) {
    sfx.yourTurn();
  }

  // Action sounds — compare the acting player's state
  if (prev.activePlayerIndex !== next.activePlayerIndex) {
    const actor = prev.activePlayerIndex;
    const oldP = prev.players[actor];
    const newP = next.players[actor];
    if (oldP && newP) {
      if (newP.cards.length > oldP.cards.length) {
        sfx.cardBuy();
        if (newP.nobles.length > oldP.nobles.length) {
          setTimeout(() => sfx.nobleVisit(), 300);
        }
      } else if (tokenCount(newP.tokens) > tokenCount(oldP.tokens)) {
        sfx.tokenPickup();
      }
    }
  }
}

/* ---------------------------------------------------------
   Game lobby (room list)
   --------------------------------------------------------- */

let onlineStripExpanded = false;

function updateGameLobby() {
  const roomListEl = document.getElementById("roomList");
  if (!roomListEl) return;
  const rooms = uiState.roomList ?? [];

  // Always start with the "+" create-game tile
  const createTile = `<div class="createGameTile" id="createGameTile">` +
    `<span class="createPlus">+</span>` +
    `<span class="createLabel">New Game</span>` +
    `</div>`;

  if (rooms.length === 0) {
    roomListEl.innerHTML = createTile;
  } else {
  roomListEl.innerHTML = createTile + rooms.map(r => {
    const players = r.players ?? [];
    // Left border color based on status
    const borderColor = r.gameOver ? '#ffd700' : r.started ? '#5c8dd6' : '#4caf50';
    // Status badge
    const statusClass = r.gameOver ? 'gameOver' : r.started ? 'inProgress' : 'waiting';
    const statusText = r.gameOver ? `${escapeHtml(r.winnerName)} Won`
                     : r.started ? "In Progress"
                     : `${r.playerCount}/4 Players`;
    // Action button
    const watchLabel = (r.roomId === myPreviousRoomId) ? "Resume"
                     : r.gameOver                      ? "Results"
                     : r.started                       ? "Watch"
                     :                                   "Join";
    const btnStyle = r.gameOver ? ' style="background:#c0c0c0;color:#111"' : '';
    const showCloseBtn = myPreviousRoomIsHost && r.roomId === myPreviousRoomId;
    // Player rows (dot + name per seat)
    let playerRows = '';
    for (let i = 0; i < 4; i++) {
      const p = players.find(p => p.seat === i);
      if (p) {
        const fill = !p.wsOpen ? '#e53935'
          : (p.lastActivity && (Date.now() - p.lastActivity) > 60000) ? '#ffd700'
          : '#4caf50';
        playerRows += `<div class="tilePlayerRow">` +
          `<span class="playerDot" style="--dot-fill:${fill}"></span>` +
          `<span>${escapeHtml(p.name)}</span>` +
          `</div>`;
      } else if (!r.started) {
        playerRows += `<div class="tilePlayerRow empty">` +
          `<span class="tileSeatDot empty"></span>` +
          `<span>open</span>` +
          `</div>`;
      }
    }
    // Spectators
    const spectators = r.spectators ?? [];
    const specHtml = spectators.length === 0 ? '' :
      `<div class="tileSpecRow">` +
        spectators.map(s => {
          const fill = s.wsOpen ? '#4caf50' : '#e53935';
          return `<span class="tileSpecEntry">` +
            `<span class="playerDot" style="--dot-fill:${fill}"></span>` +
            `${escapeHtml(s.name)}` +
            `</span>`;
        }).join("") +
      `</div>`;

    return `<div class="roomTile" style="border-left-color:${borderColor}">` +
      `<div class="tileTopRow">` +
        `<span class="tileName">${escapeHtml(r.name)}</span>` +
        `<span class="tileStatus ${statusClass}">${statusText}</span>` +
      `</div>` +
      `<div class="tilePlayers">${playerRows}</div>` +
      specHtml +
      `<div class="tileBottomRow">` +
        `<button class="joinRoomBtn"${btnStyle} data-room-id="${escapeHtml(r.roomId)}">${watchLabel}</button>` +
        (showCloseBtn ? `<button class="closeGameLobbyBtn" data-close-room-id="${escapeHtml(r.roomId)}">Close</button>` : ``) +
      `</div>` +
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

  // Wire up the create-game tile
  const createEl = document.getElementById("createGameTile");
  if (createEl) createEl.addEventListener("click", handleCreateGame);

  // Online strip
  const stripEl = document.getElementById("onlineStrip");
  if (stripEl) {
    const users = uiState.connectedUsers ?? [];
    if (users.length === 0) {
      stripEl.innerHTML = `<span class="onlineStripLabel">Online (0)</span>`;
    } else {
      const VISIBLE_LIMIT = 6;
      const visibleUsers = onlineStripExpanded ? users : users.slice(0, VISIBLE_LIMIT);
      const overflow = users.length - VISIBLE_LIMIT;
      stripEl.innerHTML =
        `<span class="onlineStripLabel">Online (${users.length})</span>` +
        visibleUsers.map(u => {
          const isMe = u.clientId === uiState.myClientId;
          const loc = u.location && u.location !== "Lobby" ? u.location : '';
          return `<span class="onlineStripUser">` +
            `<span class="playerDot" style="--dot-fill:${userDotFill(u)}"></span>` +
            `${escapeHtml(u.name)}${isMe ? ' <span class="youLabel">(you)</span>' : ''}` +
            (loc ? `<span class="onlineStripLoc">${escapeHtml(loc)}</span>` : '') +
            `</span>`;
        }).join("") +
        (overflow > 0 && !onlineStripExpanded
          ? `<span class="onlineStripMore" id="onlineStripToggle">+${overflow} more</span>`
          : overflow > 0 && onlineStripExpanded
          ? `<span class="onlineStripMore" id="onlineStripToggle">show less</span>`
          : '');
      const toggle = document.getElementById("onlineStripToggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          onlineStripExpanded = !onlineStripExpanded;
          updateGameLobby();
        });
      }
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

function truncName(name, max = 10) {
  return name && name.length > max ? name.slice(0, max) + "…" : name;
}

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

  let html = `<div class="statusRoom">${escapeHtml(truncName(roomName, 12))}</div>`;

  // Turn indicator — placed between room name and player seats
  if (effectState?.gameOver && typeof effectState.winner === "number") {
    const winnerName = effectState.players[effectState.winner]?.name ?? `Player ${effectState.winner + 1}`;
    const winnerPts = playerPrestige(effectState.winner, effectState);
    html += `<div class="statusTurn statusWinner">Winner: ${escapeHtml(truncName(winnerName))} (${winnerPts}\u00a0pt)</div>`;
  } else if (effectState?.finalRound) {
    html += `<div class="statusTurn statusFinalRound">Final\u00a0Round! · Turn\u00a0${turn ?? ""}</div>`;
  } else if (turn !== null) {
    html += `<div class="statusTurn">Turn\u00a0${turn}</div>`;
  }

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

    html += `<div class="${classes}">`;
    html += `<span class="playerDot${isActive ? ' isActive' : ''}" style="--dot-fill:${seatFill(slot)}"></span>`;
    if (slot.occupied) {
      html += `<span>${escapeHtml(truncName(slot.name ?? `Player ${slot.seat + 1}`))}</span>`;
      if (prestige !== null) html += `<span class="statusPoints">${prestige} pt</span>`;
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
        `${escapeHtml(truncName(spec.name))}${isMe ? " (you)" : ""}` +
        `</span>`;
    }).join("");
    html += `<div class="statusSpectators"><span>Spectators:</span>${specItems}</div>`;
  }

  statusContent.innerHTML = html;

  // Swap lobby button label depending on context
  const lobbyBtnEl = document.getElementById("lobbyBtn");
  if (lobbyBtnEl) {
    lobbyBtnEl.textContent = isSnap ? "Jump to Game" : "← Lobby";
  }
}

const SEAT_ACCENT_COLORS = ["#2D6CDF", "#D94A4A", "#2E9B5F", "#D6B04C"];

// Gem colors now defined in CSS via .gem-* classes (radial gradients matching canvas)

function buildPlayerRow(player, pIdx) {
  const accent = SEAT_ACCENT_COLORS[pIdx] ?? "#888";
  const playerName = player.name ?? `Player ${pIdx + 1}`;
  const gemCounts = {};
  for (const card of player.cards ?? []) {
    if (card.bonus) gemCounts[card.bonus] = (gemCounts[card.bonus] || 0) + 1;
  }
  const tokens = player.tokens ?? {};
  const gemColors = ["yellow", "green", "red", "blue", "black", "white"];
  const isActive = state.activePlayerIndex === pIdx;
  const playTri = isActive ? `<span class="resBannerPlay" style="border-left-color:${accent}"></span>` : "";
  const prestige = playerPrestige(pIdx);
  const activeClass = isActive ? " resBannerRowActive" : "";
  const viewingClass = uiState.panelViewPlayerIndex === pIdx ? " resBannerRowViewing" : "";
  let row = `<div class="resBannerRow${activeClass}${viewingClass}" data-player-index="${pIdx}" style="background: linear-gradient(${accent}10, ${accent}10), rgba(243,243,243,0.85); border: 1.5px solid ${accent}">`;
  row += `<span class="resBannerName" style="color:${accent}">${playTri}<span class="resBannerNameText">${escapeHtml(playerName)}</span></span>`;
  row += `<span class="resBannerPts">${prestige} pt</span>`;
  for (const color of gemColors) {
    const g = gemCounts[color] || 0;
    const t = tokens[color] || 0;
    if (g === 0 && t === 0) continue;
    row += `<span class="resBannerSlot">`;
    for (let i = 0; i < g; i++) row += `<span class="resBannerGem gem-${color}"></span>`;
    for (let i = 0; i < t; i++) row += `<span class="resBannerToken token-${color}"><span class="resBannerTokenGem gem-${color}"></span></span>`;
    row += `</span>`;
  }
  const nobleCount = (player.nobles ?? []).length;
  if (nobleCount > 0) {
    row += `<span class="resBannerSlot">`;
    for (let i = 0; i < nobleCount; i++) row += `<span class="resBannerCrown"></span>`;
    row += `</span>`;
  }
  row += `</div>`;
  return row;
}

function togglePanelView(playerIndex) {
  if (uiState.panelViewPlayerIndex === playerIndex) {
    uiState.panelViewPlayerIndex = null;
  } else {
    uiState.panelViewPlayerIndex = playerIndex;
  }
  uiState.cameraUserAdjusted = false;
  updateResourceBanner();
  resize();
}

function updateResourceBanner() {
  if (!state?.players?.length || !uiState.simplifiedView) {
    resourceBanner.classList.add("hidden");
    return;
  }
  resourceBanner.classList.remove("hidden");
  let html = "";
  for (let i = 0; i < state.players.length; i++) {
    html += buildPlayerRow(state.players[i], i);
  }
  resourceContent.innerHTML = html;
  resourceContent.querySelectorAll(".resBannerRow").forEach(row => {
    row.addEventListener("click", () => {
      const pIdx = parseInt(row.dataset.playerIndex, 10);
      if (pIdx < state.players.length) togglePanelView(pIdx);
    });
  });
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

let drawRafId = 0;

function drawNow() {
  if (!state) {
    confirmOverlay.classList.add("hidden");
    return; // don't render until we have state
  }
  renderer.draw(state, uiState);
  updateConfirmOverlay();
}

function draw() {
  if (drawRafId) return; // already scheduled
  drawRafId = requestAnimationFrame(() => {
    drawRafId = 0;
    drawNow();
  });
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

let _lastConfirmKey = null;

function updateConfirmOverlay() {
  if (!state || !Intent.isCommitReady(state, uiState)) {
    confirmOverlay.classList.add("hidden");
    _lastConfirmKey = null;
    return;
  }
  // Build a key from the inputs that drive the overlay content.
  // Only rebuild DOM when the pending intent actually changes.
  const p = uiState.pending;
  const key = `${uiState.mode}|${p?.card?.meta?.id ?? ""}|${JSON.stringify(p?.tokens ?? {})}`;
  if (key === _lastConfirmKey) return;
  _lastConfirmKey = key;

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

function computePayment(cardMeta, player) {
  const COLORS = ["white", "blue", "green", "red", "black"];
  const cost = cardMeta.cost ?? {};
  const bonus = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  for (const c of player.cards ?? []) {
    const b = c?.bonus;
    if (bonus[b] != null) bonus[b] += 1;
  }
  const tokens = player.tokens ?? {};
  const pay = { white: 0, blue: 0, green: 0, red: 0, black: 0, yellow: 0 };
  let wildNeeded = 0;
  for (const color of COLORS) {
    const need = Math.max(0, (cost[color] ?? 0) - (bonus[color] ?? 0));
    const have = tokens[color] ?? 0;
    const use = Math.min(have, need);
    pay[color] = use;
    wildNeeded += need - use;
  }
  pay.yellow = wildNeeded;
  return pay;
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

    const cardId = meta.id ?? "";
    let html = `<div class="confirmCard" data-card-id="${cardId}" style="background:${cc.bg};color:${cc.text}">`;
    html += `<div class="confirmCardHeader">`;
    if (points > 0) html += `<span class="confirmCardPoints">${points}</span>`;
    else html += `<span></span>`;
    html += `<span class="confirmCardGem" data-gem-color="${bonus}"></span>`;
    html += `</div>`;
    if (costHTML) html += `<div class="confirmCardBody">${costHTML}</div>`;
    html += `</div>`;

    if (mode === "buyCard" && state) {
      const myIdx = uiState.myPlayerIndex;
      const player = typeof myIdx === "number" ? state.players?.[myIdx] : null;
      if (player) {
        const pay = computePayment(meta, player);
        const payOrder = ["white", "blue", "green", "red", "black", "yellow"];
        const totalSpent = payOrder.reduce((s, c) => s + (pay[c] ?? 0), 0);
        html += `<div class="confirmCostRow">`;
        if (totalSpent === 0) {
          html += `<span class="confirmCostLabel">Free</span>`;
        } else {
          html += `<span class="confirmCostLabel">Cost:</span>`;
          for (const c of payOrder) {
            if (!pay[c]) continue;
            const tc = CONFIRM_TOKEN_COLORS[c] ?? { bg: "#888", text: "#fff" };
            for (let i = 0; i < pay[c]; i++) {
              html += `<span class="confirmToken" style="background:${tc.bg};color:${tc.text}" data-gem-color="${c}"></span>`;
            }
          }
        }
        html += `</div>`;
      }
    }

    if (mode === "reserveCard") {
      const gc = CONFIRM_TOKEN_COLORS.yellow;
      html += `<span class="confirmToken" style="background:${gc.bg};color:${gc.text}" data-gem-color="yellow"></span>`;
    }

    return html;
  }

  return "";
}

function renderConfirmGems(container) {
  // Render sprite background on confirm card
  container.querySelectorAll(".confirmCard[data-card-id]").forEach(el => {
    const cardId = el.dataset.cardId;
    if (!cardId) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 72, h = 100;
    const c = document.createElement("canvas");
    c.width = w * dpr; c.height = h * dpr;
    c.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;border-radius:8px;z-index:0;`;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const bonus = el.querySelector(".confirmCardGem")?.dataset.gemColor ?? "white";
    if (drawCardSprite(ctx, 0, 0, w, h, cardId) || drawCardProcedural(ctx, 0, 0, w, h, cardId, bonus)) {
      // Tinted header band — lighter for procedural
      const cc = CONFIRM_CARD_COLORS[bonus] ?? { bg: "#ccc" };
      if (getCardArtMode() === 2) {
        const hex = cc.bg.replace("#", "");
        const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
      }
      ctx.fillRect(0, 0, w, h * 0.25);
      // Footer band
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, h - h * 0.22, w, h * 0.22);
      el.style.background = "none";
      el.style.color = "#fff";
      el.insertBefore(c, el.firstChild);
      // Elevate header/body above sprite canvas
      el.querySelectorAll(".confirmCardHeader, .confirmCardBody").forEach(ch => {
        ch.style.position = "relative";
        ch.style.zIndex = "1";
      });
      // White text with shadow for readability
      el.querySelector(".confirmCardPoints")?.style.setProperty("text-shadow", "0 1px 3px rgba(0,0,0,0.7)");
    }
  });
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

// Track whether we have sized the canvas at least once with game state
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
      uiState.remoteCursors  = {};

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
      updateResourceBanner();
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

      // Join/leave sounds — compare occupied client IDs
      const newIds = new Set(
        (msg.clients ?? []).filter(c => c.occupied).map(c => c.clientId)
      );
      if (prevClientIds.size > 0) { // skip initial load
        for (const id of newIds) {
          if (!prevClientIds.has(id)) sfx.join();
        }
        for (const id of prevClientIds) {
          if (!newIds.has(id)) sfx.leave();
        }
      }
      prevClientIds = newIds;

      if (!msg.started) {
        setScene("roomLobby");
      }
      updateStatusBar();
      updateResourceBanner();
      updateWaitingRoom();
      draw();
      return;
    }

    if (msg.type === "STATE" && msg.roomId === currentRoomId) {
      prevState = state;
      state = msg.state;
      playSoundsForStateChange(prevState, state);
      if (state !== null) setScene("game");
      updateStatusBar();
      updateResourceBanner();
      if (!didInitialResize) resize();
      else draw();
      return;
    }

    // If server rejects moves, log clearly
    if (msg.type === "REJECTED") {
      console.warn("[server rejected]", msg.reason, msg);
    }

    // Remote cursor relay
    if (msg.type === "CURSOR") {
      const clients = uiState.room?.clients ?? [];
      const spectators = uiState.room?.spectators ?? [];
      const slot = clients.find(c => c.clientId === msg.clientId);
      const spec = !slot && spectators.find(s => s.clientId === msg.clientId);
      const seatColors = ["#2D6CDF", "#D94A4A", "#2E9B5F", "#D6B04C"];
      uiState.remoteCursors[msg.clientId] = {
        x: msg.x,
        y: msg.y,
        ts: Date.now(),
        color: slot ? seatColors[slot.seat] : "#aaa",
        name: slot?.name ?? spec?.name ?? "",
      };
      draw();
      return;
    }

    // Chat message from another player (or self echo)
    if (msg.type === "MSG") {
      chatMessages.push(msg);
      if (chatMessages.length > 100) chatMessages.shift();
      if (chatOpen) {
        renderChatMessages();
      } else {
        chatUnreadCount++;
        updateChatBadge();
        showChatToast(msg);
      }
      return;
    }

    // Chat history on join/rejoin
    if (msg.type === "CHAT_HISTORY") {
      chatMessages = msg.messages ?? [];
      if (chatOpen) renderChatMessages();
      return;
    }
  },

  onOpen:  () => {
    if (DEBUG) console.log("[ws] open");
    updateConnStatus(true);
    const n = cleanName(nameInput.value);
    if (n) transport.sendRaw({ type: "IDENTIFY", name: n });
  },
  onClose: () => {
    if (DEBUG) console.log("[ws] close");
    if (!currentRoomId) updateConnStatus(false);
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

function handleCreateGame() {
  const currentName = cleanName(nameInput.value);
  if (!currentName) {
    nameHint.textContent = "Please enter your name first.";
    return;
  }
  uiState.myName = currentName;
  transport.setName(currentName);
  transport.sendRaw({ type: "CREATE_GAME", name: currentName, sessionId: mySessionId });
}

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
   Options menu
   --------------------------------------------------------- */

function updateCardArtIndicator() {
  cardArtIndicator.dataset.mode = cardArtPref;
  cardArtIndicator.textContent = cardArtPref === 0 ? "" : String(cardArtPref);
}

// Set initial checkbox state from saved preferences
optSound.checked   = soundEnabled;
updateCardArtIndicator();
optCursors.checked = cursorsPref;
optChat.checked    = chatPref;
optResources.checked = simplifiedPref;
optLightMode.checked = lightModePref;
optGrannyMode.checked = grannyModePref;

optionsBtn.addEventListener("click", () => {
  optionsDropdown.classList.toggle("hidden");
});

document.addEventListener("pointerdown", (e) => {
  if (!optionsDropdown.classList.contains("hidden")
      && !document.getElementById("optionsMenu").contains(e.target)) {
    optionsDropdown.classList.add("hidden");
  }
});

optSound.addEventListener("change", () => {
  soundEnabled = optSound.checked;
  sfx.enabled = soundEnabled;
  localStorage.setItem("trevdor.sound", soundEnabled);
});

optCardArtToggle.addEventListener("click", () => {
  cardArtPref = (cardArtPref + 1) % 3;
  setCardArtMode(cardArtPref);
  localStorage.setItem("trevdor.cardArt", cardArtPref);
  updateCardArtIndicator();
  draw();
});

optCursors.addEventListener("change", () => {
  cursorsPref = optCursors.checked;
  uiState.showCursors = cursorsPref;
  localStorage.setItem("trevdor.cursors", cursorsPref);
  draw();
});

optChat.addEventListener("change", () => {
  chatPref = optChat.checked;
  localStorage.setItem("trevdor.chat", chatPref);
  // Show/hide only when in a scene that allows chat
  if (currentRoomId) {
    chatPanel.classList.toggle("hidden", !chatPref);
  }
  if (!chatPref && chatOpen) closeChat();
});

optResources.addEventListener("change", () => {
  simplifiedPref = optResources.checked;
  uiState.simplifiedView = simplifiedPref;
  localStorage.setItem("trevdor.simplified", simplifiedPref);
  if (!simplifiedPref) uiState.panelViewPlayerIndex = null; // reset panel view when leaving simplified
  uiState.cameraUserAdjusted = false;
  updateResourceBanner();   // update banner visibility before resize measures it
  resize();
});

optLightMode.addEventListener("change", () => {
  lightModePref = optLightMode.checked;
  uiState.lightMode = lightModePref;
  localStorage.setItem("trevdor.lightMode", lightModePref);
  document.body.classList.toggle("lightMode", lightModePref);
  draw();
});

optGrannyMode.addEventListener("change", () => {
  grannyModePref = optGrannyMode.checked;
  uiState.grannyMode = grannyModePref;
  localStorage.setItem("trevdor.grannyMode", grannyModePref);
  draw();
});

/* ---------------------------------------------------------
   Chat panel events
   --------------------------------------------------------- */

chatToggleBtn.addEventListener("click", () => {
  if (chatOpen) closeChat();
  else openChat();
});

chatSendBtn.addEventListener("click", sendChatMessage);

chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation(); // prevent game hotkeys while typing
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

chatToast.addEventListener("click", () => openChat());

// Close chat when clicking outside chatPanel
document.addEventListener("pointerdown", (e) => {
  if (chatOpen && !chatPanel.contains(e.target)) closeChat();
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
  onAction: (uiAction) => {
    // In panel view, clicking anything that isn't a reserved card exits back to board
    if (uiAction.type === "click" && uiState.panelViewPlayerIndex != null) {
      if (!uiAction.hit || uiAction.hit.kind !== "reserved") {
        togglePanelView(uiState.panelViewPlayerIndex); // toggle off
        return;
      }
    }
    controller.onUIAction(uiAction);
  },
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
  if (state) didInitialResize = true;

  uiState.simplifiedView = simplifiedPref;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);

  renderer.resize({ width: rect.width, height: rect.height, dpr }, uiState);

  // Auto-zoom: fit relevant content into viewport
  const bounds = renderer.getBounds();
  if (bounds && !uiState.cameraUserAdjusted) {
    let rects;
    if (uiState.simplifiedView) {
      if (uiState.panelViewPlayerIndex != null && bounds.panelRects) {
        // Panel view: zoom to the viewed player's panel
        const REVERSE_MAP = [2, 0, 3, 1]; // playerIndex → positionIndex
        const posIdx = REVERSE_MAP[uiState.panelViewPlayerIndex];
        rects = [bounds.panelRects[posIdx]];
      } else {
        // Normal simplified: center on the board only (nobles → tokens)
        rects = [bounds.boardRect];
      }
    } else {
      const numPlayers = state?.players?.length ?? 0;
      // Compute tight bounding box of board + visible panels only
      // Fixed layout: posIdx 0=top-right(P2), 1=bottom-right(P4), 2=top-left(P1), 3=bottom-left(P3)
      const fixedMap = [1, 3, 0, 2];
      rects = [bounds.boardRect];
      if (bounds.panelRects) {
        for (let posIdx = 0; posIdx < 4; posIdx++) {
          if (fixedMap[posIdx] < numPlayers) {
            rects.push(bounds.panelRects[posIdx]);
          }
        }
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

    // Reserve space for fixed overlays so they don't cover the board
    const topH = (statusBar && !statusBar.classList.contains("hidden"))
      ? (statusBar.offsetHeight || 30) : 0;
    let bottomH = 0;
    if (resourceBanner && !resourceBanner.classList.contains("hidden")) {
      bottomH = resourceBanner.offsetHeight || 0;
    }

    const viewW = rect.width;
    // In simplified view, let the board fill the screen (cap at 2.5 for ultra-wide);
    // in normal view, never zoom beyond native scale (cap at 1).
    const maxScale = uiState.simplifiedView ? 2.5 : 1;

    // Two-pass stabilization: --btp changes banner height which changes fitScale.
    // Re-measure once after applying the new --btp so sizes converge.
    let fitScale, boardTokenPx;
    for (let pass = 0; pass < 2; pass++) {
      const usableH = rect.height - topH - bottomH;
      const scaleX = viewW / contentW;
      const scaleY = usableH / contentH;
      fitScale = Math.min(scaleX, scaleY, maxScale);
      boardTokenPx = Math.round(45 * fitScale);
      resourceBanner.style.setProperty("--btp", boardTokenPx + "px");

      const newBottomH = (resourceBanner && !resourceBanner.classList.contains("hidden"))
        ? (resourceBanner.offsetHeight || 0) : 0;
      if (Math.abs(newBottomH - bottomH) <= 2) break;
      bottomH = newBottomH;
    }

    // Center content in the usable area (below status bar, above banner)
    const usableH = rect.height - topH - bottomH;
    uiState.camera.scale = fitScale;
    uiState.camera.x = minX - (viewW / fitScale - contentW) / 2;
    uiState.camera.y = (minY + contentH / 2) - (topH + usableH / 2) / fitScale;
  }

  drawNow(); // synchronous — canvas was just cleared by dimension change
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);

// Load card sprite sheet (non-blocking — cards use flat color fallback until loaded)
loadSpriteSheet(basePath).then(() => draw());

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

/* ---------------------------------------------------------
   Remote cursor broadcast
   --------------------------------------------------------- */

const CURSOR_THROTTLE = 100; // ms between sends
const CURSOR_DEAD_ZONE = 2; // px screen-space movement threshold
let lastCursorSent = 0;
let lastCursorSx = 0;
let lastCursorSy = 0;

canvas.addEventListener("pointermove", (e) => {
  if (!currentRoomId || !state) return;
  const now = Date.now();
  if (now - lastCursorSent < CURSOR_THROTTLE) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const dx = sx - lastCursorSx;
  const dy = sy - lastCursorSy;
  if (dx * dx + dy * dy < CURSOR_DEAD_ZONE * CURSOR_DEAD_ZONE) return;
  lastCursorSent = now;
  lastCursorSx = sx;
  lastCursorSy = sy;
  const w = screenToWorld(uiState.camera, sx, sy);
  transport.sendRaw({ type: "CURSOR", roomId: currentRoomId, x: w.x, y: w.y });
});

// Periodically re-render dots so the idle (>1 min) color transition
// fires without needing a new server event.
// Also prune stale remote cursors (>3s with no update).
setInterval(() => {
  updateStatusBar();
  updateResourceBanner();
  updateWaitingRoom();
  updateGameLobby();
  const now = Date.now();
  let pruned = false;
  for (const id in uiState.remoteCursors) {
    if (now - uiState.remoteCursors[id].ts > 3000) {
      delete uiState.remoteCursors[id];
      pruned = true;
    }
  }
  if (pruned) draw();
}, 15_000);
