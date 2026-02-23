# Trevdor — Claude Code Shift Notes

## What This Is
A multiplayer browser implementation of the board game Splendor. Players take tokens, reserve/buy gem cards, and accumulate prestige points. 2–4 players per game. Built with vanilla JS + HTML5 Canvas frontend and a Node.js WebSocket backend. No bundler, no framework — pure ES modules throughout.

## How to Run
```bash
node server/server.js   # serves HTTP + WebSocket on port 8787
# open http://localhost:8787 in browser
```
No build step. The server serves static files from `/public` and engine modules from `/engine` via `/engine/*`. For remote deployment behind Apache reverse proxy, see `public/DEPLOY.md`.

## Architecture in One Paragraph
The `/engine` directory is a pure, framework-agnostic game state machine shared between client and server. The server holds the **only authoritative game state**. Clients send action messages; the server validates them with `rulesCheck()`, applies them with `applyAction()` (a pure reducer), increments `room.version`, and broadcasts the full new state to all room clients. The client never mutates state locally — it waits for the server's STATE message. If the reducer returns the same state reference (no-op), the action is rejected.

## Key Files
| File | Role |
|---|---|
| `server/server.js` | HTTP + WebSocket server, room management, seat assignment, session persistence, room TTL cleanup |
| `public/trevdor.js` | Client entry point — wires transport, UI events, controller, status bar, lobby UI |
| `public/net/transport.js` | WebSocket client with auto-reconnect, generation counter, mobile recovery |
| `public/debug.js` | Exports `DEBUG` flag from `?debug` URL param |
| `public/ui/render.js` | All canvas drawing (~1350 lines) — do not refactor casually |
| `public/ui/controller.js` | Translates UI events → game actions, enforces turn gating + game-over block |
| `public/ui/events.js` | Pointer/touch event handling, hit testing |
| `public/ui/state.js` | UI-only state (camera, hover, pending intent, identity, lobby data) |
| `public/ui/intent.js` | Accumulates multi-step player intent (e.g. picking 3 tokens) |
| `public/ui/layout.js` | Canvas geometry computation (card positions, panels, scaling) |
| `public/ui/camera.js` | Zoom/pan camera with clamping |
| `public/ui/handlers/handleClick.js` | Click → intent mutations (token selection, card selection, confirm/cancel) |
| `public/ui/handlers/handleHover.js` | Hover → UI state (highlights, player panel switching) |
| `public/ui/rules.js` | Client-side validation mirror (see "Client-side rules.js" below) |
| `engine/reducer.js` | Pure state transitions — returns same ref if action is invalid |
| `engine/rules.js` | Authoritative validation (server-side) |
| `engine/actions.js` | Action builder functions (TAKE_TOKENS, RESERVE_CARD, BUY_CARD, END_TURN) |
| `engine/state.js` | `initialState(numberOfPlayers, gameID)` — creates fresh game |
| `engine/defs.js` | Card/noble/token definitions (full Splendor base set) |
| `public/DEPLOY.md` | Deployment guide for Ubuntu + Apache reverse proxy |

## WebSocket Protocol
**Client → Server**
```
{ type: "JOIN",        roomId, name, sessionId? }
{ type: "CREATE_GAME", name, sessionId? }
{ type: "LEAVE_ROOM",  roomId }
{ type: "READY",       roomId }          // toggles ready state for sender's seat
{ type: "ACTION",      roomId, action: { type, ...payload } }
{ type: "RENAME_ROOM", roomId, name }    // host only
{ type: "CLOSE_ROOM",  roomId }          // host only — evicts all clients, deletes room
{ type: "IDENTIFY",    name }            // set display name before joining any room
{ type: "PING",        roomId }          // throttled heartbeat for activity tracking
{ type: "SAY",         text }            // debug chat broadcast
```
**Server → Client**
```
{ type: "WELCOME",        roomId, clientId, playerIndex, sessionId }
{ type: "ROOM",           roomId, clients: [{seat, clientId, name, occupied, wsOpen, lastActivity}], ready: [...], started }
{ type: "STATE",          roomId, version, state }
{ type: "ROOM_LIST",      rooms: [...], users: [...], yourClientId }
{ type: "ROOM_NOT_FOUND", roomId }
{ type: "REJECTED",       roomId, reason, ...details }
{ type: "ERROR",          message }
{ type: "MSG",            from, text }
```
`playerIndex` === `seatIndex` (0–3). Seat 0 is player 0, seat 1 is player 1, etc. If all 4 seats are full, additional clients join as spectators (`playerIndex: -1`).

## Decisions Made — Read Before Touching

### Game lobby and connected users
The game lobby shows all open rooms (with Join/Watch/Resume buttons) and all connected users with status dots and location. `ROOM_LIST` messages include a `users` array from `connectedUsersSnapshot()` and a `yourClientId` field. The client sends `IDENTIFY` on WebSocket open so the server knows the player's saved name before they join a room. The lobby re-renders on a 15-second interval so idle dot transitions appear without a server event.

### Room lobby and ready system
`getRoom()` creates rooms with `state: null`, `started: false`, `ready: [false,false,false,false]`. Game state is only created when all occupied seats (minimum 2) toggle ready via `READY`. The host (room creator) can rename the room via `RENAME_ROOM` and close it via `CLOSE_ROOM`. The host sees a "Close Room" button; the room name is editable in the UI header.

### Seat compaction on leave (pre-game only)
When a player leaves during the lobby (`!room.started`), `compactSeats()` packs remaining players into consecutive seats starting at 0, resets all ready flags, updates `clientInfo.playerIndex` and session data, and sends each moved player a new WELCOME with their updated `playerIndex`.

### Session persistence for reconnect
`sessions` Map on the server: `sessionId → { roomId, seatIndex, name }`. The server generates a random `sessionId` and sends it in `WELCOME`. The client stores it in `localStorage("trevdor.sessionId")` and sends it back on every JOIN. `assignSeat()` checks the session first and reclaims the saved seat if it's empty, if the old ws was cleaned up, or if the occupant has the same sessionId (stale ws from a page refresh whose close event hasn't fired yet).

### "Previous room" persistence for Resume button
When a player leaves a started game via "← Lobby", `myPreviousRoomId` and `myPreviousRoomIsHost` are persisted to `localStorage` (keys `trevdor.previousRoomId`, `trevdor.previousRoomIsHost`). This allows the lobby to show "Resume" instead of "Watch" for the player's own game, even after a page refresh. All writes go through `setPreviousRoom(roomId, isHost)` in `trevdor.js`. Values are cleared on WELCOME, ROOM_NOT_FOUND, ROOM_LIST (if room gone), or when creating a new game.

### `uiState.myPlayerIndex` must be a number
The controller checks `typeof my === "number"` to gate turns. It must be set from the server's `WELCOME` message (`msg.playerIndex`). Do not overwrite it with a function or other type.

### `hotSeat` is gated behind DEBUG
`state.hotSeat` defaults to `false` in `engine/state.js`. The server sets it to `true` only when `DEBUG=1` env var is set. This disables server-side turn enforcement so a single machine can play all seats for testing. The server's ACTION handler checks `if (actorIndex !== active && !room.state.hotSeat)`. The client-side click handler in `handleClick.js` also reads `state.hotSeat` to allow switching the viewed player panel.

### `broadcastState()` is a no-op when state is null
Guard: `if (!room || !room.state) return`. Prevents broadcasting null state while waiting for players.

### End-of-game detection
The reducer in `engine/reducer.js` implements Splendor's end-of-game rules:
- **15 prestige threshold**: After each turn-ending action, the reducer checks if the active player has ≥15 prestige (cards + nobles). If so, `state.finalRound = true`.
- **Complete the round**: The game continues until `activePlayerIndex` wraps back to 0, so all players get equal turns.
- **Game over**: When `finalRound` is true and `activePlayerIndex` returns to 0, `state.gameOver = true` and `state.winner` is set to the winning player index.
- **Winner determination**: `determineWinner()` picks the player with the highest prestige. Tiebreak: fewest purchased cards (per Splendor rules).
- **Action rejection**: Once `state.gameOver` is true, `applyAction()` returns `prev` (no-op) for all further actions.

**Client-side display:**
- Status bar shows "Winner: [name] (Xpt)" in gold when `gameOver`, "Final Round!" in orange when `finalRound`.
- Canvas draws a semi-transparent overlay with the winner's name and prestige points.
- Controller blocks clicks when `gameOver` but allows hover so players can still inspect the board.
- Games remain on the server after ending. Players can navigate to the lobby via the "← Lobby" button. Rooms are cleaned up by the 24-hour TTL.

### Token limit enforcement
`engine/rules.js` enforces a 10-token maximum. TAKE_TOKENS is rejected if `currentTokens + newTokens > 10`. This is preventative — the action is simply not allowed rather than requiring a return-tokens step.

### Room TTL cleanup
The server runs an hourly interval that deletes rooms older than 24 hours and cleans up associated sessions.

### Client-side rules.js
`public/ui/rules.js` is a separate copy of validation logic used only for client-side UI feedback (e.g. graying out invalid token selections). It is intentionally separate from `engine/rules.js` because the client cannot directly import from the engine folder's rules module due to deployment path resolution constraints (see `public/DEPLOY.md` subpath notes). The server always has final say — this client copy exists purely for responsive UI.

## Debug Mode
- **Server**: Set `DEBUG=1` env var. Enables verbose logging, sets `hotSeat=true` on new games.
- **Client**: Add `?debug` to the URL. Enables console logging throughout UI code. Flag exported from `public/debug.js`.

## Status Indicators
Each seat has a `.playerDot` (10px circle) that encodes two dimensions independently:
- **Fill color** = WebSocket connection status: `#4caf50` green (active ≤1min), `#ffd700` yellow (idle >1min), `#e53935` red (disconnected), `#444` grey (empty)
- **Pulse animation** = active turn (game only) — a white ripple regardless of fill color, so a disconnected player on their turn shows a pulsing red dot

Activity tracking: the client sends a throttled `PING` via `reportActivity()` on mousemove/click/touchstart. Two-speed throttle: immediate if idle >60s (snappy idle→active transition), 15s otherwise. The server broadcasts ROOM on every PING so all clients get fresh `lastActivity` timestamps. A 15s `setInterval` re-renders dots for the active→idle transition.

The same `.playerDot` class is used in the waiting room roster, the status bar, and the game lobby connected users list.

## Status Bar
A fixed HTML overlay (`#statusBar` in `index.html`) shows all 4 seat slots with prestige/gems/tokens, whose turn it is (pulsing dot), spectators, turn number, final round notice, and winner. It is:
- Hidden in the lobby/waiting scene, shown in the game scene via `setScene()`
- Updated by `updateStatusBar()` in `trevdor.js` on every WELCOME, ROOM, and STATE message
- `pointer-events: none` so it never blocks canvas interaction (except the "← Lobby" button which has `pointer-events: auto`)
- Intentionally HTML (not canvas) for simplicity

### Mobile WebSocket reconnect strategy
Mobile Safari kills WebSocket connections on page refresh (close code 1001 "Going Away") while still fetching the new page's JS modules. The new page's `transport.connect()` then fails repeatedly because the browser hasn't finished its page transition. Fixed with a multi-layered approach in `transport.js` and `trevdor.js`:
- **Generation counter** in `transport.js` — each `connect()` call increments a counter; stale sockets' close handlers are ignored, preventing an infinite connect/disconnect loop.
- **Deferred connect** — `transport.connect()` is called from the `load` event (not during module evaluation) so the browser has finished tearing down the old page.
- **3-second safety net** — a `setTimeout` in `trevdor.js` calls `transport.connect()` if still not connected after 3s, catching cases where the `load`-event connect gets killed.
- **Recovery listeners** in `transport.js` — `visibilitychange`, `pageshow`, and `focus` events all trigger reconnect if the socket is dead, so switching apps and back always recovers.
- **Fast initial retries** — first 5 reconnect attempts use 100ms delay instead of the normal 500ms, for snappy recovery.
- **"Connecting…" indicator** — the lobby subtitle (`#connStatus`) shows "Connecting…" while disconnected, switching to "Game Lobby" on open. Desktop and iPad are unaffected; the issue is specific to mobile phone browsers.

## Dead Code to Clean Up
- `closeAllClients()` in `server/server.js` (line ~472) — defined but never called. Legacy from a removed RESET_GAME feature. Safe to delete.
- `public/actions.js` — a copy of `engine/actions.js` that nothing imports. The client imports actions via the `/engine/*` server route instead. Safe to delete.

## What's Next
- Mobile UX — canvas layout and interaction for small screens
- Post-game flow — "Play Again" or "New Game" button after game ends (currently players use "← Lobby")

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

// End-of-game state fields (set by reducer)
state.finalRound  // true once any player reaches ≥15 prestige
state.gameOver    // true when final round completes (activePlayerIndex wraps to 0)
state.winner      // index of winning player (set when gameOver becomes true)
```

## Token Colors
`white` `blue` `green` `red` `black` `yellow` (yellow = gold wild, only gained by reserving)
