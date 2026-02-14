// Fog: types + areas (polygons) with per-player visibility
import { dbRef, dbOnValue, dbPush, dbSet, dbUpdate, dbRemove, nowServer } from "../core/db.js";
import { emit } from "../core/events.js";
import { isMaster } from "../core/permissions.js";
import { pFog, pFogTypes, pFogType, pFogAreas, pFogArea } from "../core/paths.js";

let _ctx = { roomId: null, role: "player", uid: null };
let _types = {};
let _areas = {};
let _unsubT = null;
let _unsubA = null;

export function setFogContext(ctx) { _ctx = { ..._ctx, ...(ctx||{}) }; }
export function getFogTypes() { return _types || {}; }
export function getFogAreas() { return _areas || {}; }

export function watchFog(roomId) {
  _ctx.roomId = roomId;
  const rt = dbRef(pFogTypes(roomId));
  const ra = dbRef(pFogAreas(roomId));

  _unsubT = dbOnValue(rt, (snap) => {
    _types = snap.exists() ? (snap.val() || {}) : {};
    emit("fog:types", _types);
  });
  _unsubA = dbOnValue(ra, (snap) => {
    _areas = snap.exists() ? (snap.val() || {}) : {};
    emit("fog:areas", _areas);
  });

  return () => { try{_unsubT?.();}catch(_){} try{_unsubA?.();}catch(_){} _unsubT=_unsubA=null; };
}

function assertMaster() {
  if (!_ctx.roomId) throw new Error("no_room");
  if (!isMaster(_ctx.role)) throw new Error("not_master");
}

export async function createFogType(data) {
  assertMaster();
  const ref = await dbPush(dbRef(pFogTypes(_ctx.roomId)));
  const id = ref.key;
  const t = {
    id,
    name: String(data?.name || "Fog").slice(0, 32),
    spriteUrl: String(data?.spriteUrl || "").slice(0, 600),
    opacity: Number.isFinite(+data?.opacity) ? Math.max(0, Math.min(1, +data.opacity)) : 1,
    // if empty -> applies to ALL players (except master can ignore by toggles later)
    visibleTo: Array.isArray(data?.visibleTo) ? data.visibleTo.slice(0, 50).map(String) : [],
    createdAt: nowServer(),
    updatedAt: nowServer(),
  };
  await dbSet(dbRef(pFogType(_ctx.roomId, id)), t);
  return t;
}

export async function updateFogType(typeId, patch) {
  assertMaster();
  await dbUpdate(dbRef(pFogType(_ctx.roomId, typeId)), { ...(patch||{}), updatedAt: nowServer() });
}

export async function deleteFogType(typeId) {
  assertMaster();
  await dbRemove(dbRef(pFogType(_ctx.roomId, typeId)));
}

export async function createFogArea(data) {
  assertMaster();
  const ref = await dbPush(dbRef(pFogAreas(_ctx.roomId)));
  const id = ref.key;
  const a = {
    id,
    typeId: data?.typeId || null,
    pts: Array.isArray(data?.pts) ? data.pts.map(p => ({ x:Number(p.x)||0, y:Number(p.y)||0 })).slice(0, 256) : [],
    createdAt: nowServer(),
    updatedAt: nowServer(),
  };
  await dbSet(dbRef(pFogArea(_ctx.roomId, id)), a);
  return a;
}

export async function deleteFogArea(areaId) {
  assertMaster();
  await dbRemove(dbRef(pFogArea(_ctx.roomId, areaId)));
}

export function areaAffectsUser(area, types, uid, role) {
  if (!area) return False;
  if (role === "master") return false; // master sees through by default (we still draw outlines in UI)
  const t = types?.[area.typeId];
  if (!t) return true; // unknown type => default hide
  const list = Array.isArray(t.visibleTo) ? t.visibleTo : [];
  if (list.length === 0) return true; // applies to all players
  return list.includes(uid);
}
