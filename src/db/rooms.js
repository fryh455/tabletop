import { db, ref, push, set, onValue, update } from "./firebase.js";
import { getAuthInstance } from "../auth/auth.js";

function now(){ return Date.now(); }

export async function createRoom(payload={}){
  const roomsRef = ref(db, '/rooms');
  const newRoomRef = push(roomsRef);
  const roomId = newRoomRef.key;
  const user = getAuthInstance().currentUser;
  const masterUid = user ? user.uid : 'anon_'+Date.now();
  const roomObj = {
    masterUid,
    roomMeta: payload.roomMeta || { name: 'Mesa sem nome' },
    settings: payload.settings || {},
    createdAt: now()
  };
  await set(newRoomRef, roomObj);
  await set(ref(db, `/rooms/${roomId}/players/${masterUid}`), { characterId:null, tokenId:null, role:'master', connected:true });
  return { roomId, roomObj };
}

export function joinRoom(roomId){
  const user = getAuthInstance().currentUser;
  if(!user) throw new Error('Not authenticated');
  return set(ref(db, `/rooms/${roomId}/players/${user.uid}`), { characterId:null, tokenId:null, role:'player', connected:true });
}

export function listenRoom(roomId, cb){
  const rref = ref(db, `/rooms/${roomId}`);
  onValue(rref, snap => cb(snap.val() || {}));
}
