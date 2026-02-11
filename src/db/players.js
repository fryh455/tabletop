import { db, ref, update } from "./firebase.js";

export function updatePlayerToken(roomId, uid, tokenData){
  const playerRef = ref(db, `/rooms/${roomId}/players/${uid}`);
  return update(playerRef, tokenData);
}
