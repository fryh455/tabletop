import { db, ref, push } from "./firebase.js";

export function pushRoll(roomId, rollObj){
  const rollsRef = ref(db, `/rooms/${roomId}/rolls`);
  return push(rollsRef, rollObj);
}
