import { dbApi } from "../firebase/firebase.js";
import { db } from "../firebase/firebase.js";
import { paths } from "./paths.js";

const { ref, set, update, push, remove, get, child, runTransaction, serverTimestamp } = dbApi;

export function r(path) { return ref(db, path); }
export async function setv(path, value) { return set(r(path), value); }
export async function upv(path, patch) { return update(r(path), patch); }
export async function del(path) { return remove(r(path)); }
export function nowTs() { return serverTimestamp(); }

export async function pushv(path, value) {
  const p = push(r(path));
  await set(p, value);
  return p.key;
}

// transactional: create room if empty
export async function createRoomAtomic(roomId, meta) {
  const roomRef = r(paths.room(roomId));
  const res = await runTransaction(roomRef, (current) => {
    if (current) return; // abort
    return {
      meta,
      players: {},
      tokens: {},
      sheets: {},
      rolls: {},
      map: {
        locked: false,
        fog: { enabled: false, opacity: 0.6, imageBase64: null, rects: {} },
        view: { enabled: false, zoom: 1, panX: 0, panY: 0 }
      }
    };
  }, { applyLocally: false });
  return !!res.committed;
}

export async function roomExists(roomId) {
  const snap = await get(r(paths.roomMeta(roomId)));
  return snap.exists();
}
