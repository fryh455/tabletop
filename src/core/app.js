import firebaseConfig from "../config/firebaseConfig.js";
import { initFirebase, db, auth } from "../db/firebase.js";
import * as Auth from "../auth/auth.js";
import * as Rooms from "../db/rooms.js";
import { initMapCanvas } from "../ui/map/canvas.js";
import { renderHeader, renderSidebar } from "../ui/layout/header.js";
import { initIntentionsBoard } from "../ui/intentions/intentionsBoard.js";
import { attachTokenManager } from "../ui/tokens/tokenManager.js";
import "../styles/main.css";

let currentRoomId = null;

export function initApp() {
  initFirebase(firebaseConfig);

  const btnLogin = document.getElementById("btn-login");
  const btnRegister = document.getElementById("btn-register");
  const btnCreateRoom = document.getElementById("btn-create-room");

  if (btnLogin) btnLogin.addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    try { await Auth.login(email, password); alert('Logado'); location.reload(); } catch(e){ alert(e.message); }
  });

  if (btnRegister) btnRegister.addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    try { await Auth.register(email, password); alert('Registrado'); location.reload(); } catch(e){ alert(e.message); }
  });

  if (btnCreateRoom) btnCreateRoom.addEventListener("click", async () => {
    const res = await Rooms.createRoom({ roomMeta: { name: `Mesa ${Date.now()}` } });
    window.location.href = `room.html?roomId=${res.roomId}`;
  });

  Auth.onAuthStateChanged(user => {
    const roomsSection = document.getElementById("rooms-section");
    if (user) {
      if (roomsSection) roomsSection.classList.remove("hidden");
    } else {
      if (roomsSection) roomsSection.classList.add("hidden");
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("roomId");
  if (roomId) {
    loadRoom(roomId);
  }
}

export async function loadRoom(roomId) {
  currentRoomId = roomId;
  renderHeader();
  renderSidebar();
  const canvas = document.getElementById("map-canvas");
  initMapCanvas(canvas, roomId);
  attachTokenManager(roomId);
  initIntentionsBoard(roomId);
  // listen room for name
  Rooms.listenRoom(roomId, (roomData) => {
    const rn = document.getElementById("room-name");
    if (rn && roomData.roomMeta) rn.textContent = roomData.roomMeta.name || 'Mesa';
    // draw tokens via canvas module
    if (roomData.tokens) {
      import("../ui/map/canvas.js").then(m=>m.drawTokens(Object.values(roomData.tokens)));
    }
    // logs
    const logsEl = document.getElementById("logs-panel");
    if (logsEl && roomData.logs) {
      logsEl.innerHTML = '<h4>Logs</h4>' + Object.values(roomData.logs).slice(-20).map(l=>`<div>${l.timestamp}: ${l.type}</div>`).join('');
    }
  });
}

document.addEventListener("DOMContentLoaded", () => { initApp(); });
