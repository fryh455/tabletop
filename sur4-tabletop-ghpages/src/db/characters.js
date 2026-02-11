import { db } from "./firebase.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addLog, LogType } from "./logs.js";
import { setState } from "../core/state.js";

export async function createCharacter(roomId, char){
  const ref = await addDoc(collection(db,"rooms",roomId,"characters"), {
    ...char,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await addLog(roomId, LogType.CHARACTER, { action:"create", charId: ref.id });
  return ref.id;
}

export async function updateCharacter(roomId, charId, patch){
  await updateDoc(doc(db,"rooms",roomId,"characters",charId), {
    ...patch, updatedAt: serverTimestamp()
  });
  await addLog(roomId, LogType.CHARACTER, { action:"update", charId, patch });
}

export async function deleteCharacter(roomId, charId){
  await deleteDoc(doc(db,"rooms",roomId,"characters",charId));
  await addLog(roomId, LogType.CHARACTER, { action:"delete", charId });
}

export function subCharacters(roomId){
  const ref = collection(db,"rooms",roomId,"characters");
  const q = query(ref, orderBy("updatedAt","desc"));
  return onSnapshot(q, (snap)=>{
    const characters = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ characters });
    window.dispatchEvent(new CustomEvent("sur4:characters", {detail:{characters}}));
  });
}
