// Map canvas: render map bg + tokens + fog, pan/zoom, drag token (+ groups) + follow locks
import { el } from "../dom.js";
import { makeCamera, screenToWorld, setCameraInstance, getCamera, centerOnWorld } from "./camera.js";
import { emit } from "../../core/events.js";
import { moveToken, moveTokensBatch, getTokens, setRoomContext, watchTokens } from "../../room/tokens.js";
import { getMapState } from "../../room/map.js";
import { drawFog } from "./fog_layer.js";
import { createFogArea } from "../../room/fog.js";
import { on } from "../../core/events.js";
import { loadSession } from "../../core/state.js";
import { getTokenGroups } from "../../room/token_groups.js";
import { applyFollowRule } from "./map_canvas_follow.js";

let canvas, ctx;
let cam = makeCamera();
setCameraInstance(cam);

let dragging = null; // {ids:[], base:{id:{x,y}}, dx, dy}
let panning = null;  // {sx, sy, cx, cy}

// fog draw mode
let fogDraw = null; // {typeId, pts:[]}

// follow rules
let _broadcastRule = null;
let _playerRule = null;

let _bgImg = null;
let _bgUrlLoaded = "";

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clear() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

function ensureBgLoaded(map) {
  const url = (map?.bgUrl || "").trim();
  if (!url) { _bgImg = null; _bgUrlLoaded = ""; return; }
  if (url === _bgUrlLoaded && _bgImg) return;

  _bgUrlLoaded = url;
  _bgImg = new Image();
  _bgImg.crossOrigin = "anonymous";
  _bgImg.src = url;
}

function drawBg(map) {
  if (!_bgImg || !_bgImg.complete) return;
  const scale = Number(map?.bgScale ?? 1);
  const wx = Number(map?.bgX ?? 0);
  const wy = Number(map?.bgY ?? 0);

  const sw = _bgImg.width * scale * cam.zoom;
  const sh = _bgImg.height * scale * cam.zoom;
  const sx = wx * cam.zoom + cam.x;
  const sy = wy * cam.zoom + cam.y;

  ctx.globalAlpha = 1;
  ctx.drawImage(_bgImg, sx, sy, sw, sh);
}

function drawTokens(tokens) {
  for (const [id, t] of Object.entries(tokens || {})) {
    if (!t || t.hidden) continue;
    const x = (t.x ?? 0) * cam.zoom + cam.x;
    const y = (t.y ?? 0) * cam.zoom + cam.y;
    const size = (32 * (t.size ?? 1)) * cam.zoom;

    ctx.beginPath();
    ctx.rect(x - size/2, y - size/2, size, size);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (t.name) {
      ctx.fillStyle = "#111";
      ctx.font = `${Math.max(10, 12*cam.zoom)}px sans-serif`;
      ctx.fillText(String(t.name), x - size/2, y - size/2 - 4);
    }
  }
}

function drawFogDraft() {
  if (!fogDraw || fogDraw.pts.length < 1) return;
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = "#0b0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i=0;i<fogDraw.pts.length;i++) {
    const p = fogDraw.pts[i];
    const sx = (p.x * cam.zoom) + cam.x;
    const sy = (p.y * cam.zoom) + cam.y;
    if (i===0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();
}

function hitToken(tokens, wx, wy) {
  for (const [id, t] of Object.entries(tokens || {})) {
    if (!t || t.hidden) continue;
    const size = 32 * (t.size ?? 1);
    const x = t.x ?? 0;
    const y = t.y ?? 0;
    if (Math.abs(wx - x) <= size/2 && Math.abs(wy - y) <= size/2) return id;
  }
  return null;
}

function canUserMoveGroup(groupId, sess) {
  if (sess.role === "master") return true;
  const g = getTokenGroups()?.[groupId];
  if (!g) return false;
  const tokens = getTokens();
  for (const tid of (g.tokenIds||[])) {
    const t = tokens?.[tid];
    if (t?.ownerUid && t.ownerUid === sess.uid) return true;
  }
  return false;
}

function getDragSet(tokenId, sess) {
  const tokens = getTokens();
  const t = tokens?.[tokenId];
  if (!t) return { ids:[tokenId] };

  if (t.groupId) {
    const ok = canUserMoveGroup(t.groupId, sess);
    if (!ok) return { ids:[tokenId], denied:true };
    const g = getTokenGroups()?.[t.groupId];
    const ids = Array.isArray(g?.tokenIds) ? g.tokenIds.slice() : [tokenId];
    return { ids: ids.length ? ids : [tokenId] };
  }

  // non-group: only master or owner can drag; NPC cannot
  if (sess.role !== "master") {
    if (!t.ownerUid || t.ownerUid !== sess.uid) return { ids:[tokenId], denied:true };
  }
  return { ids:[tokenId] };
}

function applyFollowEachFrame() {
  // player override beats broadcast
  if (_playerRule && _playerRule.locked) {
    applyFollowRule(cam, canvas, _playerRule);
    return;
  }
  // broadcast applies to players (not to master)
  const s = loadSession();
  if (s.role !== "master" && _broadcastRule) {
    applyFollowRule(cam, canvas, _broadcastRule);
  }
}

function render() {
  clear();
  applyFollowEachFrame();
  const map = getMapState();
  ensureBgLoaded(map);
  drawBg(map);
  drawTokens(getTokens());
  drawFog(ctx);
  drawFogDraft();
  requestAnimationFrame(render);
}

function onWheel(e) {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const factor = delta > 0 ? 0.9 : 1.1;
  cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * factor));
}

function addFogPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(cam, sx, sy);
  fogDraw.pts.push({ x:w.x, y:w.y });
}

async function finishFog() {
  if (!fogDraw || fogDraw.pts.length < 3) { fogDraw = null; return; }
  const payload = { typeId: fogDraw.typeId, pts: fogDraw.pts };
  fogDraw = null;
  try { await createFogArea(payload); } catch(_) {}
}

function onDown(e) {
  // Fog draw mode first
  if (fogDraw && e.button === 0) {
    addFogPoint(e);
    return;
  }

  // if player locked, ignore manual pan/drag (hard lock)
  const s = loadSession();
  if (s.role !== "master" && _playerRule && _playerRule.locked) return;

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(cam, sx, sy);
  const tid = hitToken(getTokens(), w.x, w.y);

  if (tid && e.button === 0) {
    const sess = loadSession();
    const dragSet = getDragSet(tid, sess);
    if (dragSet.denied) return;

    const base = {};
    for (const id of dragSet.ids) {
      const tt = getTokens()?.[id];
      if (tt) base[id] = { x: tt.x ?? 0, y: tt.y ?? 0 };
    }

    // store offset relative to grabbed token
    const grab = getTokens()?.[tid];
    dragging = { ids: dragSet.ids, base, dx: w.x - (grab?.x ?? 0), dy: w.y - (grab?.y ?? 0), grabbed: tid };

    emit("token:select", { tokenId: tid });
    return;
  }
  if (e.button === 1 || e.button === 2) {
    panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
  }
}

function onDblClick(e) {
  if (fogDraw) {
    finishFog();
  }
}

function onMove(e) {
  // Always emit cursor world position (used by clipboard paste)
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(cam, sx, sy);
    emit("map:cursor", w);
  }

  if (!dragging && !panning) return;

  if (panning) {
    cam.x = panning.cx + (e.clientX - panning.sx);
    cam.y = panning.cy + (e.clientY - panning.sy);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(cam, sx, sy);

  const nx = w.x - dragging.dx;
  const ny = w.y - dragging.dy;

  const grabBase = dragging.base?.[dragging.grabbed] || { x:0,y:0 };
  const dx = nx - grabBase.x;
  const dy = ny - grabBase.y;

  for (const id of dragging.ids) {
    const b = dragging.base?.[id];
    const t = getTokens()?.[id];
    if (t && b) {
      t.x = b.x + dx;
      t.y = b.y + dy;
    }
  }
}

async function onUp(e) {
  if (panning) { panning = null; return; }
  if (!dragging) return;

  const ids = dragging.ids.slice();
  dragging = null;

  const pairs = [];
  const tokens = getTokens();
  for (const id of ids) {
    const t = tokens?.[id];
    if (t) pairs.push({ id, x: t.x ?? 0, y: t.y ?? 0 });
  }

  try {
    if (pairs.length === 1) await moveToken(pairs[0].id, pairs[0].x, pairs[0].y);
    else await moveTokensBatch(pairs);
  } catch (_) {}
}

export function mountMapCanvas(roomId, role, settings) {
  canvas = el("mapCanvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("dblclick", onDblClick);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  on("fog:draw:start", ({ typeId }) => {
    if (role !== "master") return;
    fogDraw = { typeId, pts: [] };
  });

  // follow updates
  on("roomCam:broadcast", (rule) => { _broadcastRule = rule; });
  on("roomCam:player", (rule) => { _playerRule = rule; });

  setRoomContext({ roomId, role, settings });
  watchTokens(roomId);

  requestAnimationFrame(render);
}
