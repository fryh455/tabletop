import { db } from "./firebase.js";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, serverTimestamp,
  query, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ROLE_MASTER, ROLE_PLAYER } from "../utils/constants.js";
import { setState, state } from "../core/state.js";
import { addLog, LogType, subLogs } from "./logs.js";
import { subPlayers } from "./players.js";
import { subCharacters } from "./characters.js";
import { subTokens } from "./tokens.js";
import { subRolls } from "./rolls.js";
import { subIntentions } from "./intentions.js";

export async function createRoom({ name, uid, role=ROLE_MASTER }){
  const ref = await addDoc(collection(db,"rooms"), {
    name,
    createdAt: serverTimestamp(),
    createdBy: uid,
    fog: { enabled:false, mask: [] },
    map: { gridSize: 48, zoom: 1 }
  });
  await joinRoom({ roomId: ref.id, uid, role });
  await addLog(ref.id, LogType.ROOM, { action:"create_room", name, uid, role });
  return ref.id;
}

export async function joinRoom({ roomId, uid, role=ROLE_PLAYER, displayName="" }){
  const pref = doc(db, "rooms", roomId, "players", uid);
  await setDoc(pref, { uid, role, displayName, joinedAt: serverTimestamp() }, { merge:true });
  await addLog(roomId, LogType.ROOM, { action:"join_room", uid, role });
}

export async function getRoom(roomId){
  const ref = doc(db,"rooms",roomId);
  const snap = await getDoc(ref);
  return snap.exists()? {id:snap.id, ...snap.data()} : null;
}

export async function updateRoom(roomId, patch){
  const ref = doc(db,"rooms",roomId);
  await updateDoc(ref, patch);
  await addLog(roomId, LogType.ROOM, { action:"update_room", patch });
}

export function subRoom(roomId){
  const ref = doc(db,"rooms",roomId);
  return onSnapshot(ref, (snap)=>{
    const room = snap.exists()? {id:snap.id, ...snap.data()} : null;
    setState({ room });
    window.dispatchEvent(new CustomEvent("sur4:room", {detail:{room}}));
  });
}

export async function subscribeRoomAll(roomId, uid){
  const room = await getRoom(roomId);
  if (!room) throw new Error("Sala não existe.");
  setState({ room });
  // player doc will come via subPlayers; but we set locally after it arrives
  const unsubs = [];
  unsubs.push(subRoom(roomId));
  unsubs.push(subPlayers(roomId, uid));
  unsubs.push(subCharacters(roomId));
  unsubs.push(subTokens(roomId));
  unsubs.push(subRolls(roomId));
  unsubs.push(subIntentions(roomId, uid));
  unsubs.push(subLogs(roomId));
  window.__SUR4_UNSUBS__ = unsubs;
}
