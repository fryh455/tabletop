// Tokens: realtime positions, ownership, size, hidden, sheetId, groupId
import { dbRef, dbOnValue, dbPush, dbSet, dbUpdate, dbRemove, nowServer } from "../core/db.js";
import { emit } from "../core/events.js";
import { isMaster } from "../core/permissions.js";
import { pTokens, pToken } from "../core/paths.js";

let _ctx = { roomId: null, role: "player", settings: null };
let _tokens = {};
let _unsub = null;

export function setRoomContext(ctx){ _ctx = { ..._ctx, ...(ctx||{}) }; }
export function getTokens(){ return _tokens || {}; }

export function watchTokens(roomId){
  _ctx.roomId = roomId;
  const r = dbRef(pTokens(roomId));
  _unsub = dbOnValue(r, (snap) => {
    _tokens = snap.exists() ? (snap.val() || {}) : {};
    emit("tokens:update", _tokens);
  });
  return () => { try{_unsub?.();}catch(_){} _unsub=null; };
}

function assertReady(){ if(!_ctx.roomId) throw new Error("no_room"); }
function assertMaster(){ assertReady(); if(!isMaster(_ctx.role)) throw new Error("not_master"); }

export async function createToken(data){
  assertMaster();
  const ref = await dbPush(dbRef(pTokens(_ctx.roomId)));
  const id = ref.key;
  const t = {
    id,
    name: String(data?.name || "Token").slice(0, 48),
    x: Number(data?.x)||0,
    y: Number(data?.y)||0,
    size: Number(data?.size)||1,
    ownerUid: data?.ownerUid ?? null,
    sheetId: data?.sheetId ?? null,
    groupId: data?.groupId ?? null,
    hidden: !!data?.hidden,
    createdAt: nowServer(),
    updatedAt: nowServer(),
  };
  await dbSet(dbRef(pToken(_ctx.roomId, id)), t);
  return t;
}

export async function updateToken(tokenId, patch){
  assertMaster();
  await dbUpdate(dbRef(pToken(_ctx.roomId, tokenId)), { ...(patch||{}), updatedAt: nowServer() });
}

export async function deleteToken(tokenId){
  assertMaster();
  await dbRemove(dbRef(pToken(_ctx.roomId, tokenId)));
}

// Single move (used when not grouped)
export async function moveToken(tokenId, x, y){
  assertReady();
  // players can only move their own tokens; master moves any.
  const t = _tokens?.[tokenId];
  if(!t) throw new Error("token_not_found");
  if(!isMaster(_ctx.role)) {
    // If token has owner, only that owner can move it. If NPC (ownerUid null) players cannot.
    const uid = (window.__SUR4_AUTH_UID || null);
    if(!t.ownerUid || !uid || t.ownerUid !== uid) throw new Error("not_owner");
  }
  await dbUpdate(dbRef(pToken(_ctx.roomId, tokenId)), { x:Number(x)||0, y:Number(y)||0, updatedAt: nowServer() });
}

// Batch move (for groups)
export async function moveTokensBatch(pairs){
  assertReady();
  const upd = {};
  for (const p of (pairs||[])) {
    if(!p?.id) continue;
    upd[pToken(_ctx.roomId, p.id) + "/x"] = Number(p.x)||0;
    upd[pToken(_ctx.roomId, p.id) + "/y"] = Number(p.y)||0;
    upd[pToken(_ctx.roomId, p.id) + "/updatedAt"] = nowServer();
  }
  if (Object.keys(upd).length === 0) return;
  await dbUpdate(dbRef("/"), upd);
}
