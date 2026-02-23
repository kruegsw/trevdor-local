// public/net/transport.js
// Lightweight WebSocket transport for Trevdor.
// - connects on page load (no auto-join)
// - joinRoom(roomId) / leaveRoom() drive room membership explicitly
// - auto-rejoins currentRoomId on WS reconnect (for mid-game drops)

export function createTransport({
  url = "ws://localhost:8787",
  name = "player",
  sessionId = null,
  onMessage = () => {},
  onOpen = () => {},
  onClose = () => {},
  onError = () => {},
  reconnect = true,
  reconnectDelayMs = 500,
  connectTimeoutMs = 5000,
} = {}) {
  let ws = null;
  let closedByUser = false;
  let currentRoomId = null; // set by joinRoom(); cleared by leaveRoom()
  let connectTimer = null;
  let generation = 0; // increments on each connect(); stale sockets ignore their close handler
  let retryCount = 0; // tracks consecutive failures for backoff

  function connect() {
    const gen = ++generation;
    clearTimeout(connectTimer);

    // Abandon any previous socket without triggering its reconnect logic
    // (the generation check in the close handler will skip it).
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }

    ws = new WebSocket(url);

    // If the socket is still CONNECTING after the timeout, kill it and retry.
    // This catches mobile browsers that throttle network during page load.
    connectTimer = setTimeout(() => {
      if (gen === generation && ws && ws.readyState === 0) {
        try { ws.close(); } catch {}
      }
    }, connectTimeoutMs);

    ws.addEventListener("open", () => {
      if (gen !== generation) return;
      clearTimeout(connectTimer);
      retryCount = 0;
      // Auto-rejoin on reconnect: if we have a currentRoomId (e.g. mid-game
      // WS drop), send JOIN immediately so the server restores our session.
      if (currentRoomId) {
        const joinMsg = { type: "JOIN", roomId: currentRoomId, name };
        if (sessionId) joinMsg.sessionId = sessionId;
        sendRaw(joinMsg);
      }
      onOpen();
    });

    ws.addEventListener("message", (e) => {
      if (gen !== generation) return;
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        onMessage({ type: "RAW", data: e.data });
        return;
      }
      onMessage(msg);
    });

    ws.addEventListener("close", () => {
      if (gen !== generation) return; // stale socket — a new connect() already took over
      clearTimeout(connectTimer);
      onClose();
      if (!closedByUser && reconnect) {
        // Fast retries at first (100ms), then back off to reconnectDelayMs
        const delay = retryCount < 5 ? 100 : reconnectDelayMs;
        retryCount++;
        setTimeout(connect, delay);
      }
    });

    ws.addEventListener("error", (err) => {
      if (gen !== generation) return;
      onError(err);
      // close event will follow
    });
  }

  // Joins a specific room. Stores roomId for auto-rejoin after WS drops.
  function joinRoom(roomId) {
    currentRoomId = roomId;
    const joinMsg = { type: "JOIN", roomId, name };
    if (sessionId) joinMsg.sessionId = sessionId;
    return sendRaw(joinMsg);
  }

  // Leaves the current room. Clears roomId so auto-reconnect won't rejoin.
  function leaveRoom() {
    sendRaw({ type: "LEAVE_ROOM" });
    currentRoomId = null;
  }

  function send(type, payload = {}) {
    return sendRaw({ type, ...payload });
  }

  function sendRaw(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  function isOpen() {
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  function close() {
    closedByUser = true;
    generation++; // prevent any pending reconnect
    clearTimeout(connectTimer);
    try { ws?.close(); } catch {}
  }

  // Mobile browsers can kill WebSockets during page refreshes or tab suspensions.
  // Multiple recovery strategies:
  // 1) visibilitychange — fires when switching back from another app
  // 2) pageshow — fires after bfcache restores and after refreshes on mobile Safari
  // 3) focus — fires when the browser window/tab regains focus
  if (typeof document !== "undefined") {
    function ensureConnected() {
      if (!closedByUser && (!ws || ws.readyState > 1)) {
        connect();
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") ensureConnected();
    });
    window.addEventListener("pageshow", ensureConnected);
    window.addEventListener("focus", ensureConnected);
  }

  function setSessionId(id) { sessionId = id; }
  function setName(n)       { name = n; }
  function setRoomId(id)    { currentRoomId = id; }
  function getRoomId()      { return currentRoomId; }

  return {
    connect,
    joinRoom,
    leaveRoom,
    send,
    sendRaw,
    isOpen,
    close,
    setSessionId,
    setName,
    setRoomId,
    getRoomId,
  };
}
