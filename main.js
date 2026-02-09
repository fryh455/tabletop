/* =========================
   FIREBASE CONFIG
========================= */
firebase.initializeApp({
  apiKey: "AIzaSyBjSCYNOngXOSQGBU7jMj1kgf7hunfMjyI",
  authDomain: "marionetes-do-destino.firebaseapp.com",
  databaseURL: "https://marionetes-do-destino-default-rtdb.firebaseio.com",
  projectId: "marionetes-do-destino"
});
const db = firebase.database();
const tokensRef = db.ref("tokens");

/* =========================
   WORLD STATE
========================= */
const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const sheet = document.getElementById("sheet");

let scale = 1, offsetX = 0, offsetY = 0;
function updateTransform() {
  world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

/* =========================
   MAP DRAG
========================= */
let draggingMap = false, startX, startY;
viewport.addEventListener("mousedown", e => {
  if(e.target.classList.contains("token")) return;
  draggingMap = true;
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
  viewport.style.cursor = "grabbing";
});
window.addEventListener("mouseup", () => { draggingMap=false; viewport.style.cursor="grab"; });
window.addEventListener("mousemove", e => {
  if(!draggingMap) return;
  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;
  updateTransform();
});

/* =========================
   ZOOM
========================= */
viewport.addEventListener("wheel", e => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  scale = Math.min(Math.max(scale*delta,0.3),3);
  updateTransform();
},{passive:false});

/* =========================
   TOKENS
========================= */
const tokenElements = {};

function createOrUpdateToken(id, data){
  let el = tokenElements[id];
  if(!el){
    el = document.createElement("div");
    el.className="token";
    el.id=id;
    world.appendChild(el);
    tokenElements[id] = el;

    // Drag
    let dragging=false, dx=0, dy=0;
    el.addEventListener("mousedown", e => {
      e.stopPropagation();
      dragging=true;
      dx=e.offsetX;
      dy=e.offsetY;
    });
    window.addEventListener("mousemove", e => {
      if(!dragging) return;
      const x = (e.clientX - offsetX)/scale - dx;
      const y = (e.clientY - offsetY)/scale - dy;
      el.style.left = x + "px";
      el.style.top = y + "px";
      tokensRef.child(id).update({x,y});
    });
    window.addEventListener("mouseup", ()=>dragging=false);

    // Click abre ficha
    el.addEventListener("click", e=>{
      e.stopPropagation();
      sheet.style.display="block";
      sheet.innerHTML = `
        <strong>Ficha Token</strong><br>
        ID: ${id}<br>
        X: ${Math.round(parseFloat(el.style.left))}<br>
        Y: ${Math.round(parseFloat(el.style.top))}
      `;
    });
  }

  el.style.left = data.x + "px";
  el.style.top = data.y + "px";
}

/* =========================
   FIREBASE SYNC
========================= */
tokensRef.on("value", snap=>{
  const tokens = snap.val()||{};
  Object.keys(tokens).forEach(id=> createOrUpdateToken(id, tokens[id]));
  Object.keys(tokenElements).forEach(id=>{
    if(!tokens[id]){
      tokenElements[id].remove();
      delete tokenElements[id];
    }
  });
});

/* =========================
   CREATE TOKEN
========================= */
document.getElementById("createToken").onclick = ()=>{
  const id = "token_"+Date.now();
  tokensRef.child(id).set({x:300,y:300});
};
