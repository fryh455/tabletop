/* =========================
   FIREBASE CONFIG (seu projeto)
========================= */
firebase.initializeApp({
  apiKey: "AIzaSyBjSCYNOngXOSQGBU7jMj1kgf7hunfMjyI",
  authDomain: "marionetes-do-destino.firebaseapp.com",
  databaseURL: "https://marionetes-do-destino-default-rtdb.firebaseio.com",
  projectId: "marionetes-do-destino"
});
const auth = firebase.auth();
const db = firebase.database();
const tokensRefRoot = db.ref("rooms/default/tokens"); // rooms structure (simple single room)
const usersRef = db.ref("users");

/* =========================
   UI refs
========================= */
const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const sheet = document.getElementById("sheet");

const regEmail = document.getElementById("reg_email");
const regPass = document.getElementById("reg_pass");
const regRole = document.getElementById("reg_role");
const btnRegister = document.getElementById("btnRegister");

const logEmail = document.getElementById("log_email");
const logPass = document.getElementById("log_pass");
const btnLogin = document.getElementById("btnLogin");

const userInfo = document.getElementById("userInfo");
const whoSpan = document.getElementById("who");
const btnSignOut = document.getElementById("btnSignOut");

const createTokenBtn = document.getElementById("createToken");

/* =========================
   App state
========================= */
let currentUser = null; // { uid, email, role }
let scale = 1, offsetX = 0, offsetY = 0;
const tokenElements = {}; // id -> { el, data }

/* =========================
   Utils
========================= */
function updateTransform(){ world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`; }

/* convert screen coords to world coords */
function screenToWorld(clientX, clientY){
  const r = viewport.getBoundingClientRect();
  return {
    x: (clientX - r.left - offsetX) / scale,
    y: (clientY - r.top - offsetY) / scale
  };
}

/* permission helper */
function canMoveToken(tokenData){
  if(!currentUser) return false;
  if(currentUser.role === "mestre") return true;
  // player: can move token if owner === uid
  return tokenData && tokenData.owner === currentUser.uid;
}

/* add/remove movable class based on permission */
function refreshTokenMovableClass(id){
  const t = tokenElements[id];
  if(!t) return;
  const el = t.el;
  const data = t.data;
  if(canMoveToken(data)) el.classList.add("movable");
  else el.classList.remove("movable");
}

/* safe setter to set data on token element without removing listeners */
function createOrUpdateToken(id, data){
  let entry = tokenElements[id];
  if(!entry){
    const el = document.createElement("div");
    el.className = "token";
    el.id = id;
    el.textContent = ""; // could add initials
    world.appendChild(el);

    entry = { el, data: {} };
    tokenElements[id] = entry;

    // hover: highlight if movable
    el.addEventListener("pointerenter", ()=> refreshTokenMovableClass(id));
    el.addEventListener("pointerleave", ()=> el.classList.remove("movable"));

    // dragging logic (pointer events)
    let dragging = false;
    let pointerId = null;
    let offsetPointerX = 0, offsetPointerY = 0;

    el.addEventListener("pointerdown", (e)=>{
      e.stopPropagation();
      // only start dragging if permission allows
      const latest = entry.data || data;
      if(!canMoveToken(latest)) return;
      dragging = true;
      pointerId = e.pointerId;
      el.setPointerCapture(pointerId);
      el.classList.add("dragging");
      offsetPointerX = e.offsetX;
      offsetPointerY = e.offsetY;
    });

    window.addEventListener("pointermove", (e)=>{
      if(!dragging || e.pointerId !== pointerId) return;
      const pos = screenToWorld(e.clientX, e.clientY);
      const nx = pos.x - offsetPointerX;
      const ny = pos.y - offsetPointerY;
      el.style.left = nx + "px";
      el.style.top = ny + "px";
      // optimistic UI: update local data
      entry.data.x = nx; entry.data.y = ny;
      // sync to firebase (throttle small)
      tokensRefRoot.child(id).update({ x: nx, y: ny });
    });

    window.addEventListener("pointerup", (e)=>{
      if(!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      el.classList.remove("dragging");
      try{ el.releasePointerCapture(pointerId); } catch {}
      pointerId = null;
      // final position already synced in pointermove
    });

    // click opens sheet (editable if owner/mestre)
    el.addEventListener("click", (e)=>{
      e.stopPropagation();
      openSheetForToken(id, entry.data);
    });
  }

  // update stored data and position (but preserve listeners)
  entry.data = Object.assign({}, entry.data, data);
  entry.el.style.left = (entry.data.x || 0) + "px";
  entry.el.style.top  = (entry.data.y || 0) + "px";
  // update movable highlight immediately
  refreshTokenMovableClass(id);
}

/* remove token */
function removeTokenElement(id){
  const entry = tokenElements[id];
  if(!entry) return;
  entry.el.remove();
  delete tokenElements[id];
}

/* =========================
   UI: sheet (editable)
========================= */
function openSheetForToken(id, data){
  if(!data) return;
  sheet.classList.remove("hidden");
  const ownerLabel = data.owner ? (data.owner === currentUser?.uid ? "Você" : data.owner) : "Sem dono";
  sheet.innerHTML = `
    <div><strong>${data.name || "Token"}</strong></div>
    <div>Dono: ${ownerLabel}</div>
    <label>Nome</label><input id="sheet_name" value="${data.name || ""}" />
    <label>HP</label><input id="sheet_hp" type="number" value="${data.hp || 0}" />
    <label>Notas</label><textarea id="sheet_notes">${data.notes || ""}</textarea>
    <button id="sheet_save">Salvar</button>
    <button id="sheet_close">Fechar</button>
  `;

  // enable/disable fields based on permission: owner or mestre can edit
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
   Firebase listeners (tokens)
   Use child_x listeners to avoid rebuilding and preserve listeners
========================= */
tokensRefRoot.on("child_added", snap => {
  const id = snap.key;
  const data = snap.val();
  createOrUpdateToken(id, data);
});
tokensRefRoot.on("child_changed", snap => {
  const id = snap.key;
  const data = snap.val();
  createOrUpdateToken(id, data);
});
tokensRefRoot.on("child_removed", snap => {
  removeTokenElement(snap.key);
});

/* =========================
   AUTH (register / login)
========================= */
btnRegister.onclick = async () => {
  try{
    const email = regEmail.value.trim();
    const pass = regPass.value;
    const role = regRole.value;
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;
    // save user profile (role)
    usersRef.child(uid).set({ email, role });
    // set currentUser locally (onAuthStateChanged will also fire)
  }catch(err){
    alert("Erro register: " + err.message);
  }
};

btnLogin.onclick = async () => {
  try{
    const email = logEmail.value.trim();
    const pass = logPass.value;
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    alert("Erro login: " + err.message);
  }
};

btnSignOut.onclick = async () => {
  await auth.signOut();
};

/* on auth change, load profile and update UI */
auth.onAuthStateChanged(async user=>{
  if(user){
    const uid = user.uid;
    // read role from DB
    const snapshot = await usersRef.child(uid).once("value");
    const profile = snapshot.val() || {};
    currentUser = { uid, email: user.email, role: profile.role || "player" };
    // update UI
    document.getElementById("auth-forms").style.display = "none";
    userInfo.style.display = "flex";
    whoSpan.textContent = `${currentUser.email} (${currentUser.role})`;
    // refresh all token classes (movable)
    Object.keys(tokenElements).forEach(id=> refreshTokenMovableClass(id));
  } else {
    currentUser = null;
    document.getElementById("auth-forms").style.display = "flex";
    userInfo.style.display = "none";
    whoSpan.textContent = "";
    // remove movable class
    Object.keys(tokenElements).forEach(id=>{
      tokenElements[id].el.classList.remove("movable");
    });
  }
});

/* =========================
   Create token (owner = current user)
========================= */
createTokenBtn.onclick = ()=>{
  if(!currentUser){
    alert("Faça login para criar tokens.");
    return;
  }
  const id = "token_" + Date.now();
  tokensRefRoot.child(id).set({
    x: 300,
    y: 300,
    owner: currentUser.uid,
    name: currentUser.email?.split("@")[0] || "Token",
    hp: 10,
    notes: ""
  });
};

/* =========================
   Map pan & zoom (desktop)
========================= */
let panning = false, panStartX=0, panStartY=0;
viewport.addEventListener("mousedown", (e)=>{
  if(e.target.closest(".token")) return;
  panning = true;
  panStartX = e.clientX - offsetX;
  panStartY = e.clientY - offsetY;
  viewport.style.cursor = "grabbing";
});
window.addEventListener("mousemove", e=>{
  if(!panning) return;
  offsetX = e.clientX - panStartX;
  offsetY = e.clientY - panStartY;
  updateTransform();
});
window.addEventListener("mouseup", ()=>{
  if(panning) panning=false;
  viewport.style.cursor = "grab";
});
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

/* click outside sheet hides */
viewport.addEventListener("click", ()=> sheet.classList.add("hidden"));

/* =========================
   initial transform
========================= */
updateTransform();
