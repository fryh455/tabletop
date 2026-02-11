console.log("SUR4 BUILD v26");

import { $, $$, bindModal, toast, goHome, esc, clampLen, num, uidShort } from "./app.js";
import { initFirebase, onAuth, logout, dbGet, dbSet, dbUpdate, dbPush, dbOn } from "./firebase.js";
import { roll as rollDice } from "./sur4.js";
import { uploadToPostImage } from "./postimage.js";

initFirebase();
bindModal();

const roomId = new URL(location.href).searchParams.get("room");
if(!roomId){ toast("Sem roomId na URL.", "error"); }

$("#btnHome").addEventListener("click", ()=>goHome());
$("#btnLogout").addEventListener("click", async ()=>{ await logout(); goHome(); });

const panelRoot = $("#panelRoot");

let me=null;
let meNick="";
let role="player";
let room=null;
let players={}, tokens={}, characters={}, rolls={}, logs={}, markers={};
let unsub=[];

function clearSubs(){ unsub.forEach(fn=>fn&&fn()); unsub=[]; }
function isMaster(){ return (me && room && room.masterUid===me.uid) || role==="master"; }
function canEditToken(tokenId, t){
  if(isMaster()) return true;
  if(t?.ownerUid && me && t.ownerUid===me.uid) return true;
  const myTok = players?.[me?.uid]?.tokenId;
  return !!(myTok && tokenId && tokenId===myTok);
}
function canOpenSheet(tokenId, t){
  if(isMaster()) return true;
  if(t?.ownerUid && me && t.ownerUid===me.uid) return true;
  const myTok = players?.[me?.uid]?.tokenId;
  if(myTok && tokenId && tokenId===myTok) return true;
  const myChar = players?.[me?.uid]?.characterId;
  return !!(myChar && t?.linkedCharId===myChar);
}

function setHeader(){
  $("#roomTitle").textContent = room?.roomMeta?.name || "Sala";
  $("#roomSub").textContent = roomId || "";
  $("#me").textContent = me ? `${me.email} (${uidShort(me.uid)})` : "";
  $("#role").textContent = role.toUpperCase();
}

async function ensureJoin(){
  const r = await dbGet(`rooms/${roomId}`);
  if(!r) throw new Error("Sala não existe.");
  room = r;
  role = (room.masterUid===me.uid) ? "master" : (room.players?.[me.uid]?.role || "player");
  await dbSet(`rooms/${roomId}/players/${me.uid}`, {
    uid: me.uid, role, connected:true,
    joinedAt: room.players?.[me.uid]?.joinedAt || Date.now(),
    lastSeenAt: Date.now(),
    characterId: room.players?.[me.uid]?.characterId || null,
    tokenId: room.players?.[me.uid]?.tokenId || null
  });
  await dbUpdate(`users/${me.uid}/rooms`, { [roomId]: true });
}

function subAll(){
  clearSubs();
  unsub.push(dbOn(`rooms/${roomId}`, (v)=>{ if(v){ room=v; setHeader(); mapRender(); syncToolsUI(); } }));
  unsub.push(dbOn(`rooms/${roomId}/players`, (v)=>{ players=v||{}; if(me) role = (room?.masterUid===me.uid) ? "master" : (players?.[me.uid]?.role || "player"); syncToolsUI(); }));
  unsub.push(dbOn(`rooms/${roomId}/tokens`, (v)=>{ tokens=v||{}; mapRender(); syncToolsUI(); }));
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; syncToolsUI(); refreshOpenSheetIfNeeded(); }));
  unsub.push(dbOn(`rooms/${roomId}/markers`, (v)=>{ markers=v||{}; mapRender(); syncToolsUI(); }));
  unsub.push(dbOn(`rooms/${roomId}/rolls`, (v)=>{ rolls=v||{}; syncToolsUI(); }));
  unsub.push(dbOn(`logs/${roomId}`, (v)=>{ logs=v||{}; syncToolsUI(); }));
}

async function addLog(type, message, payload={}){
  const entry = { type, actorUid: me.uid, message: clampLen(message, 220), payload, ts: Date.now() };
  await dbPush(`logs/${roomId}`, entry);
}

/* =================== FULLSCREEN MAP UI =================== */
panelRoot.innerHTML = `
  <div class="canvasWrap full">
    <canvas id="mapCanvas"></canvas>
  </div>
`;
const canvas = $("#mapCanvas");
const ctx = canvas.getContext("2d");
let dpr=1;
let zoom=1;
let gridSize=48;
const view={x:0,y:0};
let selectedTokenId=null;

function resizeCanvas(){
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  mapRender();
}
window.addEventListener("resize", resizeCanvas, { passive:true });

function worldToScreen(wx, wy){ return { x:(wx-view.x)*zoom*dpr, y:(wy-view.y)*zoom*dpr }; }
function screenToWorld(sx, sy){ return { x:sx/(zoom*dpr)+view.x, y:sy/(zoom*dpr)+view.y }; }

const _imgCache = new Map();
function getImg(url){
  if(!url) return null;
  if(!_imgCache.has(url)){
    const img=new Image();
    img.crossOrigin="anonymous";
    img.src=url;
    _imgCache.set(url,img);
  }
  return _imgCache.get(url);
}

function drawBackground(){
  const bgUrl = room?.settings?.map?.bgUrl || "";
  if(!bgUrl) return;
  const img=getImg(bgUrl);
  if(!img || !img.complete) return;
  ctx.save();
  const p=worldToScreen(0,0);
  const w = img.naturalWidth * zoom * dpr;
  const h = img.naturalHeight * zoom * dpr;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, p.x, p.y, w, h);
  ctx.restore();
}

function drawGrid(){
  const w=canvas.width,h=canvas.height;
  ctx.save();
  ctx.globalAlpha=0.20;
  ctx.lineWidth=1;
  ctx.strokeStyle="#22304a";
  const gs = gridSize*zoom*dpr;
  const ox = -(view.x*zoom*dpr) % gs;
  const oy = -(view.y*zoom*dpr) % gs;
  for(let x=ox; x<w; x+=gs){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=oy; y<h; y+=gs){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}

function drawTokens(){
  for(const [id,t] of Object.entries(tokens||{})){
    if(t && t.visible === false) continue;        // hidden tokens
    if(t && t.inMarkerId) continue;              // stored tokens not on map
    const wx=num(t.x,0), wy=num(t.y,0);
    const r=24;
    const s=worldToScreen(wx,wy);
    const rr=r*zoom*dpr;

    ctx.save();
    if(t.spriteUrl){
      const img=getImg(t.spriteUrl);
      if(img && img.complete){
        ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.clip();
        ctx.drawImage(img, s.x-rr, s.y-rr, rr*2, rr*2);
      }else{
        ctx.fillStyle="rgba(74,163,255,.18)";
        ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.fill();
      }
    }else{
      ctx.fillStyle="rgba(74,163,255,.18)";
      ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.fill();
    }

    const editable = canEditToken(t);
    ctx.strokeStyle = editable ? "#9aa4b244" : "#9aa4b222";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.stroke();

    if(!editable){
      ctx.globalAlpha = 0.7;
      ctx.fillStyle="rgba(0,0,0,.35)";
      ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }
}

function drawFog(){
  const fog = room?.settings?.fog;
  if(!fog?.enabled) return;
  const blocks = fog.blocks || {};
  ctx.save();
  ctx.fillStyle = isMaster() ? "rgba(0,0,0,.60)" : "rgba(0,0,0,1)";
  for(const key of Object.keys(blocks)){
    const b=blocks[key];
    const p=worldToScreen(num(b.x,0), num(b.y,0));
    const w=num(b.w,160)*zoom*dpr;
    const h=num(b.h,160)*zoom*dpr;
    ctx.fillRect(p.x,p.y,w,h);
  }
  ctx.restore();
}

function drawMarkers(){
  if(!isMaster()) return;
  for(const [id,m] of Object.entries(markers||{})){
    const p=worldToScreen(num(m.x,0), num(m.y,0));
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y-9);
    ctx.lineTo(p.x+9, p.y+9);
    ctx.lineTo(p.x-9, p.y+9);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${Math.max(12, 12*zoom)}px system-ui`;
    ctx.fillText(m.title||"Marco", p.x+12, p.y+5);
    ctx.restore();
  }
}

function mapRender(){
  if(!room) return;
  zoom = num(room?.settings?.map?.zoom, 1);
  gridSize = num(room?.settings?.map?.gridSize, 48);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackground();
  drawGrid();
  drawTokens();
  drawMarkers();
  drawFog();
}

function hitToken(wx, wy){
  let best=null;
  for(const [id,t] of Object.entries(tokens||{})){
    if(t && t.visible === false) continue;
    if(t && t.inMarkerId) continue;
    const dx=wx-num(t.x,0), dy=wy-num(t.y,0);
    const r=24;
    if(dx*dx+dy*dy<=r*r) best={id,t};
  }
  return best;
}
function hitMarker(wx, wy){
  if(!isMaster()) return null;
  let best=null;
  for(const [id,m] of Object.entries(markers||{})){
    const dx=wx-num(m.x,0), dy=wy-num(m.y,0);
    if(dx*dx+dy*dy<=18*18) best={id,m};
  }
  return best;
}

/* =================== FOG + MARKER MODES (MASTER) =================== */
let fogBrush=160;
let fogMode="paint";
let paintingFog=false;
let placingMarker=false;
async function applyFogAt(wx, wy){
  if(!isMaster() || !room?.settings?.fog?.enabled) return;
  const size = Math.max(20, Math.min(800, fogBrush));
  const sx = Math.floor(wx/size)*size;
  const sy = Math.floor(wy/size)*size;
  const key = `b_${sx}_${sy}_${size}`;
  const path = `rooms/${roomId}/settings/fog/blocks/${key}`;
  if(fogMode==="paint") await dbSet(path, { x:sx, y:sy, w:size, h:size });
  else await dbSet(path, null);
}


/* =================== MAP INTERACTION =================== */
let down=false, dragging=null, pan=true;
let startPt={sx:0,sy:0};
let last={sx:0,sy:0};
let lastClickWorld={x:0,y:0};
let lastClickScreen={x:0,y:0};

function getScreenXY(ev){
  const rect=canvas.getBoundingClientRect();
  const cx = (ev.clientX ?? (ev.touches?.[0]?.clientX)) || 0;
  const cy = (ev.clientY ?? (ev.touches?.[0]?.clientY)) || 0;
  // sx/sy in device pixels (match draw space)
  const sx = (cx-rect.left)*dpr;
  const sy = (cy-rect.top)*dpr;
  return {sx,sy, rect};
}

function beginPointerAt(sx,sy){
  down=true;
  startPt={sx,sy};
  last={sx,sy};
  const w=screenToWorld(sx,sy);
  lastClickWorld = {x:w.x, y:w.y};
  lastClickScreen = {x:sx, y:sy};

  if(isMaster() && placingMarker){
    placingMarker=false;
    createMarkerAt(w.x,w.y).catch(err=>toast(String(err?.message||err),"error"));
    down=false;
    return;
  }

  const hm=hitMarker(w.x,w.y);
  if(hm){ openMarkerPopup(hm.id).catch(()=>{}); down=false; return; }

  if(isMaster() && room?.settings?.fog?.enabled && toolsState.fogPaintEnabled){
    paintingFog=true;
    applyFogAt(w.x,w.y).catch(()=>{});
    return;
  }

  const hit=hitToken(w.x,w.y);
  selectedTokenId = hit?.id || null;

  if(hit && canEditToken(hit.id, hit.t)){
    dragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
    pan=false;
  }else{
    dragging=null;
    pan=true;
  }
}

function movePointerAt(sx,sy){
  if(!down) return;
  const w=screenToWorld(sx,sy);

  if(paintingFog){ applyFogAt(w.x,w.y).catch(()=>{}); return; }

  if(dragging){
    const nx=w.x-dragging.ox, ny=w.y-dragging.oy;
    if(tokens[dragging.id]){ tokens[dragging.id].x=nx; tokens[dragging.id].y=ny; mapRender(); }
  }else if(pan){
    view.x -= (sx-last.sx)/(zoom*dpr);
    view.y -= (sy-last.sy)/(zoom*dpr);
    last={sx,sy};
    mapRender();
  }
}

async function endPointerAt(sx,sy){
  if(!down) return;
  down=false;

  if(paintingFog){ paintingFog=false; return; }

  if(dragging){
    const id=dragging.id;
    const t=tokens[id];
    dragging=null;
    try{
      await dbUpdate(`rooms/${roomId}/tokens/${id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
      await addLog("token","Token movido",{tokenId:id,x:t.x,y:t.y});
    }catch(err){ toast(String(err?.message||err),"error"); }
    return;
  }

  const dx = (sx-startPt.sx), dy=(sy-startPt.sy);
  const dist = Math.sqrt(dx*dx+dy*dy);

  // Click / tap
  if(dist <= 10){
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);
    if(hit){
      // Always allow master; players only own token
      if(canOpenSheet(hit.id, hit.t)){
        openSheetWindow(hit.id, sx, sy).catch(()=>{});
      }else{
        // not clickable for sheet, but still selectable
        toast("Token não é seu (sem permissão de ficha).", "error");
      }
    }
  }
}


/* Pointer Events (works for mouse + touch) */
canvas.style.touchAction = "none";

canvas.addEventListener("pointerdown",(ev)=>{
  try{
    const {sx,sy}=getScreenXY(ev);
    beginPointerAt(sx,sy);
  }catch(e){
    // hard fail shouldn't block the app
    console.error(e);
  }
},{passive:true});

canvas.addEventListener("pointermove",(ev)=>{
  try{
    if(!down) return;
    const {sx,sy}=getScreenXY(ev);
    movePointerAt(sx,sy);
  }catch(e){ console.error(e); }
},{passive:true});

canvas.addEventListener("pointerup",(ev)=>{
  try{
    const {sx,sy}=getScreenXY(ev);
    endPointerAt(sx,sy);
  }catch(e){ console.error(e); }
},{passive:true});

canvas.addEventListener("pointercancel",()=>{
  down=false; dragging=null; pan=true; paintingFog=false;
},{passive:true});

/* Fallback click: always try open sheet (desktop browsers that skip pointerup) */
canvas.addEventListener("click",(ev)=>{
  try{
    const {sx,sy}=getScreenXY(ev);
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);
    if(hit){
      if(canOpenSheet(hit.id, hit.t)){
        openSheetWindow(hit.id, sx, sy).catch((e)=>toast(String(e?.message||e),"error"));
      }else{
        toast("Token detectado, mas sem permissão pra abrir ficha (owner/master).", "error");
      }
    }
  }catch(e){ console.error(e); }
});

canvas.addEventListener("mousemove",(ev)=>{
  try{
    const {sx,sy}=getScreenXY(ev);
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);
    canvas.style.cursor = hit ? (canEditToken(hit.id, hit.t) ? "grab" : (canOpenSheet(hit.id, hit.t) ? "pointer" : "default")) : "default";
    setDbg(`role=${role} master=${isMaster()} tokens=${Object.keys(tokens||{}).length} sel=${selectedTokenId||'-'} hover=${hit?hit.id:'-'} clickW=${lastClickWorld.x.toFixed(1)},${lastClickWorld.y.toFixed(1)} zoom=${zoom.toFixed(2)}`);
  }catch(e){}
},{passive:true});

canvas.addEventListener("wheel",(e)=>{
  e.preventDefault();
  const delta=Math.sign(e.deltaY);
  zoom = Math.max(0.02, Math.min(6.0, zoom + (delta>0?-0.1:0.1)));
  if(isMaster()) dbUpdate(`rooms/${roomId}/settings/map`, { zoom }).catch(()=>{});
  mapRender();
},{passive:false});

// touch
canvas.addEventListener("touchstart",(e)=>{
  const t0=e.touches[0]; if(!t0) return;
  const rect=canvas.getBoundingClientRect();
  const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
  beginPointer(sx,sy);
},{passive:true});
canvas.addEventListener("touchmove",(e)=>{
  const t0=e.touches[0]; if(!t0) return;
  const rect=canvas.getBoundingClientRect();
  const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
  movePointer(sx,sy);
},{passive:true});
canvas.addEventListener("touchend",()=>{
  endPointer(last.sx,last.sy);
},{passive:true});

/* =================== Rolls helpers =================== */




async function ensurePostImageKey(){
  const dataUrl = await readFileAsDataURL(f);
      await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl: dataUrl });
      toast("Mapa atualizado.","ok");
    };
    return;
  }

  // ---------- FOG ----------
  if(tab==="fog"){
    const fogEnabled = !!room?.settings?.fog?.enabled;
    body.innerHTML = `
      <div class="card pad">
        <strong>Fog</strong>
        <p style="margin:8px 0; color:var(--muted)">O mestre pinta blocos no mapa; players não veem.</p>

        <div class="actions" style="gap:8px; flex-wrap:wrap; margin-top:10px">
          <button class="secondary" id="fogToggle">${fogEnabled ? "Desativar fog" : "Ativar fog"}</button>
          <button class="secondary" id="fogPaint">Pintar</button>
          <button class="secondary" id="fogErase">Apagar</button>
        </div>

        <div class="actions" style="gap:8px; align-items:flex-end; margin-top:10px">
          <div style="flex:1">
            <small style="color:var(--muted)">Tamanho do quadrado</small>
            <input id="fogSize" type="number" value="${Math.max(20, Math.min(800, fogBrush||80))}" />
          </div>
          <button class="secondary" id="fogUse">Usar no mapa</button>
          <button class="secondary" id="fogStop">Parar</button>
        </div>

        <div class="actions" style="margin-top:10px">
          <button class="secondary" id="fogClear">Limpar tudo</button>
        </div>
      </div>
    `;
    const bt = body.querySelector("#fogToggle");
    const bp = body.querySelector("#fogPaint");
    const be = body.querySelector("#fogErase");
    const bs = body.querySelector("#fogSize");
    const bu = body.querySelector("#fogUse");
    const bo = body.querySelector("#fogStop");
    const bc = body.querySelector("#fogClear");

    if(bt) bt.onclick = async ()=>{
      const cur = !!room?.settings?.fog?.enabled;
      await dbUpdate(`rooms/${roomId}/settings/fog`, { enabled: !cur });
      toast(!cur ? "Fog ativada." : "Fog desativada.","ok");
    };
    if(bp) bp.onclick = ()=>{ fogMode="paint"; toast("Fog: pintar","info"); };
    if(be) be.onclick = ()=>{ fogMode="erase"; toast("Fog: apagar","info"); };
    if(bs) bs.onchange = ()=>{ fogBrush = Math.max(20, Math.min(800, num(bs.value,80))); };
    if(bu) bu.onclick = ()=>{ toolsState.fogPaintEnabled=true; toast("Modo fog ON.","ok"); };
    if(bo) bo.onclick = ()=>{ toolsState.fogPaintEnabled=false; toast("Modo fog OFF.","info"); };
    if(bc) bc.onclick = async ()=>{
      if(!confirm("Limpar toda a fog?")) return;
      await dbSet(`rooms/${roomId}/settings/fog/blocks`, null);
      toast("Fog limpa.","ok");
    };
    return;
  }

  // ---------- MESA ----------
  if(tab==="room"){
    const postKey = (room?.settings?.postimageKey) || localStorage.getItem("sur4_postimage_key") || "";
    body.innerHTML = `
      <div class="card pad">
        <strong>Mesa</strong>
        <p style="margin:8px 0; color:var(--muted)">Configurações gerais.</p>

        <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
    </div>
  `;
  document.body.appendChild(box);

  const renderTokList = ()=>{
    const root=box.querySelector("#tokList");
    root.innerHTML = tokenIds.length? "" : `<div class="item"><small>vazio</small></div>`;
    tokenIds.forEach((tid, idx)=>{
      const t=tokens?.[tid];
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <div><strong>${esc(t?.name||tid)}</strong><br/><small class="mono">${tid}</small></div>
        <div class="actions">
          <button class="secondary" data-rel="${idx}">Libertar</button>
          <button class="danger" data-rm="${idx}">Remover</button>
        </div>
      </div>`;
      div.querySelector("[data-rm]").onclick = ()=>{ tokenIds.splice(idx,1); renderTokList(); };
      div.querySelector("[data-rel]").onclick = async ()=>{
        await dbUpdate(`rooms/${roomId}/tokens/${tid}`, { inMarkerId:null, visible:true, x:num(m.x,0)+40, y:num(m.y,0)+40, updatedAt:Date.now() });
        tokenIds.splice(idx,1);
        renderTokList();
        toast("Token libertado.","ok");
      };
      root.appendChild(div);
    });
  };
  const renderItemList = ()=>{
    const root=box.querySelector("#itemList");
    root.innerHTML = items.length? "" : `<div class="item"><small>vazio</small></div>`;
    items.forEach((it, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <div><strong>${esc(it.name||"Item")}</strong><br/><small>${esc((it.attrUsed||"FOR").toUpperCase())} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small></div>
        <button class="danger" data-del="${idx}">Del</button>
      </div>`;
      div.querySelector("[data-del]").onclick=()=>{ items.splice(idx,1); renderItemList(); };
      root.appendChild(div);
    });
  };

  renderTokList(); renderItemList();

  box.querySelector("#close").onclick=()=>box.remove();
  box.querySelector("#jump").onclick=()=>{ view.x=num(m.x,0)-150; view.y=num(m.y,0)-150; mapRender(); };
  box.querySelector("#del").onclick=async ()=>{ await dbSet(`rooms/${roomId}/markers/${markerId}`, null); toast("Marco deletado.","ok"); box.remove(); };

  box.querySelector("#pickToken").onclick=()=>{
    if(!selectedTokenId){ toast("Selecione um token no mapa primeiro.","error"); return; }
    toolsState.clipboardTokenId=selectedTokenId;
    toast("Token no clipboard.","ok");
  };
  box.querySelector("#pasteToken").onclick=async ()=>{
    const tid=toolsState.clipboardTokenId;
    if(!tid){ toast("Clipboard vazio.","error"); return; }
    if(!tokenIds.includes(tid)) tokenIds.push(tid);
    await dbUpdate(`rooms/${roomId}/tokens/${tid}`, { inMarkerId: markerId, visible:false, updatedAt:Date.now() });
    toast("Token preso no marco.","ok");
    renderTokList();
  };

  box.querySelector("#pinTok").onclick=async ()=>{
    const tid=box.querySelector("#tokSel").value;
    if(!tid) return;
    if(!tokenIds.includes(tid)) tokenIds.push(tid);
    await dbUpdate(`rooms/${roomId}/tokens/${tid}`, { inMarkerId: markerId, visible:false, updatedAt:Date.now() });
    toast("Token preso no marco.","ok");
    renderTokList();
  };

  box.querySelector("#addItem").onclick=()=>{ items.push({ id:`mk_it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" }); renderItemList(); };

  box.querySelector("#save").onclick=async ()=>{
    const patch = { title: clampLen(box.querySelector("#mkTitle").value, 80), tokenIds, items, updatedAt: Date.now() };
    await dbUpdate(`rooms/${roomId}/markers/${markerId}`, patch);
    toast("Marco salvo.","ok");
    box.remove();
  };
}

/* =================== CSS tweaks for fullscreen canvas =================== */
(function injectStyle(){
  const css = `
    #panelRoot{ padding:0 !important; }
    .canvasWrap.full{ height: calc(100vh - 76px); }
    .canvasWrap.full canvas{ width:100%; height:100%; display:block; border-radius:0 !important; }
  `;
  const s=document.createElement("style");
  s.textContent=css;
  document.head.appendChild(s);
})();

/* =================== Auth gate =================== */
onAuth(async (user)=>{
  if(!user){ toast("Faça login primeiro.", "error"); goHome(); return; }
  me = user;
  try{
    await ensureJoin();
    setHeader();
    subAll();
    resizeCanvas();
    toolsState.open = isMaster();
    syncToolsUI();
    mapRender();
  }catch(e){
    toast(String(e?.message||e),"error");
  }
});

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result||""));
    r.onerror = ()=> reject(new Error("Falha ao ler arquivo."));
    r.readAsDataURL(file);
  });
}


