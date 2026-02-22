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
} = {}) {
  let ws = null;
  let closedByUser = false;
  let currentRoomId = null; // set by joinRoom(); cleared by leaveRoom()

  function connect() {
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
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
      onClose();
      if (!closedByUser && reconnect) {
        setTimeout(connect, reconnectDelayMs);
      }
    });

    ws.addEventListener("error", (err) => {
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
    try { ws?.close(); } catch {}
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
