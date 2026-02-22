# Trevdor — Claude Code Shift Notes

## What This Is
A multiplayer browser implementation of the board game Splendor. Players take tokens, reserve/buy gem cards, and accumulate prestige points. 2–4 players per game. Built with vanilla JS + HTML5 Canvas frontend and a Node.js WebSocket backend. No bundler, no framework — pure ES modules throughout.

## How to Run
```bash
node server/server.js   # serves HTTP + WebSocket on port 8787
# open http://localhost:8787 in browser
```
No build step. The server also serves all static files from `/public` and engine modules from `/engine` via `/engine/*`.

## Architecture in One Paragraph
The `/engine` directory is a pure, framework-agnostic game state machine shared between client and server. The server holds the **only authoritative game state**. Clients send action messages; the server validates them with `rulesCheck()`, applies them with `applyAction()` (a pure reducer), increments `room.version`, and broadcasts the full new state to all room clients. The client never mutates state locally — it waits for the server's STATE message. If the reducer returns the same state reference (no-op), the action is rejected.

## Key Files
| File | Role |
|---|---|
| `server/server.js` | HTTP + WebSocket server, room management, seat assignment, session persistence |
| `public/trevdor.js` | Client entry point — wires transport, UI events, controller, status bar |
| `public/net/transport.js` | WebSocket client with auto-reconnect |
| `public/ui/render.js` | All canvas drawing (~1350 lines) — do not refactor casually |
| `public/ui/controller.js` | Translates UI events → game actions, enforces turn gating |
| `public/ui/events.js` | Pointer/touch event handling, hit testing |
| `public/ui/state.js` | UI-only state (camera, hover, pending intent, identity) |
| `public/ui/intent.js` | Accumulates multi-step player intent (e.g. picking 3 tokens) |
| `engine/reducer.js` | Pure state transitions — returns same ref if action is invalid |
| `engine/rules.js` | Server-side validation (authoritative) |
| `engine/state.js` | `initialState(numberOfPlayers, gameID)` — creates fresh game |
| `engine/defs.js` | Card/noble/token definitions |
| `public/ui/rules.js` | Client-side validation mirror — NOT kept in sync with engine/rules.js, used only for UI feedback |

## WebSocket Protocol
**Client → Server**
```
{ type: "JOIN",       roomId, name, sessionId? }
{ type: "ACTION",     roomId, action: { type, ...payload } }
{ type: "RESET_GAME", roomId }          // debug only
{ type: "SAY",        text }            // debug chat broadcast
```
**Server → Client**
```
{ type: "WELCOME", roomId, clientId, playerIndex, sessionId }
{ type: "ROOM",    roomId, clients: [{seat, clientId, name, occupied}] }
{ type: "STATE",   roomId, version, state }
{ type: "REJECTED",roomId, reason, ...details }
{ type: "ERROR",   message }
{ type: "MSG",     from, text }
```
`playerIndex` === `seatIndex` (0–3). They are the same value in the current implementation — seat 0 is player 0, seat 1 is player 1, etc.

## Decisions Made — Read Before Touching

### Game state is created on the 2nd player joining (not at room creation)
`getRoom()` sets `state: null`. `joinRoom()` calls `initialState()` only when `occupiedCount >= 2`. This is **intentional scaffolding** for the upcoming lobby feature. In the final design, the lobby will determine player count (2–4) and a host "Start Game" action will trigger `initialState(N)`. The current auto-start-at-2 is a temporary bridge, not a permanent design. Do not change this to hardcode a player count.

### Session persistence for reconnect
`sessions` Map on the server: `sessionId → { roomId, seatIndex, name }`. The server generates a random `sessionId` and sends it in `WELCOME`. The client stores it in `localStorage("trevdor.sessionId")` and sends it back on every JOIN (including auto-reconnects). `assignSeat()` checks the session first and reclaims the saved seat if it's still empty. This means a player who drops and reconnects gets their original seat back.

### `uiState.myPlayerIndex` must be a number
The controller in `controller.js` checks `typeof my === "number"` to gate turns. It must be set from the server's `WELCOME` message (`msg.playerIndex`). There was a bug (now fixed) where a stale line `uiState.myPlayerIndex = () => myPlayerIndex` overwrote the correct server-assigned value with a broken function. That line is gone — do not re-introduce it.

### `hotSeat: true` is intentional
`state.hotSeat = true` (set in `engine/state.js`) disables server-side turn enforcement. This allows a single machine to play all seats for testing. The server's ACTION handler checks `if (actorIndex !== active && !room.state.hotSeat)`. Keep this until proper multi-device testing is established.

### RESET_GAME resets state, not connections
The reset button sends `RESET_GAME` to the server. The server now correctly resets `room.state` and `room.version` and rebroadcasts — it does NOT close WebSocket connections. The `closeAllClients()` function still exists in server.js but is no longer called from RESET_GAME.

### `broadcastState()` is a no-op when state is null
Guard added: `if (!room || !room.state) return`. This prevents broadcasting null state to already-connected clients while waiting for the 2nd player to join.

## What's Next — The Lobby Feature
The next major feature is a proper pre-game lobby. Design intent:
- Players join a room and see a waiting screen with a roster
- A host (first player) picks the player count (2–4) and clicks "Start Game"
- Server receives a new `START_GAME` message, calls `initialState(N, roomId)`, and transitions all clients to the game
- The current auto-start-at-2 in `joinRoom()` should be removed once this is in place
- The `uiState.room` object (set from ROOM messages) already carries `started`, `ready`, `playerCount` fields — these were added in anticipation of the lobby

The HTML lobby scene (`#lobbyScene`) in `index.html` is the entry point. The "Enter Game" button currently connects immediately and goes straight to the canvas. The lobby flow should be expanded to a waiting room before showing the canvas.

## Status Bar
A fixed HTML overlay (`#statusBar` in `index.html`) shows all 4 seat slots, whose turn it is (gold dot + highlight), and the turn number. It is:
- Hidden in the lobby scene, shown in the game scene via `setScene()`
- Updated by `updateStatusBar()` in `trevdor.js` on every WELCOME, ROOM, and STATE message
- `pointer-events: none` so it never blocks canvas interaction
- Intentionally HTML (not canvas) for simplicity — migrating to canvas later is straightforward since `updateStatusBar()` is self-contained

## Known Technical Debt (Do Not "Fix" Without Discussion)
- `public/ui/rules.js` duplicates server validation logic and can drift out of sync. Exists for UI feedback only. Flagged for future removal.
- `engine/dispatch.js` is unused legacy code. Safe to delete eventually.
- ~34 `console.log` calls scattered throughout — intentional during development, not yet gated behind a debug flag.
- The reset button and its `RESET_GAME` message path are explicitly temporary debug tooling. Leave them in place until the lobby/game-flow is complete.
- `public/ui/rules.js` client rules are not used for server validation — the server always has final say.

## Engine Quick Reference
```javascript
// Create fresh game
initialState(numberOfPlayers, gameID)  // 2–4 players

// Apply an action (pure — returns same ref if invalid)
applyAction(state, action)

// Validate before applying
rulesCheck(state, action)  // returns { valid: bool, reason?: string }

// Action types (from engine/actions.js)
TAKE_TOKENS   // { tokens: { color: count, ... } }
RESERVE_CARD  // { card }
BUY_CARD      // { card }
END_TURN      // (usually automatic after above)
```

## Token Colors
`white` `blue` `green` `red` `black` `yellow` (yellow = gold wild, only gained by reserving)
