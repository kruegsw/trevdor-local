import { screenToWorld, zoomAtScreenPoint } from "./camera.js";

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

  canvas.style.touchAction = "none"; // critical: allow pointer events to drive pan/pinch

  const g = ui.gesture; // shorthand

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

  let _canvasRect = canvas.getBoundingClientRect();
  window.addEventListener("resize", () => { _canvasRect = canvas.getBoundingClientRect(); });
  window.addEventListener("scroll", () => { _canvasRect = canvas.getBoundingClientRect(); }, true);

  function eventToCanvasXY(e) {
    return { x: e.clientX - _canvasRect.left, y: e.clientY - _canvasRect.top };
  }

  function eventToWorldXY(e) {
    const p = eventToCanvasXY(e);
    const w = screenToWorld(ui.camera, p.x, p.y);
    return { sx: p.x, sy: p.y, wx: w.x, wy: w.y };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }
  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* ---------------------------------------------------------
     Handlers
     --------------------------------------------------------- */

  function onPointerMove(e) {
    const { sx, sy, wx, wy } = eventToWorldXY(e);

    ui.pointer.x = sx;
    ui.pointer.y = sy;

    const tracked = g.pointers.has(e.pointerId);

    // -------------------------
    // Gesture path (only if tracked)
    // -------------------------
    if (tracked) {
      g.pointers.set(e.pointerId, { x: sx, y: sy });

      // PAN
      if (g.pointers.size === 1 && g.mode === "pan" && ui.pointer.isDown) {
        if (ui.simplifiedView) { g.last = { x: sx, y: sy }; return; }
        const dx = sx - g.last.x;
        const dy = sy - g.last.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          g.wasGesture = true;
          ui.cameraUserAdjusted = true;
        }

        ui.camera.x -= dx / ui.camera.scale;
        ui.camera.y -= dy / ui.camera.scale;
        g.last = { x: sx, y: sy };

        _onUIChange(ui);
        return;
      }

      // PINCH
      if (g.pointers.size === 2 && g.mode === "pinch" && !ui.simplifiedView) {
        const [p1, p2] = [...g.pointers.values()];
        const m = mid(p1, p2);
        const d = dist(p1, p2);

        g.wasGesture = true;
        ui.cameraUserAdjusted = true;

        const nextScale = g.startScale * (d / g.startDist);
        zoomAtScreenPoint(ui.camera, g.startMid.x, g.startMid.y, nextScale);

        const mdx = m.x - g.lastMid.x;
        const mdy = m.y - g.lastMid.y;
        ui.camera.x -= mdx / ui.camera.scale;
        ui.camera.y -= mdy / ui.camera.scale;
        g.lastMid = m;

        _onUIChange(ui);
        return;
      }

      // if tracked but not in a gesture mode, fall through to hover only if not down
      if (ui.pointer.isDown) return;
    }

    // -------------------------
    // Hover path (works even when NOT tracked)
    // -------------------------
    if (!enableHover) return;
    if (ui.pointer.isDown) return;
    if (g.pointers.size > 0) return; // if any touch active, skip hover

    const hit = renderer.getHitAt(wx, wy);
    if (hit?.uiID !== ui.hovered?.uiID) {
      ui.hovered = hit;
      _onAction({ type: "hover", hit, x: wx, y: wy, sx, sy });
      _onUIChange(ui);
    }
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;

    canvas.setPointerCapture?.(e.pointerId);

    const { sx, sy, wx, wy } = eventToWorldXY(e);

    // track pointer
    ui.pointer.x = sx;
    ui.pointer.y = sy;
    ui.pointer.isDown = true;
    ui.pointer.pointerId = e.pointerId;

    // gesture tracking
    g.pointers.set(e.pointerId, { x: sx, y: sy });
    g.wasGesture = false;

    if (g.pointers.size === 1) {
      g.mode = "pan";
      g.last = { x: sx, y: sy };
    } else if (g.pointers.size === 2) {
      const [p1, p2] = [...g.pointers.values()];
      const m = mid(p1, p2);
      g.mode = "pinch";
      g.startDist = dist(p1, p2);
      g.startScale = ui.camera.scale;
      g.startMid = m;
      g.lastMid = m;
    }

    // hit test uses WORLD coords
    ui.pressed = renderer.getHitAt(wx, wy);

    _onAction({ type: "pointer_down", hit: ui.pressed, x: wx, y: wy, sx, sy });
    _onUIChange(ui);
  }

  function onPointerUp(e) {
    const hadPointer = g.pointers.has(e.pointerId);

    // update gesture tracking first
    if (hadPointer) g.pointers.delete(e.pointerId);

    const { sx, sy, wx, wy } = eventToWorldXY(e);

    ui.pointer.x = sx;
    ui.pointer.y = sy;

    const hitUp = renderer.getHitAt(wx, wy);

    // If a pan/pinch happened, suppress click
    const suppressClick = g.wasGesture;

    let isClick = !suppressClick;

    if (isClick && requireSameTargetForClick) {
      const downId = ui.pressed?.uiID ?? ui.pressed?.id ?? null;
      const upId   = hitUp?.uiID     ?? hitUp?.id     ?? null;
      isClick = downId !== null && downId === upId;
    }

    if (isClick) {
      _onAction({
        type: "click",
        hit: hitUp,
        x: wx,
        y: wy,
        sx,
        sy,
        button: e.button ?? 0,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey
      });
    } else {
      _onAction({ type: "pointer_up", hit: hitUp, x: wx, y: wy, sx, sy });
    }

    // reset single-pointer state
    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    // decide next gesture mode if one pointer remains
    if (g.pointers.size === 1) {
      const [only] = [...g.pointers.values()];
      g.mode = "pan";
      g.last = { x: only.x, y: only.y };
      g.wasGesture = false; // fresh for new gesture
    } else {
      g.mode = null;
      g.wasGesture = false;
    }

    _onUIChange(ui);
  }

  function onPointerCancel(e) {
    g.pointers.delete(e.pointerId);

    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    g.mode = null;
    g.wasGesture = false;

    _onAction({ type: "cancel" });
    _onUIChange(ui);
  }

  function onContextMenu(e) {
    if (!preventContextMenu) return;
    e.preventDefault();
  }

  function onPointerLeave() {
    if (ui.hovered) {
      ui.hovered = null;
      _onUIChange(ui);
    }
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
    canvas.addEventListener("pointerleave", onPointerLeave);
  }

  function detach() {
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("pointerleave", onPointerLeave);
  }

  attach();

  return {
    uiState: ui,
    attach,
    detach,
    setHandlers
  };
}
