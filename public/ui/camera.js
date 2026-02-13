// ui/camera.js
export function createCamera() {
  return {
    x: 0,      // world-space top-left (in your layout units / CSS px)
    y: 0,
    scale: 1,  // world -> screen
    minScale: 0.35,
    maxScale: 2.5,
  };
}

export function clampCamera(cam) {
  cam.scale = Math.max(cam.minScale, Math.min(cam.maxScale, cam.scale));
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: sx / cam.scale + cam.x,
    y: sy / cam.scale + cam.y,
  };
}

/**
 * Zoom around a screen-space anchor (sx, sy) so the world point under the finger stays put.
 */
export function zoomAtScreenPoint(cam, sx, sy, nextScale) {
  const prevScale = cam.scale;
  nextScale = Math.max(cam.minScale, Math.min(cam.maxScale, nextScale));
  if (nextScale === prevScale) return;

  // world point under anchor before zoom
  const wx = sx / prevScale + cam.x;
  const wy = sy / prevScale + cam.y;

  cam.scale = nextScale;

  // adjust cam so wx,wy remains under the same screen point
  cam.x = wx - sx / cam.scale;
  cam.y = wy - sy / cam.scale;
}
