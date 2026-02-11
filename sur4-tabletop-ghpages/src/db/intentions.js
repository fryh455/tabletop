import { db } from "./firebase.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addLog, LogType } from "./logs.js";
import { setState } from "../core/state.js";

export async function upsertIntention(roomId, intentionId, data){
  if (!intentionId){
    const ref = await addDoc(collection(db,"rooms",roomId,"intentions"), {
      ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await addLog(roomId, LogType.INTENTION, { action:"create", intentionId: ref.id, data });
    return ref.id;
  }
  await updateDoc(doc(db,"rooms",roomId,"intentions",intentionId), {
    ...data, updatedAt: serverTimestamp()
  });
  await addLog(roomId, LogType.INTENTION, { action:"update", intentionId, data });
  return intentionId;
}

export async function deleteIntention(roomId, intentionId){
  await deleteDoc(doc(db,"rooms",roomId,"intentions",intentionId));
  await addLog(roomId, LogType.INTENTION, { action:"delete", intentionId });
}

export function subIntentions(roomId, myUid){
  const ref = collection(db,"rooms",roomId,"intentions");
  const q = query(ref);
  return onSnapshot(q, (snap)=>{
    const intentions = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ intentions });
    window.dispatchEvent(new CustomEvent("sur4:intentions", {detail:{intentions}}));
  });
}
