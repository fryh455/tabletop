import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addLog, LogType } from "./logs.js";
import { setState } from "../core/state.js";

export async function addRoll(roomId, roll){
  const ref = await addDoc(collection(db,"rooms",roomId,"rolls"), {
    ...roll,
    createdAt: serverTimestamp()
  });
  await addLog(roomId, LogType.ROLL, { action:"roll", rollId: ref.id, roll });
  return ref.id;
}

export function subRolls(roomId){
  const ref = collection(db,"rooms",roomId,"rolls");
  const q = query(ref, orderBy("createdAt","desc"), limit(200));
  return onSnapshot(q, (snap)=>{
    const rolls = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ rolls });
    window.dispatchEvent(new CustomEvent("sur4:rolls", {detail:{rolls}}));
  });
}
