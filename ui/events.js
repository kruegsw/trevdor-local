/*
  ui/events.js (click-only)
  -------------------------
  What this does:
    - Attaches pointer event listeners to your canvas
    - Converts browser event coords -> canvas CSS pixel coords
    - Asks the renderer "what is under the pointer?" via renderer.getHitAt(x,y)
    - Emits high-level actions to your game logic:
        • hover (when hovered target changes)
        • pointer_down
        • click (pointer up without needing drag logic)

  What this does NOT do:
    - No drag select
    - No getHitsRegion / getHitsRegion
    - No threshold state machine

  Assumptions:
    - Your canvas is drawn in CSS pixels (like your resize code using ctx.setTransform(dpr,0,0,dpr,0,0))
    - renderer exposes getHitAt(x, y) -> hitRegion|null
*/

export function createUIEvents({
  canvas,
  renderer,

  // Optional: pass an object you already use for uiState.
  uiState = null,

  // Callbacks you implement:
  onAction = () => {},
  onUIChange = () => {},

  // Behavior toggles
  enableHover = true,
  preventContextMenu = true,

  // Click behavior:
  // If true: click only fires if pointer-up hits same id as pointer-down hit
  requireSameTargetForClick = false
} = {}) {
  if (!canvas) throw new Error("createUIEvents: canvas is required");
  if (!renderer) throw new Error("createUIEvents: renderer is required");
  if (!renderer.getHitAt) {
    throw new Error("createUIEvents: renderer.getHitAt(x,y) is required for click/hover");
  }

  // Basic UI state (safe defaults)
  const ui = uiState ?? {
    pointer: { x: 0, y: 0, isDown: false, pointerId: null },
    hovered: null, // hitRegion|null
    pressed: null  // hitRegion|null (what was under pointer on pointerdown)
  };

  /* ---------------------------------------------------------
     Coordinate conversion
     --------------------------------------------------------- */

  // Convert event client coords -> canvas-local CSS pixel coords
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
    // If we captured a pointer, ignore any other pointers
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;

    if (!enableHover) return;

    const hit = renderer.getHitAt(x, y);

    // Only emit when hovered target changes (reduces spam redraws)
    if (hit?.id !== ui.hovered?.id) {
      ui.hovered = hit;

      onAction({
        type: "hover",
        hit,
        x,
        y
      });

      onUIChange(ui);
    }
  }

  function onPointerDown(e) {
    // Only primary button starts interactions
    if (e.button !== undefined && e.button !== 0) return;

    // Capture pointer so we still get pointerup if it leaves the canvas
    canvas.setPointerCapture?.(e.pointerId);

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;
    ui.pointer.isDown = true;
    ui.pointer.pointerId = e.pointerId;

    ui.pressed = renderer.getHitAt(x, y);

    onAction({
      type: "pointer_down",
      hit: ui.pressed,
      x,
      y
    });

    onUIChange(ui);
  }

  function onPointerUp(e) {
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    const { x, y } = eventToCanvasXY(e);
    ui.pointer.x = x;
    ui.pointer.y = y;

    const hitUp = renderer.getHitAt(x, y);

    // Decide if this is a click
    let isClick = true;

    if (requireSameTargetForClick) {
      const downId = ui.pressed?.id ?? null;
      const upId = hitUp?.id ?? null;
      isClick = downId !== null && downId === upId;
    }

    if (isClick) {
      onAction({
        type: "click",
        hit: hitUp, // (forgiving) uses hit at pointer-up
        x,
        y,
        button: e.button ?? 0,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey
      });
    } else {
      onAction({
        type: "pointer_up",
        hit: hitUp,
        x,
        y
      });
    }

    // Reset down state
    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    onUIChange(ui);
  }

  function onPointerCancel(e) {
    if (ui.pointer.pointerId !== null && e.pointerId !== ui.pointer.pointerId) return;

    ui.pointer.isDown = false;
    ui.pointer.pointerId = null;
    ui.pressed = null;

    onAction({ type: "cancel" });
    onUIChange(ui);
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

  // Attach immediately
  attach();

  return {
    uiState: ui,
    attach,
    detach
  };
}
