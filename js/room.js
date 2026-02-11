
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
let role="player";
let room=null;
let players={}, tokens={}, characters={}, rolls={}, logs={}, markers={};
let unsub=[];

function clearSubs(){ unsub.forEach(fn=>fn&&fn()); unsub=[]; }
function isMaster(){ return (me && room && room.masterUid===me.uid) || role==="master"; }
function canEditToken(t){ return isMaster() || (t?.ownerUid && me && t.ownerUid===me.uid); }
function canOpenSheet(t){ return isMaster() || (t?.ownerUid && me && t.ownerUid===me.uid); }

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

  if(hit && canEditToken(hit.t)){
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
      if(canOpenSheet(hit.t)){
        openSheetWindow(hit.id, sx, sy).catch(()=>{});
      }else{
        // not clickable for sheet, but still selectable
        toast("Token não é seu (sem permissão de ficha).", "error");
      }
    }
  }
}


/* Pointer Events (works for mouse + touch) */
canvas.style.touchAction = "manipulation";

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
      if(canOpenSheet(hit.t)){
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
    canvas.style.cursor = hit ? (canEditToken(hit.t) ? "grab" : (canOpenSheet(hit.t) ? "pointer" : "default")) : "default";
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
function mentalPenalty(mental){ return (mental<=-8) ? -5 : 0; }
function advantagesDisabled(mental){ return mental<=-11; }

async function pushRoll(payload){
  await dbPush(`rooms/${roomId}/rolls`, payload);
  await dbPush(`logs/${roomId}`, { type:"roll", actorUid: me.uid, message: clampLen(payload?.context?.label||"Rolagem",200), payload: payload.context||{}, ts: Date.now() });
}

async function rollAttrInline(char, attr){
  const base=num(char.attrs?.[attr],1);
  const pen=mentalPenalty(num(char.mental,0));
  const die=rollDice("normal").dice[0];
  const total=die+base+pen;
  await pushRoll({ userUid: me.uid, expression:`1d12+${base}${pen?pen:""}`, mode:"normal", dice:[die], picked:die, total,
    context:{ roomId, charId:char.charId, kind:"attr", attr, label:`${attr}: ${total}`, baseAttr:base, mental:char.mental, penalty:pen }, visibility:"public", timestamp:Date.now() });
  toast(`${attr}: ${total}`, "ok");
}
async function rollItemInline(char, item){
  const a=(item.attrUsed||"FOR").toUpperCase();
  const base=num(char.attrs?.[a],1);
  const mod=num(item.mod,0);
  const pen=mentalPenalty(num(char.mental,0));
  const die=rollDice("normal").dice[0];
  const total=die+base+mod+pen;
  await pushRoll({ userUid: me.uid, expression:`1d12+${base}+${mod}${pen?pen:""}`, mode:"normal", dice:[die], picked:die, total,
    context:{ roomId, charId:char.charId, kind:"item", itemId:item.id, name:item.name, attrUsed:a, mod, label:`Item ${item.name}: ${total}`, mental:char.mental, penalty:pen }, visibility:"public", timestamp:Date.now() });
  toast(`Item ${item.name}: ${total}`, "ok");
}
async function rollAdvInline(char, adv){
  const mental=num(char.mental,0);
  if(!isMaster() && advantagesDisabled(mental)){ toast("Vantagens desativadas (mental <= -11).", "error"); return; }
  const a=(adv.attrUsed||"QI").toUpperCase();
  const base=num(char.attrs?.[a],1);
  const dt=Math.max(0, num(adv.dt, 9));
  const pen=mentalPenalty(mental);
  const die=rollDice("normal").dice[0];
  const mod = Math.max(0, num(adv.mod,0));
  const total=die+base+mod+pen;
  const success=total>=dt;
  await pushRoll({ userUid: me.uid, expression:`TEST 1d12+${base}+${Math.max(0,num(adv.mod,0))}${pen?pen:""} vs ${dt}`, mode:"normal", dice:[die], picked:die, total,
    context:{ roomId, charId:char.charId, kind:adv.kind||"adv", advId:adv.id, name:adv.name, type:adv.type, attrUsed:a, dt, mod:Math.max(0,num(adv.mod,0)), success, label:`${(adv.kind||"Vantagem")} ${adv.name}: ${success?"SUCESSO":"FALHA"} (${total} vs ${dt})`, mental, penalty:pen }, visibility:"public", timestamp:Date.now() });
  toast(`Vantagem ${adv.name}: ${success?"SUCESSO":"FALHA"} (${total} vs ${dt})`, success?"ok":"error");
}
async function rollAdvDTInline(adv){
  const die=rollDice("normal").dice[0];
  await pushRoll({ userUid: me.uid, expression:`DT 1d12`, mode:"normal", dice:[die], picked:die, total:die,
    context:{ roomId, kind:"dt", advId:adv.id, name:adv.name, label:`DT ${adv.name}: ${die}` }, visibility:"public", timestamp:Date.now() });
  toast(`DT ${adv.name}: ${die}`, "ok");
}
function getCharByToken(tokenId){
  const t=tokens?.[tokenId];
  if(!t?.linkedCharId) return null;
  return characters?.[t.linkedCharId] || null;
}

/* =================== Sheet floating window =================== */
let sheetWin=null;
let sheetTokenId=null;

function ensureSheetWindow(){
  if(sheetWin) return sheetWin;
  const el=document.createElement("div");
  el.id="sheetWin";
  el.style.cssText = `position:fixed; left:22px; top:92px; width:380px; max-width:92vw; z-index:55;
    background:rgba(15,20,32,.92); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,.45); display:none; overflow:hidden;`;
  el.innerHTML = `
    <div id="swBar" style="cursor:move; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(255,255,255,.04);">
      <strong id="swTitle" style="font-size:14px">Ficha</strong>
      <button class="secondary" id="swClose" style="padding:6px 10px">Fechar</button>
    </div>
    <div id="swBody" style="padding:12px; max-height:74vh; overflow:auto"></div>
  `;
  document.body.appendChild(el);

  const bar=el.querySelector("#swBar");
  let drag=false, ox=0, oy=0;
  bar.addEventListener("mousedown",(e)=>{ drag=true; const r=el.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; el.style.left=Math.max(6,e.clientX-ox)+"px"; el.style.top=Math.max(6,e.clientY-oy)+"px"; });
  window.addEventListener("mouseup",()=> drag=false);

  bar.addEventListener("touchstart",(e)=>{ const t=e.touches[0]; if(!t) return; drag=true; const r=el.getBoundingClientRect(); ox=t.clientX-r.left; oy=t.clientY-r.top; },{passive:true});
  window.addEventListener("touchmove",(e)=>{ if(!drag) return; const t=e.touches[0]; if(!t) return; el.style.left=Math.max(6,t.clientX-ox)+"px"; el.style.top=Math.max(6,t.clientY-oy)+"px"; },{passive:true});
  window.addEventListener("touchend",()=> drag=false,{passive:true});

  el.querySelector("#swClose").onclick = ()=>{ el.style.display="none"; sheetTokenId=null; };
  sheetWin=el;
  return el;
}

async function openSheetWindow(tokenId, sx=null, sy=null){
  const t=tokens?.[tokenId];
  if(!t) return;
  const char=getCharByToken(tokenId);
  if(!char){ toast("Token sem ficha.", "error"); return; }
  sheetTokenId=tokenId;
  const el=ensureSheetWindow();
  el.style.display="block";
  if(sx!=null && sy!=null){
    const px = sx/(dpr) + 14; // to CSS px
    const py = sy/(dpr) + 14;
    el.style.left = Math.min(window.innerWidth-40, Math.max(6, px)) + 'px';
    el.style.top  = Math.min(window.innerHeight-40, Math.max(6, py)) + 'px';
  }

  el.querySelector("#swTitle").textContent = char.name || "Ficha";
  renderSheetInto(el.querySelector("#swBody"), t, char);
}

function refreshOpenSheetIfNeeded(){
  if(!sheetTokenId) return;
  const t=tokens?.[sheetTokenId];
  const char=getCharByToken(sheetTokenId);
  if(!t || !char) return;
  const el=ensureSheetWindow();
  if(el.style.display==="none") return;
  el.querySelector("#swTitle").textContent = char.name || "Ficha";
  renderSheetInto(el.querySelector("#swBody"), t, char);
}

function attrSelectHtml(id, selected){
  const opts=["FOR","DEX","VIG","QI"].map(a=>`<option value="${a}" ${a===selected?"selected":""}>${a}</option>`).join("");
  return `<select id="${id}">${opts}</select>`;
}

function renderSheetInto(root, token, char){
  const inv=char.inventory||[];
  const advs=char.advantages||[];
  const disads=char.disadvantages||[];
  const isOwner = token?.ownerUid && me && token.ownerUid===me.uid;
  const allowEdit = isMaster(); // master edits; players read-only

  root.innerHTML = `
    <div class="item">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:46px;height:46px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center">
          ${token.spriteUrl?`<img src="${esc(token.spriteUrl)}" style="width:100%;height:100%;object-fit:cover" />`:`<span class="mono">SUR4</span>`}
        </div>
        <div style="flex:1">
          <strong>${esc(char.name||"Ficha")}</strong><br/>
          <small>Mental: <span class="mono">${num(char.mental,0)}</span></small>
        </div>
      </div>

      <div class="grid2" style="margin-top:10px">
        ${["FOR","DEX","VIG","QI"].map(k=>`
          <div class="item" style="padding:10px;cursor:pointer" data-attr="${k}">
            <div class="kv"><div><small>${k}</small></div><div><strong>${num(char.attrs?.[k],1)}</strong></div></div>
            <small>toque para rolar</small>
          </div>
        `).join("")}
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Itens</strong>
          ${(allowEdit || isOwner)?`<button class="secondary" id="addItem">+ item</button>`:""}
        </div>
        <div id="inv" class="list" style="margin-top:8px"></div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Vantagens</strong>
          ${allowEdit?`<button class="secondary" id="addAdv">+ vantagem</button>`:""}
        </div>
        <div id="advs" class="list" style="margin-top:8px"></div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Desvantagens</strong>
          ${allowEdit?`<button class="secondary" id="addDis">+ desvantagem</button>`:""}
        </div>
        <div id="disads" class="list" style="margin-top:8px"></div>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-attr]").forEach(el=> el.onclick = ()=> rollAttrInline(char, el.dataset.attr));

  const invRoot=root.querySelector("#inv");
  invRoot.innerHTML = inv.length? "" : `<div class="item"><small>Sem itens.</small></div>`;
  inv.forEach((it, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.style.cursor="pointer";
    div.innerHTML = `
      <div class="kv">
        <div>
          <strong>${esc(it.name||"Item")}</strong><br/>
          <small>${esc((it.attrUsed||"FOR").toUpperCase())} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small><br/>
          <small style="color:var(--muted)">${esc(it.desc||"")}</small>
        </div>
        ${(allowEdit || isOwner)?`<div class="actions"><button class="secondary" data-edit-it="${idx}">Editar</button><button class="danger" data-del-it="${idx}">Del</button></div>`:""}
      </div>
    `;
    div.onclick = ()=> rollItemInline(char, inv[idx]);
    invRoot.appendChild(div);
  });

  const advRoot=root.querySelector("#advs");
  advRoot.innerHTML = advs.length? "" : `<div class="item"><small>Sem vantagens.</small></div>`;
  advs.forEach((a, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="kv">
        <div>
          <strong style="cursor:pointer" data-adv="${idx}">${esc(a.name||"Vantagem")}</strong><br/>
          <small>${esc(a.type||"")}</small><br/>
          <small style="color:var(--muted)">${esc(a.desc||"")}</small>
        </div>
        <div style="text-align:right">
          <small style="cursor:pointer" data-dt="${idx}">DT: <span class="mono">${num(a.dt,9)}</span></small><br/>
          <small>${esc((a.attrUsed||"QI").toUpperCase())} + ${num(a.mod,0)}</small><br/>
          ${allowEdit?`<div class="actions" style="justify-content:flex-end"><button class="secondary" data-edit-adv="${idx}">Editar</button><button class="danger" data-del-adv="${idx}">Del</button></div>`:""}
        </div>
      </div>
    `;
    div.querySelector("[data-adv]").onclick = (ev)=>{ ev.stopPropagation(); rollAdvInline(char, advs[idx]); };
    div.querySelector("[data-dt]").onclick  = (ev)=>{ ev.stopPropagation(); rollAdvDTInline(advs[idx]); };
    advRoot.appendChild(div);
  });

  const addItemBtn=root.querySelector("#addItem");
  if(addItemBtn){
    addItemBtn.onclick=()=>openItemEditor(char, null);
  }
  const addAdvBtn=root.querySelector("#addAdv");

const disRoot=root.querySelector("#disads");
disRoot.innerHTML = disads.length? "" : `<div class="item"><small>Sem desvantagens.</small></div>`;
disads.forEach((a, idx)=>{
  const div=document.createElement("div");
  div.className="item";
  div.innerHTML = `
    <div class="kv">
      <div>
        <strong style="cursor:pointer" data-dis="${idx}">${esc(a.name||"Desvantagem")}</strong><br/>
        <small style="color:var(--muted)">${esc(a.desc||"")}</small>
      </div>
      <div style="text-align:right">
        <small style="cursor:pointer" data-disdt="${idx}">DT: <span class="mono">${num(a.dt,9)}</span></small><br/>
        <small>${esc((a.attrUsed||"QI").toUpperCase())} + ${num(a.mod,0)}</small><br/>
        ${allowEdit?`<div class="actions" style="justify-content:flex-end"><button class="secondary" data-edit-dis="${idx}">Editar</button><button class="danger" data-del-dis="${idx}">Del</button></div>`:""}
      </div>
    </div>
  `;
  div.querySelector("[data-dis]").onclick = (ev)=>{ ev.stopPropagation(); rollAdvInline(char, { ...disads[idx], kind:"Desvantagem" }); };
  div.querySelector("[data-disdt]").onclick  = (ev)=>{ ev.stopPropagation(); rollAdvDTInline(disads[idx]); };
  disRoot.appendChild(div);
});

const addDisBtn=root.querySelector("#addDis");
if(addDisBtn){
  addDisBtn.onclick=()=>openDisEditor(char, null);
}
  if(addAdvBtn){
    addAdvBtn.onclick=()=>openAdvEditor(char, null);
  }

  root.querySelectorAll("[data-del-it]").forEach(btn=>{
    btn.onclick = async (ev)=>{
      ev.stopPropagation();
      const idx=num(btn.dataset.delIt, -1);
      if(idx<0) return;
      const next = (char.inventory||[]).filter((_,i)=>i!==idx);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: next, updatedAt: Date.now() });
      toast("Item removido.", "ok");
    };
  });
  root.querySelectorAll("[data-edit-it]").forEach(btn=>{
    btn.onclick = (ev)=>{ ev.stopPropagation(); openItemEditor(char, num(btn.dataset.editIt,-1)); };
  });

  if(allowEdit){
    root.querySelectorAll("[data-del-adv]").forEach(btn=>{
      btn.onclick = async (ev)=>{
        ev.stopPropagation();
        const idx=num(btn.dataset.delAdv, -1);
        if(idx<0) return;
        const next = (char.advantages||[]).filter((_,i)=>i!==idx);
        await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: next, updatedAt: Date.now() });
        toast("Vantagem removida.", "ok");
      };
    });
    root.querySelectorAll("[data-edit-adv]").forEach(btn=>{
      btn.onclick = (ev)=>{ ev.stopPropagation(); openAdvEditor(char, num(btn.dataset.editAdv,-1)); };
    });
  }

if(allowEdit){
  root.querySelectorAll("[data-del-dis]").forEach(btn=>{
    btn.onclick = async (ev)=>{
      ev.stopPropagation();
      const idx=num(btn.dataset.delDis, -1);
      if(idx<0) return;
      const next = (char.disadvantages||[]).filter((_,i)=>i!==idx);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { disadvantages: next, updatedAt: Date.now() });
      toast("Desvantagem removida.", "ok");
    };
  });
  root.querySelectorAll("[data-edit-dis]").forEach(btn=>{
    btn.onclick = (ev)=>{ ev.stopPropagation(); openDisEditor(char, num(btn.dataset.editDis,-1)); };
  });
}

}

function openItemEditor(char, idx){
  const items=(char.inventory||[]).slice();
  const it = (idx==null || idx<0) ? { id:`it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" } : { ...items[idx] };
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:90; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:360px; max-width:92vw";
  modal.innerHTML = `
    <strong>${idx==null?"Novo item":"Editar item"}</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" value="${esc(it.name||"")}" />
    <label class="label" style="margin-top:10px">Descrição</label>
    <input id="ds" value="${esc(it.desc||"")}" />
    <div class="grid2" style="margin-top:10px">
      <div>
        <label class="label">Peso (kg)</label>
        <input id="kg" type="number" value="${num(it.kg,0)}" />
      </div>
      <div>
        <label class="label">Mod. dano</label>
        <input id="md" type="number" value="${num(it.mod,0)}" />
      </div>
    </div>
    <label class="label" style="margin-top:10px">Atributo usado</label>
    ${attrSelectHtml("at", (it.attrUsed||"FOR").toUpperCase())}
    <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#save").onclick=async ()=>{
    it.name = clampLen(modal.querySelector("#nm").value, 60);
    it.desc = clampLen(modal.querySelector("#ds").value, 140);
    it.kg = num(modal.querySelector("#kg").value, 0);
    it.mod = num(modal.querySelector("#md").value, 0);
    it.attrUsed = (modal.querySelector("#at").value||"FOR").toUpperCase();
    if(idx==null || idx<0) items.push(it); else items[idx]=it;
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
    toast("Item salvo.","ok");
    modal.remove();
  };
}


function openAdvEditor(char, idx){
  if(!isMaster()) return;
  const advs=(char.advantages||[]).slice();
  const a = (idx==null || idx<0)
    ? { id:`adv_${Date.now()}`, name:"Vantagem", desc:"", mod:0, attrUsed:"QI", dt:9 }
    : { ...advs[idx] };
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:90; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:380px; max-width:92vw";
  modal.innerHTML = `
    <strong>${idx==null?"Nova vantagem":"Editar vantagem"}</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" value="${esc(a.name||"")}" />
    <label class="label" style="margin-top:10px">Descrição</label>
    <input id="ds" value="${esc(a.desc||"")}" />
    <div class="grid2" style="margin-top:10px">
      <div>
        <label class="label">Mod. dano</label>
        <input id="md" type="number" value="${num(a.mod,0)}" />
      </div>
      <div>
        <label class="label">DT</label>
        <input id="dt" type="number" value="${num(a.dt,9)}" />
      </div>
    </div>
    <label class="label" style="margin-top:10px">Atributo (soma se mod &gt; 0)</label>
    ${attrSelectHtml("at", (a.attrUsed||"QI").toUpperCase())}
    <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#save").onclick=async ()=>{
    a.name = clampLen(modal.querySelector("#nm").value, 60);
    a.desc = clampLen(modal.querySelector("#ds").value, 220);
    a.mod  = num(modal.querySelector("#md").value, 0);
    a.dt   = num(modal.querySelector("#dt").value, 9);
    a.attrUsed = (modal.querySelector("#at").value||"QI").toUpperCase();
    if(idx==null || idx<0) advs.push(a); else advs[idx]=a;
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: advs, updatedAt: Date.now() });
    toast("Vantagem salva.","ok");
    modal.remove();
  };
}

function openDisEditor(char, idx){
  if(!isMaster()) return;
  const dis=(char.disadvantages||[]).slice();
  const a = (idx==null || idx<0)
    ? { id:`dis_${Date.now()}`, name:"Desvantagem", desc:"", mod:0, attrUsed:"QI", dt:9 }
    : { ...dis[idx] };
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:90; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:380px; max-width:92vw";
  modal.innerHTML = `
    <strong>${idx==null?"Nova desvantagem":"Editar desvantagem"}</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" value="${esc(a.name||"")}" />
    <label class="label" style="margin-top:10px">Descrição</label>
    <input id="ds" value="${esc(a.desc||"")}" />
    <div class="grid2" style="margin-top:10px">
      <div>
        <label class="label">Mod. dano</label>
        <input id="md" type="number" value="${num(a.mod,0)}" />
      </div>
      <div>
        <label class="label">DT</label>
        <input id="dt" type="number" value="${num(a.dt,9)}" />
      </div>
    </div>
    <label class="label" style="margin-top:10px">Atributo (soma se mod &gt; 0)</label>
    ${attrSelectHtml("at", (a.attrUsed||"QI").toUpperCase())}
    <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#save").onclick=async ()=>{
    a.name = clampLen(modal.querySelector("#nm").value, 60);
    a.desc = clampLen(modal.querySelector("#ds").value, 220);
    a.mod  = num(modal.querySelector("#md").value, 0);
    a.dt   = num(modal.querySelector("#dt").value, 9);
    a.attrUsed = (modal.querySelector("#at").value||"QI").toUpperCase();
    if(idx==null || idx<0) dis.push(a); else dis[idx]=a;
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { disadvantages: dis, updatedAt: Date.now() });
    toast("Desvantagem salva.","ok");
    modal.remove();
  };
}


/* =================== MASTER TOOLS POPUP (tabs) =================== */
const toolsState = { open:false, fogPaintEnabled:false, clipboardTokenId:null, tab:"tokens" };

function ensureToolsPopup(){
  let el = document.getElementById("masterTools");
  if(el) return el;
  el=document.createElement("div");
  el.id="masterTools";
  el.style.cssText = `position:fixed; right:16px; top:86px; width:360px; max-width:92vw; z-index:50;
    background:rgba(15,20,32,.92); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,.45); display:none; overflow:hidden;`;
  el.innerHTML = `
    <div id="mtBar" style="cursor:move; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(255,255,255,.04);">
      <strong style="font-size:14px">Mestre</strong>
      <button class="secondary" id="mtMin" style="padding:6px 10px">Ocultar</button>
    </div>
    <div style="padding:10px 12px; display:flex; gap:8px; flex-wrap:wrap">
      <button class="secondary" data-tab="tokens">Tokens</button>
      <button class="secondary" data-tab="sheets">Fichas</button>
      <button class="secondary" data-tab="players">Players</button>
      <button class="secondary" data-tab="markers">Marcos</button>
      <button class="secondary" data-tab="map">Mapa/Fog</button>
      <button class="secondary" data-tab="rolls">Rolagens</button>
      <button class="secondary" data-tab="logs">Logs</button>
    </div>
    <div id="mtBody" style="padding:12px; padding-top:0; max-height:74vh; overflow:auto"></div>
  `;
  document.body.appendChild(el);

  const bar=el.querySelector("#mtBar");
  let drag=false, ox=0, oy=0;
  bar.addEventListener("mousedown",(e)=>{ drag=true; const r=el.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; el.style.left=Math.max(6,e.clientX-ox)+"px"; el.style.top=Math.max(6,e.clientY-oy)+"px"; el.style.right="auto"; });
  window.addEventListener("mouseup",()=> drag=false);

  bar.addEventListener("touchstart",(e)=>{ const t=e.touches[0]; if(!t) return; drag=true; const r=el.getBoundingClientRect(); ox=t.clientX-r.left; oy=t.clientY-r.top; },{passive:true});
  window.addEventListener("touchmove",(e)=>{ if(!drag) return; const t=e.touches[0]; if(!t) return; el.style.left=Math.max(6,t.clientX-ox)+"px"; el.style.top=Math.max(6,t.clientY-oy)+"px"; el.style.right="auto"; },{passive:true});
  window.addEventListener("touchend",()=> drag=false,{passive:true});

  el.querySelector("#mtMin").onclick = ()=>{ toolsState.open=false; syncToolsUI(); };
  el.querySelectorAll("[data-tab]").forEach(b=> b.onclick = ()=>{ toolsState.tab=b.dataset.tab; syncToolsUI(); });
  return el;
}

const fab=document.createElement("button");
fab.id="masterFab";
fab.textContent="☰";
fab.style.cssText = `position:fixed; right:14px; bottom:14px; z-index:60;
  width:54px; height:54px; border-radius:18px; border:1px solid rgba(255,255,255,.10);
  background:rgba(74,163,255,.18); color:#eaf2ff; font-weight:800; font-size:18px;
  box-shadow:0 18px 50px rgba(0,0,0,.45); display:none;`;
document.body.appendChild(fab);
const dbg=document.createElement("div");
dbg.id="sur4Debug";
dbg.style.cssText="position:fixed; left:10px; bottom:10px; z-index:200; font:12px ui-monospace, SFMono-Regular, Menlo, monospace; padding:8px 10px; border-radius:12px; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.10); color:#eaf2ff; display:none; max-width:70vw";
document.body.appendChild(dbg);
let dbgOn=false;
window.addEventListener("keydown",(e)=>{ if(e.key==='`'){ dbgOn=!dbgOn; dbg.style.display=dbgOn?'block':'none'; }});
function setDbg(txt){ if(!dbgOn) return; dbg.textContent=txt; }

fab.onclick=()=>{ toolsState.open=!toolsState.open; syncToolsUI(); };

function tokenOptionsForSheets(selectedId){
  const opts = Object.values(characters||{}).map(c=>`<option value="${c.charId}" ${c.charId===selectedId?"selected":""}>${esc(c.name||c.charId)}</option>`).join("");
  return `<option value="">(nenhuma)</option>` + opts;
}
function playerOptions(selectedUid){
  const opts = Object.values(players||{}).map(p=>`<option value="${p.uid}" ${p.uid===selectedUid?"selected":""}>${p.uid}</option>`).join("");
  return `<option value="">(mestre)</option>` + opts;
}

async function createToken(){
  const tokenId = await dbPush(`rooms/${roomId}/tokens`, { tokenId:null, name:"Token", x:view.x+220, y:view.y+220, ownerUid:null, linkedCharId:null, spriteUrl:"", updatedAt: Date.now() });
  await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
  toast("Token criado.", "ok");
}

async function openTokenEditor(tokenId){
  const t=tokens?.[tokenId];
  if(!t) return;
  const apiKey = localStorage.getItem("sur4_postimage_key") || "";
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:80; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:380px; max-width:92vw";
  modal.innerHTML = `
    <strong>Editar token</strong>
    <label class="label" style="margin-top:10px">Ficha</label>
    <select id="tSheet">${tokenOptionsForSheets(t.linkedCharId||"")}</select>

    <label class="label" style="margin-top:10px">Player responsável</label>
    <select id="tOwner">${playerOptions(t.ownerUid||"")}</select>

    <label class="label" style="margin-top:10px">Nome (interno)</label>
    <input id="tName" value="${esc(t.name||"")}" />

    <label class="label" style="margin-top:10px">Imagem (sprite URL)</label>
    <input id="tSprite" value="${esc(t.spriteUrl||"")}" />

    <div class="actions" style="margin-top:10px">
      <input id="tFile" type="file" accept="image/*" />
      <button class="secondary" id="btnUp">Upload</button>
    </div>

    <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#btnUp").onclick = async ()=>{
    try{
      const file=modal.querySelector("#tFile").files?.[0];
      if(!file) throw new Error("Escolha um arquivo.");
      const url=await uploadToPostImage(file, apiKey || localStorage.getItem("sur4_postimage_key"));
      modal.querySelector("#tSprite").value=url;
      await dbPush("images", { url, ownerUid: me.uid, source:"postimage", createdAt: Date.now(), meta:{ name:file.name } });
      toast("Upload ok.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
  modal.querySelector("#save").onclick = async ()=>{
    try{
      const owner = modal.querySelector("#tOwner").value || null;
      const sheet = modal.querySelector("#tSheet").value || null;
      if(!sheet) throw new Error("Escolha uma ficha.");
      const patch = {
        ownerUid: owner,
        linkedCharId: sheet,
        name: clampLen(modal.querySelector("#tName").value, 60),
        spriteUrl: clampLen(modal.querySelector("#tSprite").value.trim(), 420),
        updatedAt: Date.now(),
        inMarkerId: null,
        visible: true
      };
      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, patch);
      if(owner) await dbUpdate(`rooms/${roomId}/players/${owner}`, { tokenId: tokenId, characterId: sheet });
      toast("Salvo.", "ok");
      modal.remove();
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}


async function openCreateSheet(){
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:80; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:460px; max-width:92vw; max-height:82vh; overflow:auto";
  modal.innerHTML = `
    <strong>Criar ficha</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" placeholder="ex: NPC / Player" />

    <label class="label" style="margin-top:10px">Atributos (FOR/DEX/VIG/QI)</label>
    <div class="grid2">
      <input id="aFOR" type="number" value="1" />
      <input id="aDEX" type="number" value="1" />
      <input id="aVIG" type="number" value="1" />
      <input id="aQI" type="number" value="1" />
    </div>

    <label class="label" style="margin-top:10px">Mental</label>
    <input id="mn" type="number" value="0" />

    <div class="card pad" style="margin-top:12px">
      <div class="actions" style="justify-content:space-between">
        <strong>Itens</strong>
        <button class="secondary" id="addIt">+ item</button>
      </div>
      <div id="itList" class="list" style="margin-top:8px"></div>
    </div>

    <div class="card pad" style="margin-top:12px">
      <div class="actions" style="justify-content:space-between">
        <strong>Vantagens</strong>
        <button class="secondary" id="addAdv">+ vantagem</button>
      </div>
      <div id="advList" class="list" style="margin-top:8px"></div>
    </div>

    <div class="card pad" style="margin-top:12px">
      <div class="actions" style="justify-content:space-between">
        <strong>Desvantagens</strong>
        <button class="secondary" id="addDis">+ desvantagem</button>
      </div>
      <div id="disList" class="list" style="margin-top:8px"></div>
    </div>

    <div class="actions" style="margin-top:12px">
      <button id="create">Criar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  const items=[];
  const advs=[];
  const dis=[];

  function openInlineItemEditor(obj, onSave){
    const box=document.createElement("div");
    box.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:95; background:rgba(15,20,32,.98); border:1px solid rgba(255,255,255,.12); padding:14px; border-radius:16px; width:380px; max-width:92vw";
    box.innerHTML=`
      <strong>Item</strong>
      <label class="label" style="margin-top:10px">Nome</label>
      <input id="nm" value="${esc(obj.name||"")}" />
      <label class="label" style="margin-top:10px">Descrição</label>
      <input id="ds" value="${esc(obj.desc||"")}" />
      <div class="grid2" style="margin-top:10px">
        <div>
          <label class="label">Peso (kg)</label>
          <input id="kg" type="number" value="${num(obj.kg,0)}" />
        </div>
        <div>
          <label class="label">Modificador (dano)</label>
          <input id="md" type="number" value="${num(obj.mod,0)}" />
        </div>
      </div>
      <label class="label" style="margin-top:10px">Atributo (soma no dano)</label>
      ${attrSelectHtml("at", (obj.attrUsed||"FOR").toUpperCase())}
      <div class="actions" style="margin-top:12px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector("#cancel").onclick=()=>box.remove();
    box.querySelector("#save").onclick=()=>{
      obj.name = clampLen(box.querySelector("#nm").value||"Item", 60);
      obj.desc = clampLen(box.querySelector("#ds").value||"", 220);
      obj.kg   = num(box.querySelector("#kg").value, 0);
      obj.mod  = num(box.querySelector("#md").value, 0);
      obj.attrUsed = (box.querySelector("#at").value||"FOR").toUpperCase();
      onSave(obj);
      box.remove();
    };
  }

  function openInlineAdvEditor(obj, title, onSave){
    const box=document.createElement("div");
    box.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:95; background:rgba(15,20,32,.98); border:1px solid rgba(255,255,255,.12); padding:14px; border-radius:16px; width:380px; max-width:92vw";
    box.innerHTML=`
      <strong>${esc(title)}</strong>
      <label class="label" style="margin-top:10px">Nome</label>
      <input id="nm" value="${esc(obj.name||"")}" />
      <label class="label" style="margin-top:10px">Descrição</label>
      <input id="ds" value="${esc(obj.desc||"")}" />
      <div class="grid2" style="margin-top:10px">
        <div>
          <label class="label">Modificador (dano)</label>
          <input id="md" type="number" value="${num(obj.mod,0)}" />
        </div>
        <div>
          <label class="label">DT</label>
          <input id="dt" type="number" value="${num(obj.dt,9)}" />
        </div>
      </div>
      <label class="label" style="margin-top:10px">Atributo (soma se mod &gt; 0)</label>
      ${attrSelectHtml("at", (obj.attrUsed||"QI").toUpperCase())}
      <div class="actions" style="margin-top:12px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector("#cancel").onclick=()=>box.remove();
    box.querySelector("#save").onclick=()=>{
      obj.name = clampLen(box.querySelector("#nm").value||title, 60);
      obj.desc = clampLen(box.querySelector("#ds").value||"", 240);
      obj.mod  = num(box.querySelector("#md").value, 0);
      obj.dt   = num(box.querySelector("#dt").value, 9);
      obj.attrUsed = (box.querySelector("#at").value||"QI").toUpperCase();
      onSave(obj);
      box.remove();
    };
  }

  const renderItems=()=>{
    const root=modal.querySelector("#itList");
    root.innerHTML = items.length? "" : `<div class="item"><small>Sem itens.</small></div>`;
    items.forEach((it, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <div><strong>${esc(it.name)}</strong><br/><small>${esc(it.attrUsed)} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small><br/><small style="color:var(--muted)">${esc(it.desc||"")}</small></div>
        <div class="actions">
          <button class="secondary" data-e="${idx}">Editar</button>
          <button class="danger" data-d="${idx}">Del</button>
        </div>
      </div>`;
      div.querySelector("[data-d]").onclick=()=>{ items.splice(idx,1); renderItems(); };
      div.querySelector("[data-e]").onclick=()=>{ openInlineItemEditor(it, (obj)=>{ items[idx]=obj; renderItems(); }); };
      root.appendChild(div);
    });
  };

  const renderAdvs=()=>{
    const root=modal.querySelector("#advList");
    root.innerHTML = advs.length? "" : `<div class="item"><small>Sem vantagens.</small></div>`;
    advs.forEach((a, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <div><strong>${esc(a.name)}</strong><br/><small>${esc(a.attrUsed)} + ${num(a.mod,0)} | DT ${num(a.dt,9)}</small><br/><small style="color:var(--muted)">${esc(a.desc||"")}</small></div>
        <div class="actions">
          <button class="secondary" data-e="${idx}">Editar</button>
          <button class="danger" data-d="${idx}">Del</button>
        </div>
      </div>`;
      div.querySelector("[data-d]").onclick=()=>{ advs.splice(idx,1); renderAdvs(); };
      div.querySelector("[data-e]").onclick=()=>{ openInlineAdvEditor(a, "Vantagem", (obj)=>{ advs[idx]=obj; renderAdvs(); }); };
      root.appendChild(div);
    });
  };

  const renderDis=()=>{
    const root=modal.querySelector("#disList");
    root.innerHTML = dis.length? "" : `<div class="item"><small>Sem desvantagens.</small></div>`;
    dis.forEach((a, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <div><strong>${esc(a.name)}</strong><br/><small>${esc(a.attrUsed)} + ${num(a.mod,0)} | DT ${num(a.dt,9)}</small><br/><small style="color:var(--muted)">${esc(a.desc||"")}</small></div>
        <div class="actions">
          <button class="secondary" data-e="${idx}">Editar</button>
          <button class="danger" data-d="${idx}">Del</button>
        </div>
      </div>`;
      div.querySelector("[data-d]").onclick=()=>{ dis.splice(idx,1); renderDis(); };
      div.querySelector("[data-e]").onclick=()=>{ openInlineAdvEditor(a, "Desvantagem", (obj)=>{ dis[idx]=obj; renderDis(); }); };
      root.appendChild(div);
    });
  };

  modal.querySelector("#addIt").onclick=()=>{
    const it={ id:`it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" };
    openInlineItemEditor(it, (obj)=>{ items.push(obj); renderItems(); });
  };
  modal.querySelector("#addAdv").onclick=()=>{
    const a={ id:`adv_${Date.now()}`, name:"Vantagem", desc:"", mod:0, attrUsed:"QI", dt:9 };
    openInlineAdvEditor(a, "Vantagem", (obj)=>{ advs.push(obj); renderAdvs(); });
  };
  modal.querySelector("#addDis").onclick=()=>{
    const a={ id:`dis_${Date.now()}`, name:"Desvantagem", desc:"", mod:0, attrUsed:"QI", dt:9 };
    openInlineAdvEditor(a, "Desvantagem", (obj)=>{ dis.push(obj); renderDis(); });
  };

  renderItems(); renderAdvs(); renderDis();

  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#create").onclick = async ()=>{
    const obj={
      name: clampLen(modal.querySelector("#nm").value||"Ficha", 80),
      ownerUid: null,
      attrs:{ FOR:num(modal.querySelector("#aFOR").value,1), DEX:num(modal.querySelector("#aDEX").value,1), VIG:num(modal.querySelector("#aVIG").value,1), QI:num(modal.querySelector("#aQI").value,1) },
      mental: num(modal.querySelector("#mn").value,0),
      inventory: items.map(x=>({...x})),
      advantages: advs.map(x=>({...x})),
      disadvantages: dis.map(x=>({...x})),
      updatedAt: Date.now(),
      charId:null
    };
    const charId = await dbPush(`rooms/${roomId}/characters`, obj);
    await dbUpdate(`rooms/${roomId}/characters/${charId}`, { charId });
    toast("Ficha criada.", "ok");
    modal.remove();
  };
}


function syncToolsUI(){
  fab.style.display = isMaster() ? "block" : "none";
  const tools = ensureToolsPopup();
  if(!isMaster()){ tools.style.display="none"; return; }
  tools.style.display = toolsState.open ? "block" : "none";
  if(!toolsState.open) return;

  const body = tools.querySelector("#mtBody");
  const tab = toolsState.tab;
  const fogEnabled = !!room?.settings?.fog?.enabled;
  const bgUrl = room?.settings?.map?.bgUrl || "";
  const postKey = localStorage.getItem("sur4_postimage_key") || "";

  if(tab==="tokens"){
    const list = Object.entries(tokens||{}).filter(([_,t])=>!t?.inMarkerId);
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Tokens</strong>
          <button class="secondary" id="newToken">+ token</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(([id,t])=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(t.name||"Token")}</strong>
                <div class="actions">
                  <button class="secondary" data-edit="${id}">Editar</button>
                  <button class="danger" data-del="${id}">Del</button>
                </div>
              </div>
              <small>player: ${t.ownerUid?uidShort(t.ownerUid):"mestre"} | ficha: ${t.linkedCharId?esc(characters?.[t.linkedCharId]?.name||t.linkedCharId):"—"}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhum token.</small></div>`}
        </div>
      </div>
    `;
    body.querySelector("#newToken").onclick=createToken;
    body.querySelectorAll("[data-edit]").forEach(b=> b.onclick=()=>openTokenEditor(b.dataset.edit));
    body.querySelectorAll("[data-del]").forEach(b=> b.onclick=async ()=>{ await dbSet(`rooms/${roomId}/tokens/${b.dataset.del}`, null); toast("Token deletado.","ok"); });
    return;
  }

  if(tab==="sheets"){
    const list = Object.values(characters||{}).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Fichas</strong>
          <button class="secondary" id="create">Criar ficha</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(c=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(c.name||"Ficha")}</strong>
                <small class="mono">${c.charId}</small>
              </div>
              <small>clique no token pra abrir a ficha</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhuma ficha.</small></div>`}
        </div>
      </div>
    `;
    body.querySelector("#create").onclick=openCreateSheet;
    return;
  }

  if(tab==="players"){
    const list = Object.values(players||{});
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <strong>Players</strong>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(p=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${uidShort(p.uid)}</strong>
                <small>${esc(p.role||"player")}</small>
              </div>
              <small>${p.uid}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhum player conectado.</small></div>`}
        </div>
      </div>
    `;
    return;
  }

  if(tab==="markers"){
    const list = Object.entries(markers||{});
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Marcos</strong>
          <button class="secondary" id="place">Colocar</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(([id,m])=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(m.title||"Marco")}</strong>
                <button class="secondary" data-open="${id}">Abrir</button>
              </div>
              <small class="mono">x:${num(m.x,0).toFixed(0)} y:${num(m.y,0).toFixed(0)}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhum marco.</small></div>`}
        </div>
      </div>
    `;
    body.querySelector("#place").onclick=()=>{ placingMarker=true; toast("Clique no mapa para colocar o marco.","ok"); };
    body.querySelectorAll("[data-open]").forEach(b=> b.onclick=()=>openMarkerPopup(b.dataset.open).catch(()=>{}));
    return;
  }

  if(tab==="map"){
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <strong>Mapa</strong>
        <label class="label" style="margin-top:8px">Imagem de fundo (URL)</label>
        <input id="bgUrl" value="${esc(bgUrl)}" placeholder="https://..." />
        <div class="actions" style="margin-top:8px; flex-wrap:wrap">
          <button class="secondary" id="bgSave">Salvar</button>
          <button class="secondary" id="bgClear">Remover</button>
        </div>
        <div class="actions" style="margin-top:10px; flex-wrap:wrap">
          <input id="bgFile" type="file" accept="image/*" />
          <button class="secondary" id="bgUpload">Upload</button>
        </div>
        <label class="label" style="margin-top:10px">PostImage API Key</label>
        <input id="postKey" value="${esc(postKey)}" placeholder="cole aqui" />
      </div>

      <div class="card pad" style="margin-top:12px">
        <strong>Fog</strong>
        <div class="actions" style="margin-top:8px; flex-wrap:wrap">
          <button class="secondary" id="fogToggle">Fog: ${fogEnabled?"ON":"OFF"}</button>
          <button class="secondary" id="fogClear">Limpar fog</button>
          <button class="secondary" id="fogPaint">Pintar: ${toolsState.fogPaintEnabled?"ON":"OFF"}</button>
        </div>
        <label class="label" style="margin-top:10px">Tamanho do quadrado</label>
        <input id="fogSize" type="number" value="${fogBrush}" />
        <div class="actions" style="margin-top:8px; flex-wrap:wrap">
          <button class="secondary" id="fogModePaint">Modo: Pintar</button>
          <button class="secondary" id="fogModeErase">Modo: Apagar</button>
        </div>
        <small style="color:var(--muted)">Players veem a fog como preto total.</small>
      </div>
    `;
    body.querySelector("#postKey").onchange=()=>localStorage.setItem("sur4_postimage_key", body.querySelector("#postKey").value.trim());
    body.querySelector("#bgSave").onclick=async ()=>{ const url=clampLen(body.querySelector("#bgUrl").value.trim(),420); await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl:url }); toast("Fundo salvo.","ok"); };
    body.querySelector("#bgClear").onclick=async ()=>{ await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl:"" }); toast("Fundo removido.","ok"); };
    body.querySelector("#bgUpload").onclick=async ()=>{
      try{
        const file=body.querySelector("#bgFile").files?.[0];
        if(!file) throw new Error("Escolha um arquivo.");
        const key = localStorage.getItem("sur4_postimage_key") || "";
        const url = await uploadToPostImage(file, key);
        await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl:url });
        await dbPush("images", { url, ownerUid: me.uid, source:"postimage", createdAt: Date.now(), meta:{ name:file.name, kind:"mapBg" } });
        toast("Fundo atualizado.","ok");
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
    body.querySelector("#fogToggle").onclick=async ()=>{ const enabled=!!room?.settings?.fog?.enabled; await dbUpdate(`rooms/${roomId}/settings/fog`, { enabled: !enabled }); toast(`Fog ${!enabled?"ON":"OFF"}`,"ok"); };
    body.querySelector("#fogClear").onclick=async ()=>{ await dbSet(`rooms/${roomId}/settings/fog/blocks`, {}); toast("Fog limpo.","ok"); };
    body.querySelector("#fogPaint").onclick=()=>{ toolsState.fogPaintEnabled=!toolsState.fogPaintEnabled; syncToolsUI(); };
    body.querySelector("#fogSize").onchange=()=>{ fogBrush=Math.max(20,Math.min(800,num(body.querySelector("#fogSize").value,160))); };
    body.querySelector("#fogModePaint").onclick=()=>{ fogMode="paint"; toast("Fog: pintar","ok"); };
    body.querySelector("#fogModeErase").onclick=()=>{ fogMode="erase"; toast("Fog: apagar","ok"); };
    return;
  }

  if(tab==="rolls"){
    const rows = Object.values(rolls||{}).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,120);
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Rolagens</strong>
          <button class="danger" id="clearRolls">Limpar</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${rows.length? rows.map(r=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(r.context?.kind||"roll")}</strong>
                <small class="mono">${new Date(r.timestamp||0).toLocaleTimeString()}</small>
              </div>
              <div><strong>${r.total}</strong> <small>${esc(r.expression||"")}</small></div>
            </div>
          `).join("") : `<div class="item"><small>Nenhuma rolagem.</small></div>`}
        </div>
      </div>
    `;
    body.querySelector("#clearRolls").onclick=async ()=>{ await dbSet(`rooms/${roomId}/rolls`, {}); toast("Rolagens limpas.","ok"); };
    return;
  }

  if(tab==="logs"){
    const rows = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,120);
    body.innerHTML = `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Logs</strong>
          <button class="danger" id="clearLogs">Limpar</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${rows.length? rows.map(l=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(l.type||"log")}</strong>
                <small class="mono">${new Date(l.ts||0).toLocaleTimeString()}</small>
              </div>
              <div>${esc(l.message||"")}</div>
            </div>
          `).join("") : `<div class="item"><small>Sem logs.</small></div>`}
        </div>
      </div>
    `;
    body.querySelector("#clearLogs").onclick=async ()=>{ await dbSet(`logs/${roomId}`, {}); toast("Logs limpos.","ok"); };
    return;
  }
}

/* =================== MARKERS (ONLY items + store/release tokens) =================== */
async function createMarkerAt(x,y){
  await dbPush(`rooms/${roomId}/markers`, { title:"Marco", x, y, tokenIds:[], items:[], ts:Date.now() });
  toast("Marco criado.", "ok");
}
function tokenSelectOptions(){
  return Object.entries(tokens||{})
    .filter(([_,t])=>!t?.inMarkerId)
    .map(([id,t])=>`<option value="${id}">${esc(t.name||id)}</option>`).join("");
}
async function openMarkerPopup(markerId){
  const m = markers?.[markerId];
  if(!m) return;
  const tokenIds = (m.tokenIds||[]).slice();
  const items = (m.items||[]).slice();

  const box=document.createElement("div");
  box.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:85; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:420px; max-width:92vw; max-height:82vh; overflow:auto";
  box.innerHTML = `
    <strong>Marco</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="mkTitle" value="${esc(m.title||"Marco")}" />

    <div class="actions" style="margin-top:10px; flex-wrap:wrap">
      <button class="secondary" id="jump">Ir</button>
      <button class="secondary" id="pickToken">Pegar token selecionado</button>
      <button class="secondary" id="pasteToken">Prender token (colocar no marco)</button>
      <button class="danger" id="del">Deletar marco</button>
      <button class="secondary" id="close">Fechar</button>
    </div>

    <div class="card pad" style="margin-top:12px">
      <div class="actions" style="justify-content:space-between">
        <strong>Tokens presos</strong>
        <div class="actions">
          <select id="tokSel"><option value="">(token)</option>${tokenSelectOptions()}</select>
          <button class="secondary" id="pinTok">Prender</button>
        </div>
      </div>
      <div id="tokList" class="list" style="margin-top:8px"></div>
      <small style="color:var(--muted)">Prender = tira do mapa (visible=false). Libertar = volta no mapa na posição do marco.</small>
    </div>

    <div class="card pad" style="margin-top:12px">
      <div class="actions" style="justify-content:space-between">
        <strong>Itens do marco</strong>
        <button class="secondary" id="addItem">+ item</button>
      </div>
      <div id="itemList" class="list" style="margin-top:8px"></div>
    </div>

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
