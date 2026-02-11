import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LOG_TYPES } from "../utils/constants.js";
import { setState, state } from "../core/state.js";

export async function addLog(roomId, type, payload){
  const ref = collection(db, "rooms", roomId, "logs");
  await addDoc(ref, { type, payload, createdAt: serverTimestamp() });
}

export function subLogs(roomId){
  const ref = collection(db, "rooms", roomId, "logs");
  const q = query(ref, orderBy("createdAt","desc"), limit(200));
  return onSnapshot(q, (snap)=>{
    const logs = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ logs });
    window.dispatchEvent(new CustomEvent("sur4:logs", {detail:{logs}}));
  });
}

export const LogType = LOG_TYPES;
