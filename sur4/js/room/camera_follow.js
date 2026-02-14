// Camera follow / center controls (master can center self or force-focus a player camera to a target)
import { dbRef, dbSet, dbUpdate, dbOnValue, nowServer } from "../core/db.js";
import { isMaster } from "../core/permissions.js";
import { loadSession } from "../core/state.js";
import { emit } from "../core/events.js";
import { pRoom, pRoomCam, pRoomPlayerCam } from "../core/paths.js";

let _ctx = { roomId: null, role: "player", uid: null };
let _unsub = null;
let _camState = null;

export function setCameraContext(ctx){ _ctx = { ..._ctx, ...(ctx||{}) }; }

function assertMaster(){
  const s = loadSession();
  if (!isMaster(s.role)) throw new Error("not_master");
  if (!_ctx.roomId) throw new Error("no_room");
}

export function watchRoomCamera(roomId){
  _ctx.roomId = roomId;
  const r = dbRef(pRoomCam(roomId));
  _unsub = dbOnValue(r, (snap) => {
    _camState = snap.exists() ? (snap.val() || null) : null;
    emit("roomCam:update", _camState);
  });
  return () => { try{_unsub?.();}catch(_){} _unsub=null; };
}

export function getRoomCameraState(){ return _camState; }

// --- Master actions ---
export async function masterSetCenterAllPlayers(target){
  // target: { mode: "masterCam" } OR { mode:"token", tokenId } OR { mode:"xy", x, y }
  assertMaster();
  const payload = { ...target, updatedAt: nowServer() };
  await dbSet(dbRef(pRoomCam(_ctx.roomId)), payload);
}

export async function masterSetPlayerFocus(uid, target){
  // stores per-player override: /rooms/{roomId}/playerCam/{uid}
  assertMaster();
  const payload = { ...target, updatedAt: nowServer(), locked: true };
  await dbSet(dbRef(pRoomPlayerCam(_ctx.roomId, uid)), payload);
}

export async function masterClearPlayerFocus(uid){
  assertMaster();
  await dbSet(dbRef(pRoomPlayerCam(_ctx.roomId, uid)), { locked:false, updatedAt: nowServer() });
}
