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
{ type: "READY",      roomId }          // toggles ready state for sender's seat
{ type: "ACTION",     roomId, action: { type, ...payload } }
{ type: "PING",       roomId }          // throttled heartbeat for activity tracking
{ type: "RESET_GAME", roomId }          // debug only
{ type: "SAY",        text }            // debug chat broadcast
```
**Server → Client**
```
{ type: "WELCOME", roomId, clientId, playerIndex, sessionId }
{ type: "ROOM",    roomId, clients: [{seat, clientId, name, occupied, wsOpen, lastActivity}], ready: [bool,bool,bool,bool], started: bool }
{ type: "STATE",   roomId, version, state }
{ type: "REJECTED",roomId, reason, ...details }
{ type: "ERROR",   message }
{ type: "MSG",     from, text }
```
`playerIndex` === `seatIndex` (0–3). They are the same value in the current implementation — seat 0 is player 0, seat 1 is player 1, etc.

## Decisions Made — Read Before Touching

### Lobby and ready system
The lobby is fully implemented. `getRoom()` sets `state: null`, `started: false`, `ready: [false,false,false,false]`. Game state is never created on join — it is only created when all occupied seats (minimum 2) toggle ready via the `READY` message. `joinRoom()` no longer auto-starts the game. The `READY` handler toggles `room.ready[seat]`, checks if all occupied seats are ready, and if so calls `initialState(N)` and sets `started: true`, then broadcasts STATE to all clients.

### Seat compaction on leave (pre-game only)
When a player leaves during the lobby (`!room.started`), `compactSeats()` is called. It packs remaining players into consecutive seats starting at 0, resets all ready flags, updates `clientInfo.playerIndex` and session data for moved players, and sends each moved player a new WELCOME with their updated `playerIndex`. This ensures `initialState(N)` player indices always match the seated `playerIndex` values.

### Session persistence for reconnect
`sessions` Map on the server: `sessionId → { roomId, seatIndex, name }`. The server generates a random `sessionId` and sends it in `WELCOME`. The client stores it in `localStorage("trevdor.sessionId")` and sends it back on every JOIN (including auto-reconnects). `assignSeat()` checks the session first and reclaims the saved seat if it's still empty. This means a player who drops and reconnects gets their original seat back.

### `uiState.myPlayerIndex` must be a number
The controller in `controller.js` checks `typeof my === "number"` to gate turns. It must be set from the server's `WELCOME` message (`msg.playerIndex`). There was a bug (now fixed) where a stale line `uiState.myPlayerIndex = () => myPlayerIndex` overwrote the correct server-assigned value with a broken function. That line is gone — do not re-introduce it.

### `hotSeat: true` is intentional
`state.hotSeat = true` (set in `engine/state.js`) disables server-side turn enforcement. This allows a single machine to play all seats for testing. The server's ACTION handler checks `if (actorIndex !== active && !room.state.hotSeat)`. Keep this until proper multi-device testing is established.

### RESET_GAME returns all clients to the waiting room
The reset button sends `RESET_GAME` to the server. The server sets `room.state = null`, `room.started = false`, `room.ready = [false,false,false,false]`, and broadcasts ROOM. The client's ROOM handler checks `msg.started` — if false, it sets `state = null` and calls `setScene("waiting")`. This means all clients (not just the one who pressed reset) transition back to the waiting room. Connections are NOT closed. The `closeAllClients()` function still exists in server.js but is no longer called.

### `broadcastState()` is a no-op when state is null
Guard added: `if (!room || !room.state) return`. This prevents broadcasting null state to already-connected clients while waiting for the 2nd player to join.

## What's Next
- Replace the debug reset button with proper end-of-game flow
- Gate `hotSeat` behind a dev flag once multi-device testing is stable
- Remove `engine/dispatch.js` (unused legacy code)
- Gate the ~34 `console.log` calls behind a debug flag

## Status Indicators
Each seat has a `.playerDot` (10px circle) that encodes two dimensions independently:
- **Fill color** = WebSocket connection status: `#4caf50` green (active ≤1min), `#ffd700` yellow (idle >1min), `#e53935` red (disconnected), `#444` grey (empty)
- **Pulse animation** = active turn (game only) — a white ripple regardless of fill color, so a disconnected player on their turn shows a pulsing red dot

Activity tracking: the client sends a throttled `PING` via `reportActivity()` on mousemove/click/touchstart. Two-speed throttle: immediate if idle >60s (snappy idle→active transition), 15s otherwise. The server broadcasts ROOM on every PING so all clients get fresh `lastActivity` timestamps. A 15s `setInterval` re-renders dots for the active→idle transition.

The same `.playerDot` class is used in both the waiting room roster and the status bar. Ready state in the waiting room is shown as a separate `✓` text label, not the dot.

## Status Bar
A fixed HTML overlay (`#statusBar` in `index.html`) shows all 4 seat slots, whose turn it is (pulsing dot), and the turn number. It is:
- Hidden in the lobby/waiting scene, shown in the game scene via `setScene()`
- Updated by `updateStatusBar()` in `trevdor.js` on every WELCOME, ROOM, and STATE message
- `pointer-events: none` so it never blocks canvas interaction
- Intentionally HTML (not canvas) for simplicity — migrating to canvas later is straightforward since `updateStatusBar()` is self-contained

## Known Technical Debt (Do Not "Fix" Without Discussion)
- `public/ui/rules.js` duplicates server validation logic and can drift out of sync. Exists for UI feedback only. Flagged for future removal.
- `engine/dispatch.js` is unused legacy code. Safe to delete eventually.
- ~34 `console.log` calls scattered throughout — intentional during development, not yet gated behind a debug flag.
- The reset button and its `RESET_GAME` message path are explicitly temporary debug tooling. Leave them in place until proper end-of-game flow is implemented.
- `public/ui/rules.js` client rules are not used for server validation — the server always has final say.

## Known Bugs — To Fix
- **Mobile connection intermittently fails on initial load.** Some mobile browsers don't establish the WebSocket connection right away. Clicking out of and back into the browser sometimes resolves it, suggesting the browser may be suspending the tab or throttling network activity before the connection is established. Root cause not yet confirmed — needs console logging on a mobile device to determine whether the socket is failing to open, closing immediately, or connecting but not sending JOIN. Investigate before fixing.

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
