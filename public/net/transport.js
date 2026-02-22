// client/net/transport.js
// Lightweight WebSocket transport for Trevdor.
// - connects to ws server
// - joins a room
// - JSON message send/receive
// - optional reconnect

export function createTransport({
  url = "ws://localhost:8787",
  roomId = "room1",
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

  function connect() {
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      // Join immediately, including sessionId if we have one for reconnect
      const joinMsg = { type: "JOIN", roomId, name };
      if (sessionId) joinMsg.sessionId = sessionId;
      sendRaw(joinMsg);
      onOpen();
    });

    ws.addEventListener("message", (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        // If server ever sends non-JSON, pass raw
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
      // close will usually follow
    });
  }

  function send(type, payload = {}) {
    return sendRaw({ type, ...payload });
  }

  function sendRaw(obj) {
    console.log("sendRaw()")
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

  function setSessionId(id) {
    sessionId = id;
  }

  // kick off
  // connect(); // this is moved to when user click button in lobby

  return {
    send,        // send("SAY", { text:"hi" })
    sendRaw,     // sendRaw({type:"ACTION", ...})
    isOpen,
    close,
    connect,
    setSessionId,
  };
}
