import { initFirebase, auth, db } from "../db/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getRoomIdFromURL, goHome } from "./router.js";
import { state, setState } from "./state.js";
import { renderHeader } from "../ui/layout/header.js";
import { renderAuthCard } from "../auth/auth.js";
import { renderRoomsCard } from "../ui/layout/panels.js";
import { mountRoomUI } from "../ui/layout/tabs.js";
import { subscribeRoomAll } from "../db/rooms.js";
import { toast } from "../utils/helpers.js";

export async function boot(){
  initFirebase();
  renderHeader({ mode:"home" });

  const authCard=document.getElementById("auth-card");
  const roomsCard=document.getElementById("rooms-card");

  renderAuthCard(authCard, {
    onAuthed: ()=>{}
  });

  onAuthStateChanged(auth, async (user)=>{
    setState({ user });
    renderHeader({ mode:"home", user, onLogout: async ()=>{
      await signOut(auth);
      toast("Logout realizado.");
    }});
    if (user){
      roomsCard.classList.remove("hidden");
      renderRoomsCard(roomsCard);
    } else {
      roomsCard.classList.add("hidden");
    }
  });
}

export async function bootRoom(){
  initFirebase();
  const roomId=getRoomIdFromURL();
  if (!roomId){
    toast("RoomId ausente na URL.", "error");
    goHome();
    return;
  }
  setState({ roomId });
  renderHeader({ mode:"room" });

  onAuthStateChanged(auth, async (user)=>{
    setState({ user });
    renderHeader({ mode:"room", user, onHome: goHome, onLogout: async ()=>{
      await signOut(auth);
      toast("Logout realizado.");
      goHome();
    }});
    if (!user){
      toast("Faça login para entrar na sala.", "warn");
      goHome();
      return;
    }
    // monta UI (sidebar + content)
    mountRoomUI();
    // subscrições do Firestore para tudo da sala
    await subscribeRoomAll(roomId, user.uid);
  });
}
