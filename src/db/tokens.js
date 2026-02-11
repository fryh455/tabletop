import { db } from "./firebase.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addLog, LogType } from "./logs.js";
import { setState } from "../core/state.js";

export async function createToken(roomId, token){
  const ref = await addDoc(collection(db,"rooms",roomId,"tokens"), {
    ...token,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await addLog(roomId, LogType.TOKEN, { action:"create", tokenId: ref.id });
  return ref.id;
}

export async function updateToken(roomId, tokenId, patch){
  await updateDoc(doc(db,"rooms",roomId,"tokens",tokenId), {...patch, updatedAt: serverTimestamp()});
  await addLog(roomId, LogType.TOKEN, { action:"update", tokenId, patch });
}

export async function deleteToken(roomId, tokenId){
  await deleteDoc(doc(db,"rooms",roomId,"tokens",tokenId));
  await addLog(roomId, LogType.TOKEN, { action:"delete", tokenId });
}

export function subTokens(roomId){
  const ref = collection(db,"rooms",roomId,"tokens");
  const q = query(ref);
  return onSnapshot(q, (snap)=>{
    const tokens = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ tokens });
    window.dispatchEvent(new CustomEvent("sur4:tokens", {detail:{tokens}}));
  });
}
