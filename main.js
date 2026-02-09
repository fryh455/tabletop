/* =========================
   FIREBASE / REFS
========================= */
firebase.initializeApp({
  apiKey: "AIzaSyBjSCYNOngXOSQGBU7jMj1kgf7hunfMjyI",
  authDomain: "marionetes-do-destino.firebaseapp.com",
  databaseURL: "https://marionetes-do-destino-default-rtdb.firebaseio.com",
  projectId: "marionetes-do-destino"
});
const auth = firebase.auth();
const db = firebase.database();
const usersRef = db.ref("users");
const tokensRefRoot = db.ref("rooms/default/tokens"); // single default room

/* =========================
   UI REFS
========================= */
const whoSpan = document.getElementById("who");
const btnSignOut = document.getElementById("btnSignOut");
const createTokenBtn = document.getElementById("createToken");
const sheet = document.getElementById("sheet");
const viewport = document.getElementById("viewport");
const world = document.getElementById("world");

/* =========================
   APP STATE
========================= */
let currentUser = null; // { uid, email, role }
let scale = 1, offsetX = 0, offsetY = 0;
const tokenElements = {}; // id -> { el, data }

/* =========================
   HELPERS
========================= */
function updateTransform(){ world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`; }

function screenToWorld(clientX, clientY){
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale
  };
}

function canMoveToken(tokenData){
  if(!currentUser) return false;
  if(currentUser.role === "mestre") return true;
  return tokenData && tokenData.owner === currentUser.uid;
}

function refreshTokenMovableClass(id){
  const entry = tokenElements[id];
  if(!entry) return;
  const el = entry.el;
  const data = entry.data;
  if(canMoveToken(data)) el.classList.add("movable");
  else el.classList.remove("movable");
}

/* =========================
   CREATE / UPDATE TOKEN ELEMENT (preserve listeners)
   Uses pointer events and optimistic UI
========================= */
function createOrUpdateToken(id, data){
  let entry = tokenElements[id];
  if(!entry){
    const el = document.createElement("div");
    el.className = "token";
    el.id = id;
    el.textContent = data.label ? data.label[0].toUpperCase() : "T";
    world.appendChild(el);

    entry = { el, data: {} };
    tokenElements[id] = entry;

    // pointer interactions
    el.addEventListener("pointerenter", ()=> refreshTokenMovableClass(id));
    el.addEventListener("pointerleave", ()=> { /* keep state class until refresh */ });

    // dragging
    let dragging = false;
    let pointerId = null;
    let offX = 0, offY = 0;

    el.addEventListener("pointerdown", (ev)=>{
      ev.stopPropagation();
      // ensure permission
      const latest = entry.data || data;
      if(!canMoveToken(latest)) return;
      dragging = true;
      pointerId = ev.pointerId;
      el.setPointerCapture(pointerId);
      el.classList.add("dragging");
      offX = ev.offsetX;
      offY = ev.offsetY;
    });

    window.addEventListener("pointermove", (ev)=>{
      if(!dragging || ev.pointerId !== pointerId) return;
      const pos = screenToWorld(ev.clientX, ev.clientY);
      const nx = pos.x - offX;
      const ny = pos.y - offY;
      el.style.left = nx + "px";
      el.style.top = ny + "px";
      // optimistic update
      entry.data.x = nx; entry.data.y = ny;
      // sync to Firebase (throttle optional)
      tokensRefRoot.child(id).update({ x: nx, y: ny });
    });

    window.addEventListener("pointerup", (ev)=>{
      if(!dragging || ev.pointerId !== pointerId) return;
      dragging = false;
      try{ entry.el.releasePointerCapture(pointerId);}catch{}
      pointerId = null;
      el.classList.remove("dragging");
    });

    // click -> open sheet (editable only if canMoveToken)
    el.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      openSheetForToken(id, entry.data);
    });
  }

  // update stored data and position
  entry.data = Object.assign({}, entry.data, data);
  entry.el.style.left = (entry.data.x || 0) + "px";
  entry.el.style.top  = (entry.data.y || 0) + "px";
  entry.el.textContent = entry.data.label ? entry.data.label[0].toUpperCase() : "T";
  // store owner for quick access
  entry.el.dataset.owner = entry.data.owner || "";
  refreshTokenMovableClass(id);
}

/* remove token */
function removeToken(id){
  const entry = tokenElements[id];
  if(!entry) return;
  entry.el.remove();
  delete tokenElements[id];
}

/* =========================
   SHEET UI (editable if permitted)
========================= */
function openSheetForToken(id, data){
  if(!data) return;
  sheet.classList.remove("hidden");
  const ownerLabel = data.owner ? (data.owner === currentUser?.uid ? "Você" : data.owner) : "Sem dono";
  sheet.innerHTML = `
    <div><strong>${data.name || "Token"}</strong></div>
    <div>Dono: ${ownerLabel}</div>
    <label>Nome</label><input id="sheet_name" value="${data.name||''}" />
    <label>HP</label><input id="sheet_hp" type="number" value="${data.hp||0}" />
    <label>Notas</label><textarea id="sheet_notes">${data.notes||''}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="sheet_save">Salvar</button>
      <button id="sheet_close">Fechar</button>
    </div>
  `;
  const canEdit = canMoveToken(data);
  document.getElementById("sheet_name").disabled = !canEdit;
  document.getElementById("sheet_hp").disabled = !canEdit;
  document.getElementById("sheet_notes").disabled = !canEdit;
  document.getElementById("sheet_save").disabled = !canEdit;

  document.getElementById("sheet_close").onclick = ()=> sheet.classList.add("hidden");
  document.getElementById("sheet_save").onclick = ()=>{
    const name = document.getElementById("sheet_name").value;
    const hp = Number(document.getElementById("sheet_hp").value);
    const notes = document.getElementById("sheet_notes").value;
    tokensRefRoot.child(id).update({ name, hp, notes });
  };
}

/* =========================
   FIREBASE LISTENERS (child events to preserve listeners)
========================= */
tokensRefRoot.on("child_added", snap => { createOrUpdateToken(snap.key, snap.val()); });
tokensRefRoot.on("child_changed", snap => { createOrUpdateToken(snap.key, snap.val()); });
tokensRefRoot.on("child_removed", snap => { removeToken(snap.key); });

/* =========================
   AUTH UI & FLOW
========================= */
auth.onAuthStateChanged(async user => {
  if(!user){ // not logged -> redirect to login
    location.href = "login.html";
    return;
  }
  // load profile role
  const uid = user.uid;
  const snap = await usersRef.child(uid).once("value");
  const profile = snap.val() || {};
  currentUser = { uid, email: user.email, role: profile.role || "player" };
  whoSpan.textContent = `${currentUser.email} (${currentUser.role})`;
  // refresh movable classes on existing tokens
  Object.keys(tokenElements).forEach(id => refreshTokenMovableClass(id));
});

btnSignOut.onclick = async () => { await auth.signOut(); };

/* =========================
   CREATE TOKEN (owner = current user)
========================= */
createTokenBtn.onclick = ()=>{
  if(!currentUser){ alert("Aguarde login..."); return; }
  const id = "token_" + Date.now();
  tokensRefRoot.child(id).set({
    x: 300,
    y: 300,
    owner: currentUser.uid,
    name: currentUser.email?.split("@")[0] || "Token",
    label: currentUser.role === "mestre" ? "M" : "P",
    hp: 10,
    notes: ""
  });
};

/* =========================
   MAP PAN & ZOOM
========================= */
let panning = false, px0=0, py0=0;
viewport.addEventListener("mousedown", e=>{
  if(e.target.closest(".token")) return;
  panning = true; px0 = e.clientX - offsetX; py0 = e.clientY - offsetY; viewport.style.cursor="grabbing";
});
window.addEventListener("mousemove", e=>{
  if(!panning) return;
  offsetX = e.clientX - px0; offsetY = e.clientY - py0; updateTransform();
});
window.addEventListener("mouseup", ()=>{ if(panning) panning=false; viewport.style.cursor="grab"; });

viewport.addEventListener("wheel", e=>{
  e.preventDefault();
  const before = screenToWorld(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? 1.12 : 0.9;
  scale = Math.min(Math.max(scale * factor, 0.3), 3);
  const after = screenToWorld(e.clientX, e.clientY);
  offsetX += (after.x - before.x) * scale;
  offsetY += (after.y - before.y) * scale;
  updateTransform();
},{passive:false});

/* click outside sheet hides it */
viewport.addEventListener("click", ()=> sheet.classList.add("hidden"));

/* initial */
updateTransform();
