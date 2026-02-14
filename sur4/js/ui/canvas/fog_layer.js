// Fog overlay drawing (top of map canvas)
import { on } from "../../core/events.js";
import { getFogTypes, getFogAreas } from "../../room/fog.js";
import { loadSession } from "../../core/state.js";
import { getCamera } from "./camera.js";

let _patternCache = new Map(); // url->pattern image/canvas pattern
let _imgCache = new Map();     // url->Image
let _lastTypes = {};
let _lastAreas = {};

function getPattern(ctx, url) {
  if (!url) return null;
  if (_patternCache.has(url)) return _patternCache.get(url);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  _imgCache.set(url, img);

  // pattern created once loaded
  img.onload = () => {
    try {
      const p = ctx.createPattern(img, "repeat");
      _patternCache.set(url, p);
    } catch(_) {}
  };

  _patternCache.set(url, null);
  return null;
}

function shouldHideForUser(area, types, sess) {
  if (sess.role === "master") return false;
  const t = types?.[area.typeId];
  if (!t) return true;
  const list = Array.isArray(t.visibleTo) ? t.visibleTo : [];
  if (list.length === 0) return true;
  return list.includes(sess.uid);
}

function drawPoly(ctx, cam, pts) {
  if (!pts || pts.length < 3) return false;
  ctx.beginPath();
  for (let i=0;i<pts.length;i++) {
    const p = pts[i];
    const sx = (p.x * cam.zoom) + cam.x;
    const sy = (p.y * cam.zoom) + cam.y;
    if (i===0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  return true;
}

export function drawFog(ctx) {
  const sess = loadSession();
  const cam = getCamera();
  const types = getFogTypes();
  const areas = getFogAreas();

  // cache for master outlines
  _lastTypes = types; _lastAreas = areas;

  // Players: draw overlay for areas that affect them
  if (sess.role !== "master") {
    for (const a of Object.values(areas || {})) {
      if (!a?.pts || a.pts.length < 3) continue;
      if (!shouldHideForUser(a, types, sess)) continue;

      const t = types?.[a.typeId] || {};
      const opacity = Number.isFinite(+t.opacity) ? Math.max(0, Math.min(1, +t.opacity)) : 1;

      if (!drawPoly(ctx, cam, a.pts)) continue;

      ctx.save();
      ctx.globalAlpha = opacity;
      const pat = getPattern(ctx, (t.spriteUrl || "").trim());
      if (pat) { ctx.fillStyle = pat; }
      else { ctx.fillStyle = "#000"; }
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Master: draw outlines (semi transparent)
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, 1*cam.zoom);
    ctx.strokeStyle = "#b00";
    for (const a of Object.values(areas || {})) {
      if (!a?.pts || a.pts.length < 2) continue;
      ctx.beginPath();
      for (let i=0;i<a.pts.length;i++) {
        const p=a.pts[i];
        const sx=(p.x*cam.zoom)+cam.x;
        const sy=(p.y*cam.zoom)+cam.y;
        if(i===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function getFogDebugState() { return { types:_lastTypes, areas:_lastAreas }; }
