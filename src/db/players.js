import { db } from "./firebase.js";
import { collection, query, onSnapshot, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setState, state } from "../core/state.js";

export function subPlayers(roomId, myUid){
  const ref = collection(db, "rooms", roomId, "players");
  const q = query(ref, orderBy("joinedAt","asc"));
  return onSnapshot(q, async (snap)=>{
    const players = snap.docs.map(d=>({id:d.id, ...d.data()}));
    setState({ players });

    const me = players.find(p=>p.uid===myUid) || null;
    setState({ player: me });
    window.dispatchEvent(new CustomEvent("sur4:players", {detail:{players, me}}));
  });
}
