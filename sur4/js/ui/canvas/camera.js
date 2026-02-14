// Camera math
let _cam = null;

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1, minZoom: 0.25, maxZoom: 5 };
}

export function setCameraInstance(cam){ _cam = cam; }
export function getCamera(){ return _cam; }

export function screenToWorld(cam, sx, sy) {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

export function worldToScreen(cam, wx, wy) {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

export function centerOnWorld(cam, wx, wy, viewW, viewH) {
  // center wx/wy in the visible viewport
  cam.x = (viewW / 2) - (wx * cam.zoom);
  cam.y = (viewH / 2) - (wy * cam.zoom);
}
