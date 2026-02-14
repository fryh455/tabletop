// Room sync: join, presence, role (master/player), settings, players list
import { dbRef, dbGet, dbSet, dbUpdate, dbOnValue, nowServer } from "../core/db.js";
import { loadSession, saveSession } from "../core/state.js";
import { emit } from "../core/events.js";
import { pRoom, pRoomPlayers, pRoomPlayer, pRoomSettings, pRoomCam, pRoomPlayerCam } from "../core/paths.js";

let _players = {};
let _unsubs = [];
let _roomId = null;

export function getPlayers(){ return _players || {}; }

export async function joinRoom(roomId){
  _roomId = roomId;
  const s = loadSession();
  if(!s?.uid) throw new Error("no_session_uid");
  if(!s?.displayName) throw new Error("no_display_name");

  // ensure room exists and determine role
  const roomSnap = await dbGet(dbRef(pRoom(roomId)));
  if(!roomSnap.exists()) throw new Error("room_not_found");

  const room = roomSnap.val() || {};
  const role = (room.masterUid === s.uid) ? "master" : "player";

  // create/update player record
  await dbSet(dbRef(pRoomPlayer(roomId, s.uid)), {
    uid: s.uid,
    displayName: s.displayName,
    role,
    connected: true,
    updatedAt: nowServer(),
  });

  saveSession({ ...s, roomId, role });

  // watchers
  _unsubs.forEach(fn => { try{fn?.();}catch(_){} });
  _unsubs = [];

  // settings
  _unsubs.push(dbOnValue(dbRef(pRoomSettings(roomId)), (snap) => {
    const st = snap.exists() ? (snap.val() || {}) : {};
    emit("room:settings", st);
  }));

  // players list
  _unsubs.push(dbOnValue(dbRef(pRoomPlayers(roomId)), (snap) => {
    _players = snap.exists() ? (snap.val() || {}) : {};
    emit("players:update", _players);
  }));

  // broadcast camera + per-player override camera
  _unsubs.push(dbOnValue(dbRef(pRoomCam(roomId)), (snap) => {
    const cam = snap.exists() ? (snap.val() || null) : null;
    emit("roomCam:broadcast", cam);
  }));

  _unsubs.push(dbOnValue(dbRef(pRoomPlayerCam(roomId, s.uid)), (snap) => {
    const cam = snap.exists() ? (snap.val() || null) : null;
    emit("roomCam:player", cam);
  }));

  return { role };
}
