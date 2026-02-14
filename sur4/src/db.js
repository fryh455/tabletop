import { db, fb } from "./firebase.js";
const { ref, onValue, set, update, push, remove, get } = fb;
export function R(path){ return ref(db, path); }
export function on(path, cb){ return onValue(R(path), (s)=>cb(s.val())); }
export async function SET(path, v){ return set(R(path), v); }
export async function UP(path, v){ return update(R(path), v); }
export async function DEL(path){ return remove(R(path)); }
export async function PUSH(path, v){ const p = push(R(path)); await set(p, v); return p.key; }
export async function GET(path){ const s = await get(R(path)); return s.exists() ? s.val() : null; }
export const P = {
  room: (roomId)=>`rooms/${roomId}`,
  meta: (roomId)=>`rooms/${roomId}/meta`,
  players: (roomId)=>`rooms/${roomId}/players`,
  player: (roomId, uid)=>`rooms/${roomId}/players/${uid}`,
  tokens: (roomId)=>`rooms/${roomId}/tokens`,
  token: (roomId, tokenId)=>`rooms/${roomId}/tokens/${tokenId}`,
  groups: (roomId)=>`rooms/${roomId}/groups`,
  group: (roomId, gid)=>`rooms/${roomId}/groups/${gid}`,
  sheets: (roomId)=>`rooms/${roomId}/sheets`,
  sheet: (roomId, sid)=>`rooms/${roomId}/sheets/${sid}`,
  rolls: (roomId)=>`rooms/${roomId}/rolls`,
  map: (roomId)=>`rooms/${roomId}/map`,
  fog: (roomId)=>`rooms/${roomId}/map/fog`,
  fogRects: (roomId)=>`rooms/${roomId}/map/fog/rects`,
  marks: (roomId)=>`rooms/${roomId}/marks`
};
