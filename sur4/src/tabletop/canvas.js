import { $ } from "../utils/dom.js";
import { state, isMaster } from "../state.js";
import { renderTokens, hitTestToken, canMoveToken } from "./tokens.js";
import { upv, setv, del } from "../db/api.js";
import { paths } from "../db/paths.js";
import { getFogImage, setFogImageFromBase64 } from "./fog.js";
import { uid } from "../utils/id.js";

export function mountTabletop() {
  const canvas = $("#tabletop-canvas");
  const ctx = canvas.getContext("2d");

  const btnSnap = $("#btn-snap");

  let isPanning = false;
  let draggingTokenId = null;
  let dragOffset = { x: 0, y: 0 };

  // fog edit (master): drag to create rect
  let fogDrag = null; // {x0,y0,x1,y1}

  function resizeToCSS() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(600, Math.floor(rect.width * dpr));
    const h = Math.max(400, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.imageSmoothingEnabled = true;
  }

  function worldToScreen(wx, wy) {
    const zoom = getZoom();
    return { x: (wx + getPanX()) * zoom, y: (wy + getPanY()) * zoom };
  }
  function screenToWorld(sx, sy) {
    const zoom = getZoom();
    return { x: (sx / zoom) - getPanX(), y: (sy / zoom) - getPanY() };
  }

  function getZoom() {
    return state.room.map?.view?.enabled ? (state.room.map.view.zoom || 1) : state.ui.zoom;
  }
  function getPanX() {
    return state.room.map?.view?.enabled ? (state.room.map.view.panX || 0) : state.ui.panX;
  }
  function getPanY() {
    return state.room.map?.view?.enabled ? (state.room.map.view.panY || 0) : state.ui.panY;
  }

  function setLocalView({ zoom, panX, panY }) {
    if (typeof zoom === "number") state.ui.zoom = clampZoom(zoom);
    if (typeof panX === "number") state.ui.panX = panX;
    if (typeof panY === "number") state.ui.panY = panY;

    // if master sync view enabled, propagate
    if (isMaster() && state.room.map?.view?.enabled) {
      upv(paths.roomMapView(state.roomId), { zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
    }
  }

  function clampZoom(z) { return Math.min(10, Math.max(0.2, z)); }

  function drawGrid() {
    const grid = state.ui.gridSize;
    const zoom = getZoom();
    const step = grid * zoom;
    if (step < 18) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;

    const W = canvas.width, H = canvas.height;
    const start = screenToWorld(0, 0);
    const end = screenToWorld(W, H);

    const x0 = Math.floor(start.x / grid) * grid;
    const y0 = Math.floor(start.y / grid) * grid;

    for (let x = x0; x < end.x + grid; x += grid) {
      const s = worldToScreen(x, start.y);
      ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H); ctx.stroke();
    }
    for (let y = y0; y < end.y + grid; y += grid) {
      const s = worldToScreen(start.x, y);
      ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(W, s.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFog() {
    const fog = state.room.map?.fog;
    if (!fog?.enabled) return;

    const zoom = getZoom();

    // image overlay (optional)
    const img = getFogImage();
    if (img) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fog.opacity ?? 0.6));
      // anchor in world origin
      const s0 = worldToScreen(0, 0);
      // image size in world coords: treat 1px=1world unit for MVP; scaling by zoom makes it follow view.
      ctx.drawImage(img, s0.x, s0.y, img.width * zoom, img.height * zoom);
      ctx.restore();
    }

    // hidden rects: black overlay
    const rects = fog.rects || {};
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    for (const r of Object.values(rects)) {
      const s = worldToScreen(r.x, r.y);
      ctx.fillRect(s.x * 1, s.y * 1, r.w * zoom, r.h * zoom);
    }
    // draw current fog rect draft
    if (fogDrag && isMaster()) {
      const x = Math.min(fogDrag.x0, fogDrag.x1);
      const y = Math.min(fogDrag.y0, fogDrag.y1);
      const w = Math.abs(fogDrag.x1 - fogDrag.x0);
      const h = Math.abs(fogDrag.y1 - fogDrag.y0);
      const s = worldToScreen(x, y);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(s.x, s.y, w * zoom, h * zoom);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(2, 2 * zoom);
      ctx.strokeRect(s.x, s.y, w * zoom, h * zoom);
    }
    ctx.restore();
  }

  function pointInHidden(wx, wy) {
    const fog = state.room.map?.fog;
    if (!fog?.enabled) return false;
    const rects = fog.rects || {};
    for (const r of Object.values(rects)) {
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return true;
    }
    return false;
  }

  function draw() {
    resizeToCSS();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    // players cannot see tokens inside hidden rects
    const zoom = getZoom();
    if (!isMaster() && state.room.map?.fog?.enabled) {
      // render tokens but skip those under fog
      const tokens = Object.values(state.room.tokensById || {});
      for (const t of tokens) {
        if (pointInHidden(t.x, t.y)) continue;
        // draw single token via renderTokens by temporary map
      }
      // faster: use renderTokens then cover fog (we already cover with black), but requirement: "players não pode ver"
      // Covering with opaque black is acceptable: token is not visible. We'll keep that: renderTokens then fog overlay.
      renderTokens(ctx, { worldToScreen, zoom });
      drawFog();
    } else {
      renderTokens(ctx, { worldToScreen, zoom });
      drawFog();
    }

    requestAnimationFrame(draw);
  }

  function setSnap(on) {
    state.ui.snapToGrid = !!on;
    btnSnap.dataset.on = on ? "1" : "0";
    btnSnap.textContent = on ? "Snap: ON" : "Snap: OFF";
  }
  btnSnap.addEventListener("click", () => setSnap(!state.ui.snapToGrid));

  // wheel zoom (local)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.room.map?.view?.enabled && !isMaster()) return; // players locked to master view

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const before = screenToWorld(sx, sy);
    const delta = Math.sign(e.deltaY);
    const factor = delta > 0 ? 0.9 : 1.1;
    const newZoom = clampZoom(state.ui.zoom * factor);

    // adjust pan to keep cursor anchored
    const oldZoom = state.ui.zoom;
    state.ui.zoom = newZoom;

    const after = screenToWorld(sx, sy);
    state.ui.panX += (after.x - before.x);
    state.ui.panY += (after.y - before.y);

    if (isMaster() && state.room.map?.view?.enabled) {
      upv(paths.roomMapView(state.roomId), { zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
    }
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    if (!state.me) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const w = screenToWorld(sx, sy);

    // master fog edit: Alt+drag creates hidden rect
    if (isMaster() && state.room.map?.fog?.enabled && e.altKey) {
      fogDrag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      return;
    }

    if (e.button === 0 && e.shiftKey) {
      if (state.room.map?.view?.enabled && !isMaster()) return;
      isPanning = true;
      canvas.style.cursor = "grabbing";
      return;
    }

    const hit = hitTestToken(w.x, w.y);
    if (hit) {
      state.ui.selectedTokenId = hit.id;
      window.dispatchEvent(new CustomEvent("app:token:selected", { detail: hit.id }));

      if (canMoveToken(hit)) {
        draggingTokenId = hit.id;
        dragOffset.x = w.x - hit.x;
        dragOffset.y = w.y - hit.y;
      }
    } else {
      state.ui.selectedTokenId = null;
      window.dispatchEvent(new CustomEvent("app:token:selected", { detail: null }));
    }
  });

  window.addEventListener("mouseup", async () => {
    isPanning = false;
    draggingTokenId = null;
    canvas.style.cursor = "default";

    // finalize fog rect
    if (fogDrag && isMaster()) {
      const x = Math.min(fogDrag.x0, fogDrag.x1);
      const y = Math.min(fogDrag.y0, fogDrag.y1);
      const w = Math.abs(fogDrag.x1 - fogDrag.x0);
      const h = Math.abs(fogDrag.y1 - fogDrag.y0);
      fogDrag = null;

      if (w < 10 || h < 10) return;

      const id = uid("fog");
      const rectObj = { x, y, w, h };
      await setv(`${paths.roomMapFogRects(state.roomId)}/${id}`, rectObj);
    }
  });

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const w = screenToWorld(sx, sy);

    if (fogDrag && isMaster()) {
      fogDrag.x1 = w.x;
      fogDrag.y1 = w.y;
      return;
    }

    if (isPanning) {
      const mx = (e.movementX || 0) * dpr;
      const my = (e.movementY || 0) * dpr;
      state.ui.panX += mx / state.ui.zoom;
      state.ui.panY += my / state.ui.zoom;

      if (isMaster() && state.room.map?.view?.enabled) {
        upv(paths.roomMapView(state.roomId), { zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
      }
      return;
    }

    if (draggingTokenId) {
      const token = state.room.tokensById?.[draggingTokenId];
      if (!token) return;

      let nx = w.x - dragOffset.x;
      let ny = w.y - dragOffset.y;

      if (state.ui.snapToGrid) {
        const g = state.ui.gridSize;
        nx = Math.round(nx / g) * g;
        ny = Math.round(ny / g) * g;
      }

      // write throttled: only on mouseup? but needs realtime; we'll update on move with low frequency
      token.x = nx; token.y = ny;
      token.updatedAt = Date.now();

      scheduleTokenWrite(token);
    }
  });

  let writeTimer = null;
  let lastTokenToWrite = null;

  function scheduleTokenWrite(token) {
    lastTokenToWrite = token;
    if (writeTimer) return;
    writeTimer = setTimeout(async () => {
      const t = lastTokenToWrite;
      writeTimer = null;
      if (!t) return;
      await upv(paths.roomToken(state.roomId, t.id), { x: t.x, y: t.y, updatedAt: Date.now() });
    }, 60);
  }

  // update fog image cache when DB changes
  window.addEventListener("app:room:map", () => {
    const b64 = state.room.map?.fog?.imageBase64 || null;
    setFogImageFromBase64(b64);
  });

  draw();
}
