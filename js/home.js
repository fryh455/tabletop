import { $, bindModal, toast, goRoom, uidShort, clampLen } from "./app.js";
import { initFirebase, onAuth, register, login, logout, dbGet, dbSet, dbUpdate, dbPush } from "./firebase.js";

initFirebase();
bindModal();

const authStatus = $("#authStatus");
const btnLogout = $("#btnLogout");
const roomsList = $("#roomsList");

let me = null;

function setLoggedIn(user){
  me = user;
  authStatus.textContent = user ? `logado: ${user.email}` : "desconectado";
  btnLogout.style.display = user ? "" : "none";
}

async function ensureUserProfile(user){
  const path = `users/${user.uid}`;
  const existing = await dbGet(path);
  if(!existing){
    await dbSet(path, { uid:user.uid, email:user.email, displayName:user.email.split("@")[0], roleList:["player"], createdAt: Date.now() });
  }
}

async function listMyRooms(){
  roomsList.innerHTML = "";
  if(!me) return;
  // naive: scan rooms list by membership index stored at users/{uid}/rooms/{roomId}=true
  const idx = await dbGet(`users/${me.uid}/rooms`);
  const roomIds = idx ? Object.keys(idx) : [];
  if(roomIds.length===0){
    roomsList.innerHTML = `<div class="item"><small>Nenhuma sala ainda.</small></div>`;
    return;
  }
  for(const roomId of roomIds){
    const meta = await dbGet(`rooms/${roomId}/roomMeta`);
    const name = meta?.name || roomId;
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `<div><strong>${name}</strong> <small class="mono">${roomId}</small></div>
    <div class="actions" style="margin-top:8px">
      <button data-open="${roomId}">Abrir</button>
      <button class="secondary" data-copy="${roomId}">Copiar link</button>
    </div>`;
    div.querySelector("[data-open]").addEventListener("click", ()=>goRoom(roomId));
    div.querySelector("[data-copy]").addEventListener("click", async ()=>{
      const url = `${location.origin}${location.pathname.replace(/index\.html$/,"")}room.html?room=${encodeURIComponent(roomId)}`;
      await navigator.clipboard.writeText(url);
      toast("Link copiado!", "ok");
    });
    roomsList.appendChild(div);
  }
}

$("#btnLogin").addEventListener("click", async ()=>{
  try{
    const email=$("#email").value.trim();
    const pass=$("#pass").value;
    await login(email, pass);
    toast("Logado!", "ok");
  }catch(e){ toast(String(e?.message||e), "error"); }
});
$("#btnRegister").addEventListener("click", async ()=>{
  try{
    const email=$("#email").value.trim();
    const pass=$("#pass").value;
    if(pass.length<6) throw new Error("Senha mínima: 6");
    await register(email, pass);
    toast("Registrado!", "ok");
  }catch(e){ toast(String(e?.message||e), "error"); }
});
btnLogout.addEventListener("click", async ()=>{
  await logout();
  toast("Saiu.", "ok");
});

$("#btnCreateRoom").addEventListener("click", async ()=>{
  try{
    if(!me) throw new Error("Faça login.");
    const name = clampLen($("#roomName").value.trim() || "Sala SUR4", 80);
    const description = clampLen($("#roomDesc").value.trim() || "", 160);
    const roomId = await dbPush("rooms", {
      masterUid: me.uid,
      roomMeta: { name, description, createdAt: Date.now(), createdBy: me.uid },
      settings: {
        map:{ gridSize:48, zoom:1 },
        fog:{ enabled:false, reveals:{} },
        permissions:{ playersCanMoveOwnToken:true }
      },
      players: {}
    });
    // join as master
    await dbSet(`rooms/${roomId}/players/${me.uid}`, { uid:me.uid, role:"master", connected:true, joinedAt:Date.now(), lastSeenAt:Date.now() });
    await dbUpdate(`users/${me.uid}/rooms`, { [roomId]: true });
    toast("Sala criada!", "ok");
    goRoom(roomId);
  }catch(e){ toast(String(e?.message||e), "error"); }
});

$("#btnJoinRoom").addEventListener("click", async ()=>{
  try{
    if(!me) throw new Error("Faça login.");
    const roomId = $("#joinRoomId").value.trim();
    if(!roomId) throw new Error("Informe roomId.");
    const room = await dbGet(`rooms/${roomId}`);
    if(!room) throw new Error("Sala não existe.");
    const role = (room.masterUid===me.uid) ? "master" : "player";
    await dbSet(`rooms/${roomId}/players/${me.uid}`, { uid:me.uid, role, connected:true, joinedAt:Date.now(), lastSeenAt:Date.now() });
    await dbUpdate(`users/${me.uid}/rooms`, { [roomId]: true });
    toast("Entrou na sala!", "ok");
    goRoom(roomId);
  }catch(e){ toast(String(e?.message||e), "error"); }
});

onAuth(async (user)=>{
  setLoggedIn(user);
  if(user){
    await ensureUserProfile(user);
    await listMyRooms();
  }else{
    roomsList.innerHTML = `<div class="item"><small>Faça login para ver suas salas.</small></div>`;
  }
});
