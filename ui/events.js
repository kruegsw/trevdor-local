// ui/events.js
export function createUIEvents({
  canvas,
  renderer,

  // You MUST pass uiState now (created in ui/state.js)
  uiState = null,

  // Callbacks you implement (can be replaced later via setHandlers)
  onAction = () => {},
  onUIChange = () => {},

  // Behavior toggles
  enableHover = true,
  preventContextMenu = true,

  // Click behavior:
  requireSameTargetForClick = false
} = {}) {
  if (!canvas) throw new Error("createUIEvents: canvas is required");
  if (!renderer) throw new Error("createUIEvents: renderer is required");
  if (!renderer.getHitAt) {
    throw new Error("createUIEvents: renderer.getHitAt(x,y) is required for click/hover");
  }
  if (!uiState) {
    throw new Error("createUIEvents requires a uiState object");
  }

  const ui = uiState;

  // ✅ make handlers swappable so main.js can stay wiring-only
  let _onAction = onAction;
  let _onUIChange = onUIChange;

  function setHandlers({ onAction, onUIChange } = {}) {
    if (typeof onAction === "function") _onAction = onAction;
    if (typeof onUIChange === "function") _onUIChange = onUIChange;
  }

  /* ---------------------------------------------------------
     Coordinate conversion
     --------------------------------------------------------- */

  function eventToCanvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /* ---------------------------------------------------------
     Handlers
     --------------------------------------------------------- */

  function onPointerMove(e) {
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;

    if (!enableHover) return;

    const hit = renderer.getHitAt(x, y);

    if (hit?.id !== ui.hovered?.id) {
      ui.hovered = hit;

      _onAction({ type: "hover", hit, x, y });
      _onUIChange(ui);
    }
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;

    canvas.setPointerCapture?.(e.pointerId);

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;
    ui.pointer.isDown = true;
    ui.pointer.pointerId = e.pointerId;

    ui.pressed = renderer.getHitAt(x, y);

    _onAction({ type: "pointer_down", hit: ui.pressed, x, y });
    _onUIChange(ui);
  }

  function onPointerUp(e) {
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;

    const hitUp = renderer.getHitAt(x, y);

    let isClick = true;

    if (requireSameTargetForClick) {
      const downId = ui.pressed?.uiID ?? ui.pressed?.id ?? null;
      const upId   = hitUp?.uiID   ?? hitUp?.id   ?? null;
      isClick = downId !== null && downId === upId;
    }

    if (isClick) {
      _onAction({
        type: "click",
        hit: hitUp,
        x,
        y,
        button: e.button ?? 0,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey
      });
    } else {
      _onAction({ type: "pointer_up", hit: hitUp, x, y });
    }

    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    _onUIChange(ui);
  }

  function onPointerCancel(e) {
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    _onAction({ type: "cancel" });
    _onUIChange(ui);
  }

  function onContextMenu(e) {
    if (!preventContextMenu) return;
    e.preventDefault();
  }

  /* ---------------------------------------------------------
     Attach / detach
     --------------------------------------------------------- */

  function attach() {
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("contextmenu", onContextMenu);
  }

  function detach() {
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  }

  attach();

  return {
    uiState: ui,
    attach,
    detach,
    setHandlers
  };
}
