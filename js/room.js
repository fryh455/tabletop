
import { $, $$, bindModal, toast, goHome, esc, clampLen, num, uidShort, openModal, closeModal } from "./app.js";
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
function isMaster(){ return role==="master"; }
function canEditToken(t){ return isMaster() || (t?.ownerUid && me && t.ownerUid===me.uid); }

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
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; syncToolsUI(); }));
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
    ctx.strokeStyle = (selectedTokenId===id) ? "#4aa3ff" : (editable ? "#9aa4b244" : "#9aa4b222");
    ctx.lineWidth = (selectedTokenId===id) ? 3 : 2;
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
let down=false, moved=false, dragging=null, pan=true;
let last={sx:0,sy:0};

canvas.onmousedown=(e)=>{
  down=true; moved=false;
  const rect=canvas.getBoundingClientRect();
  const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
  last={sx,sy};
  const w=screenToWorld(sx,sy);

  if(isMaster() && placingMarker){
    placingMarker=false;
    createMarkerAt(w.x,w.y).catch(err=>toast(String(err?.message||err),"error"));
    return;
  }

  const hm=hitMarker(w.x,w.y);
  if(hm){ openMarkerPopup(hm.id).catch(()=>{}); return; }

  if(isMaster() && room?.settings?.fog?.enabled && toolsState.fogPaintEnabled){
    paintingFog=true;
    applyFogAt(w.x,w.y).catch(()=>{});
    return;
  }

  const hit=hitToken(w.x,w.y);
  if(hit){
    selectedTokenId=hit.id;
    if(canEditToken(hit.t)){
      dragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
      pan=false;
    }else{ dragging=null; pan=true; }
  }else{ selectedTokenId=null; dragging=null; pan=true; }
  mapRender();
};

window.onmousemove=(e)=>{
  if(!down) return;
  const rect=canvas.getBoundingClientRect();
  const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
  const w=screenToWorld(sx,sy);
  moved = moved || (Math.abs(sx-last.sx)+Math.abs(sy-last.sy) > 3);

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
};

window.onmouseup=async ()=>{
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

  if(!moved && selectedTokenId){
    const t=tokens[selectedTokenId];
    if(!t) return;
    if(isMaster() || (t.ownerUid && me && t.ownerUid===me.uid)){
      openSheetPopupForToken(selectedTokenId).catch(()=>{});
    }
  }
};

canvas.addEventListener("wheel",(e)=>{
  e.preventDefault();
  const delta=Math.sign(e.deltaY);
  zoom = Math.max(0.02, Math.min(6.0, zoom + (delta>0?-0.1:0.1)));
  if(isMaster()) dbUpdate(`rooms/${roomId}/settings/map`, { zoom }).catch(()=>{});
  mapRender();
},{passive:false});

// touch
let tDragging=null, tLast=null, tPan=false, tMoved=false;
canvas.addEventListener("touchstart",(e)=>{
  const t0=e.touches[0]; if(!t0) return;
  tMoved=false;
  const rect=canvas.getBoundingClientRect();
  const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
  const w=screenToWorld(sx,sy);

  if(isMaster() && placingMarker){ placingMarker=false; createMarkerAt(w.x,w.y).catch(()=>{}); return; }
  const hm=hitMarker(w.x,w.y); if(hm){ openMarkerPopup(hm.id).catch(()=>{}); return; }

  if(isMaster() && room?.settings?.fog?.enabled && toolsState.fogPaintEnabled){
    paintingFog=true; applyFogAt(w.x,w.y).catch(()=>{}); return;
  }

  const hit=hitToken(w.x,w.y);
  if(hit && canEditToken(hit.t)){
    selectedTokenId=hit.id;
    tDragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
    tPan=false;
  }else{
    selectedTokenId=hit?.id || null;
    tDragging=null;
    tPan=true;
  }
  tLast={sx,sy};
  mapRender();
},{passive:true});

canvas.addEventListener("touchmove",(e)=>{
  const t0=e.touches[0]; if(!t0) return;
  const rect=canvas.getBoundingClientRect();
  const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
  const w=screenToWorld(sx,sy);
  if(tLast && (Math.abs(sx-tLast.sx)+Math.abs(sy-tLast.sy)>3)) tMoved=true;

  if(paintingFog){ applyFogAt(w.x,w.y).catch(()=>{}); return; }

  if(tDragging){
    const nx=w.x-tDragging.ox, ny=w.y-tDragging.oy;
    if(tokens[tDragging.id]){ tokens[tDragging.id].x=nx; tokens[tDragging.id].y=ny; mapRender(); }
  }else if(tPan && tLast){
    view.x -= (sx-tLast.sx)/(zoom*dpr);
    view.y -= (sy-tLast.sy)/(zoom*dpr);
    tLast={sx,sy};
    mapRender();
  }
},{passive:true});

canvas.addEventListener("touchend", async ()=>{
  if(paintingFog){ paintingFog=false; return; }
  if(tDragging){
    const id=tDragging.id;
    const t=tokens[id];
    tDragging=null;
    try{
      await dbUpdate(`rooms/${roomId}/tokens/${id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
      await addLog("token","Token movido (touch)",{tokenId:id,x:t.x,y:t.y});
    }catch(err){ toast(String(err?.message||err),"error"); }
    return;
  }
  if(!tMoved && selectedTokenId){
    const t=tokens[selectedTokenId];
    if(t && (isMaster() || (t.ownerUid && me && t.ownerUid===me.uid))){
      openSheetPopupForToken(selectedTokenId).catch(()=>{});
    }
  }
  tPan=false; tLast=null;
},{passive:true});

/* =================== SHEET POPUP =================== */
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
  const total=die+base+pen;
  const success=total>=dt;
  await pushRoll({ userUid: me.uid, expression:`TEST 1d12+${base}${pen?pen:""} vs ${dt}`, mode:"normal", dice:[die], picked:die, total,
    context:{ roomId, charId:char.charId, kind:"adv", advId:adv.id, name:adv.name, type:adv.type, attrUsed:a, dt, success, label:`Vantagem ${adv.name}: ${success?"SUCESSO":"FALHA"} (${total} vs ${dt})`, mental, penalty:pen }, visibility:"public", timestamp:Date.now() });
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

async function openSheetPopupForToken(tokenId){
  const t=tokens?.[tokenId];
  if(!t) return;
  const char=getCharByToken(tokenId);
  if(!char){ toast("Token sem ficha.", "error"); return; }

  const inv=char.inventory||[];
  const advs=char.advantages||[];

  openModal("Ficha", `
    <div class="item">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:46px;height:46px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center">
          ${t.spriteUrl?`<img src="${esc(t.spriteUrl)}" style="width:100%;height:100%;object-fit:cover" />`:`<span class="mono">SUR4</span>`}
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
          ${(isMaster() || (t.ownerUid===me.uid))?`<button class="secondary" id="addItem">+ item</button>`:""}
        </div>
        <div id="inv" class="list" style="margin-top:8px"></div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Vantagens</strong>
          ${(isMaster())?`<button class="secondary" id="addAdv">+ vantagem</button>`:""}
        </div>
        <div id="advs" class="list" style="margin-top:8px"></div>
      </div>

      <div class="actions" style="margin-top:10px">
        <button class="secondary" id="close">Fechar</button>
      </div>
    </div>
  `);

  $("#close").onclick=closeModal;

  $$("[data-attr]").forEach(el=> el.onclick = ()=> rollAttrInline(char, el.dataset.attr));

  const invRoot=$("#inv");
  invRoot.innerHTML = inv.length? "" : `<div class="item"><small>Sem itens.</small></div>`;
  inv.forEach((it, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.style.cursor="pointer";
    div.innerHTML = `<div class="kv"><div><strong>${esc(it.name||"Item")}</strong><br/><small>${esc((it.attrUsed||"FOR").toUpperCase())} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small></div><div><small>toque</small></div></div>`;
    div.onclick = ()=> rollItemInline(char, inv[idx]);
    invRoot.appendChild(div);
  });

  const advRoot=$("#advs");
  advRoot.innerHTML = advs.length? "" : `<div class="item"><small>Sem vantagens.</small></div>`;
  advs.forEach((a, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="kv">
      <div><strong style="cursor:pointer" data-adv="${idx}">${esc(a.name||"Vantagem")}</strong><br/><small>${esc(a.type||"")}</small></div>
      <div style="text-align:right"><small style="cursor:pointer" data-dt="${idx}">DT: <span class="mono">${num(a.dt,9)}</span></small></div>
    </div>`;
    div.querySelector("[data-adv]").onclick = ()=> rollAdvInline(char, advs[idx]);
    div.querySelector("[data-dt]").onclick = ()=> rollAdvDTInline(advs[idx]);
    advRoot.appendChild(div);
  });

  const btnAddItem=$("#addItem");
  if(btnAddItem){
    btnAddItem.onclick = async ()=>{
      const items=(char.inventory||[]).slice();
      items.push({ id:`it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" });
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
      toast("Item criado.", "ok");
      closeModal(); openSheetPopupForToken(tokenId);
    };
  }
  const btnAddAdv=$("#addAdv");
  if(btnAddAdv){
    btnAddAdv.onclick = async ()=>{
      const advs2=(char.advantages||[]).slice();
      advs2.push({ id:`adv_${Date.now()}`, name:"Vantagem", desc:"", type:"ativa", mod:0, attrUsed:"QI", dt:9 });
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: advs2, updatedAt: Date.now() });
      toast("Vantagem criada.", "ok");
      closeModal(); openSheetPopupForToken(tokenId);
    };
  }
}

/* =================== MASTER TOOLS POPUP (draggable) =================== */
const toolsState = { open:false, fogPaintEnabled:false, clipboardTokenId:null, section:"tokens" };

function ensureToolsPopup(){
  let el = document.getElementById("masterTools");
  if(el) return el;
  el=document.createElement("div");
  el.id="masterTools";
  el.style.cssText = `position:fixed; left:18px; top:86px; width:320px; max-width:92vw; z-index:50;
    background:rgba(15,20,32,.92); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,.45); display:none; overflow:hidden;`;
  el.innerHTML = `
    <div id="mtBar" style="cursor:move; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(255,255,255,.04);">
      <strong style="font-size:14px">Mestre</strong>
      <button class="secondary" id="mtMin" style="padding:6px 10px">Ocultar</button>
    </div>
    <div id="mtBody" style="padding:12px"></div>
  `;
  document.body.appendChild(el);

  const bar=el.querySelector("#mtBar");
  let drag=false, ox=0, oy=0;
  bar.addEventListener("mousedown",(e)=>{ drag=true; const r=el.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; el.style.left=Math.max(6,e.clientX-ox)+"px"; el.style.top=Math.max(6,e.clientY-oy)+"px"; });
  window.addEventListener("mouseup",()=> drag=false);

  bar.addEventListener("touchstart",(e)=>{ const t=e.touches[0]; if(!t) return; drag=true; const r=el.getBoundingClientRect(); ox=t.clientX-r.left; oy=t.clientY-r.top; },{passive:true});
  window.addEventListener("touchmove",(e)=>{ if(!drag) return; const t=e.touches[0]; if(!t) return; el.style.left=Math.max(6,t.clientX-ox)+"px"; el.style.top=Math.max(6,t.clientY-oy)+"px"; },{passive:true});
  window.addEventListener("touchend",()=> drag=false,{passive:true});

  el.querySelector("#mtMin").onclick = ()=>{ toolsState.open=false; syncToolsUI(); };
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
fab.onclick=()=>{ toolsState.open=!toolsState.open; syncToolsUI(); };

function syncToolsUI(){
  fab.style.display = isMaster() ? "block" : "none";
  const tools = ensureToolsPopup();
  if(!isMaster()){ tools.style.display="none"; return; }
  tools.style.display = toolsState.open ? "block" : "none";
  if(!toolsState.open) return;

  const body = tools.querySelector("#mtBody");
  const fogEnabled = !!room?.settings?.fog?.enabled;
  const bgUrl = room?.settings?.map?.bgUrl || "";
  const postKey = localStorage.getItem("sur4_postimage_key") || "";

  const paneId = "toolsPane";
  body.innerHTML = `
    <div class="actions" style="flex-wrap:wrap; gap:8px; margin-bottom:10px">
      <button class="secondary" id="tTokens">Tokens</button>
      <button class="secondary" id="tSheets">Fichas</button>
      <button class="secondary" id="tRolls">Rolagens</button>
      <button class="secondary" id="tLogs">Logs</button>
      <button class="secondary" id="tMarkers">Marcos</button>
    </div>

    <div class="card pad" style="margin-bottom:10px">
      <strong>Mapa</strong>
      <label class="label" style="margin-top:8px">Imagem de fundo (URL)</label>
      <input id="bgUrl" value="${esc(bgUrl)}" placeholder="https://..." />
      <div class="actions" style="margin-top:8px; flex-wrap:wrap">
        <button class="secondary" id="bgSave">Salvar</button>
        <button class="secondary" id="bgClear">Remover</button>
      </div>
      <label class="label" style="margin-top:10px">PostImage API Key</label>
      <input id="postKey" value="${esc(postKey)}" placeholder="cole aqui" />
    </div>

    <div class="card pad" style="margin-bottom:10px">
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

    <div id="${paneId}"></div>
  `;

  body.querySelector("#bgSave").onclick = async ()=>{ const url=clampLen(body.querySelector("#bgUrl").value.trim(),420); await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl: url }); toast("Fundo salvo.","ok"); };
  body.querySelector("#bgClear").onclick = async ()=>{ await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl: "" }); toast("Fundo removido.","ok"); };
  body.querySelector("#postKey").onchange = ()=> localStorage.setItem("sur4_postimage_key", body.querySelector("#postKey").value.trim());

  body.querySelector("#fogToggle").onclick = async ()=>{ const enabled=!!room?.settings?.fog?.enabled; await dbUpdate(`rooms/${roomId}/settings/fog`, { enabled: !enabled }); toast(`Fog ${!enabled?"ON":"OFF"}`,"ok"); };
  body.querySelector("#fogClear").onclick = async ()=>{ await dbSet(`rooms/${roomId}/settings/fog/blocks`, {}); toast("Fog limpo.","ok"); };
  body.querySelector("#fogPaint").onclick = ()=>{ toolsState.fogPaintEnabled=!toolsState.fogPaintEnabled; syncToolsUI(); };
  body.querySelector("#fogSize").onchange = ()=>{ fogBrush=Math.max(20,Math.min(800,num(body.querySelector("#fogSize").value,160))); };
  body.querySelector("#fogModePaint").onclick = ()=>{ fogMode="paint"; toast("Fog: pintar","ok"); };
  body.querySelector("#fogModeErase").onclick = ()=>{ fogMode="erase"; toast("Fog: apagar","ok"); };

  const pane = body.querySelector("#"+paneId);

  function tokenOptionsForSheets(selectedId){
    const opts = Object.values(characters||{}).map(c=>`<option value="${c.charId}" ${c.charId===selectedId?"selected":""}>${esc(c.name||c.charId)}</option>`).join("");
    return `<option value="">(nenhuma)</option>` + opts;
  }
  function playerOptions(selectedUid){
    const opts = Object.values(players||{}).map(p=>`<option value="${p.uid}" ${p.uid===selectedUid?"selected":""}>${p.uid}</option>`).join("");
    return `<option value="">(mestre)</option>` + opts;
  }

  async function openTokenEditor(tokenId){
    const t=tokens?.[tokenId];
    if(!t) return;
    const apiKey = localStorage.getItem("sur4_postimage_key") || "";
    openModal("Editar token", `
      <div class="item">
        <label class="label">Ficha (obrigatório p/ usar)</label>
        <select id="tSheet">${tokenOptionsForSheets(t.linkedCharId||"")}</select>

        <label class="label" style="margin-top:10px">Player responsável (opcional)</label>
        <select id="tOwner">${playerOptions(t.ownerUid||"")}</select>

        <label class="label" style="margin-top:10px">Nome (interno)</label>
        <input id="tName" value="${esc(t.name||"")}" />

        <label class="label" style="margin-top:10px">Imagem (sprite URL)</label>
        <input id="tSprite" value="${esc(t.spriteUrl||"")}" />

        <div class="actions" style="margin-top:10px">
          <input id="tFile" type="file" accept="image/*" />
          <button class="secondary" id="btnUp">Upload</button>
        </div>

        <div class="actions" style="margin-top:10px">
          <button id="save">Salvar</button>
          <button class="secondary" id="cancel">Cancelar</button>
        </div>
      </div>
    `);
    $("#cancel").onclick=closeModal;
    $("#btnUp").onclick = async ()=>{
      try{
        const file=$("#tFile").files?.[0];
        if(!file) throw new Error("Escolha um arquivo.");
        const url=await uploadToPostImage(file, apiKey || localStorage.getItem("sur4_postimage_key"));
        $("#tSprite").value=url;
        await dbPush("images", { url, ownerUid: me.uid, source:"postimage", createdAt: Date.now(), meta:{ name:file.name } });
        toast("Upload ok.", "ok");
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
    $("#save").onclick = async ()=>{
      try{
        const owner = $("#tOwner").value || null;
        const sheet = $("#tSheet").value || null;
        if(!sheet) throw new Error("Escolha uma ficha.");
        const patch = { ownerUid: owner, linkedCharId: sheet, name: clampLen($("#tName").value, 60), spriteUrl: clampLen($("#tSprite").value.trim(), 420), updatedAt: Date.now() };
        await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, patch);
        if(owner) await dbUpdate(`rooms/${roomId}/players/${owner}`, { tokenId: tokenId, characterId: sheet });
        toast("Salvo.", "ok");
        closeModal();
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
  }

  function renderTokensPane(){
    const list = Object.entries(tokens||{});
    return `
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
                  <button class="secondary" data-edit-token="${id}">Editar</button>
                  <button class="danger" data-del-token="${id}">Del</button>
                </div>
              </div>
              <small>player: ${t.ownerUid?uidShort(t.ownerUid):"mestre"} | ficha: ${t.linkedCharId?esc(characters?.[t.linkedCharId]?.name||t.linkedCharId):"—"}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhum token.</small></div>`}
        </div>
      </div>
    `;
  }

  function renderSheetsPane(){
    const list = Object.values(characters||{}).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    return `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Fichas</strong>
          <button class="secondary" id="goCreate">Criar</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(c=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(c.name||"Ficha")}</strong>
                <button class="secondary" data-open-char="${c.charId}">Abrir</button>
              </div>
              <small class="mono">${c.charId}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhuma ficha.</small></div>`}
        </div>
      </div>
    `;
  }

  function renderRollsPane(){
    const rows = Object.values(rolls||{}).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,120);
    return `
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
  }

  function renderLogsPane(){
    const rows = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,120);
    return `
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
  }

  function renderMarkersPane(){
    const list = Object.entries(markers||{});
    return `
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Marcos</strong>
          <button class="secondary" id="placeMarker">Colocar</button>
        </div>
        <div class="list" style="margin-top:8px">
          ${list.length? list.map(([id,m])=>`
            <div class="item">
              <div class="actions" style="justify-content:space-between">
                <strong>${esc(m.title||"Marco")}</strong>
                <button class="secondary" data-open-marker="${id}">Abrir</button>
              </div>
              <small class="mono">x:${num(m.x,0).toFixed(0)} y:${num(m.y,0).toFixed(0)}</small>
            </div>
          `).join("") : `<div class="item"><small>Nenhum marco.</small></div>`}
        </div>
      </div>
    `;
  }

  function setPane(html){ pane.innerHTML=html; bindPane(); }

  function bindPane(){
    const btnNew=pane.querySelector("#newToken");
    if(btnNew) btnNew.onclick = async ()=>{ const tokenId = await dbPush(`rooms/${roomId}/tokens`, { tokenId:null, name:"Token", x:view.x+220, y:view.y+220, ownerUid:null, linkedCharId:null, spriteUrl:"", updatedAt: Date.now() }); await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId }); toast("Token criado.","ok"); };

    pane.querySelectorAll("[data-edit-token]").forEach(b=> b.onclick = ()=> openTokenEditor(b.dataset.editToken));
    pane.querySelectorAll("[data-del-token]").forEach(b=> b.onclick = async ()=>{ await dbSet(`rooms/${roomId}/tokens/${b.dataset.delToken}`, null); toast("Token deletado.","ok"); });

    const cr=pane.querySelector("#clearRolls");
    if(cr) cr.onclick = async ()=>{ await dbSet(`rooms/${roomId}/rolls`, {}); toast("Rolagens limpas.","ok"); };
    const cl=pane.querySelector("#clearLogs");
    if(cl) cl.onclick = async ()=>{ await dbSet(`logs/${roomId}`, {}); toast("Logs limpos.","ok"); };

    pane.querySelectorAll("[data-open-char]").forEach(b=> b.onclick = ()=> openModal("Abertura", "<div class='item'><small>Abra fichas clicando em token ou use o painel fichas no próximo patch.</small></div>"));
    const btnCreate=pane.querySelector("#goCreate");
    if(btnCreate) btnCreate.onclick = ()=> openModal("Criar", "<div class='item'><small>Use a criação pelo token/ficha por enquanto.</small></div>");

    const btnPlace=pane.querySelector("#placeMarker");
    if(btnPlace) btnPlace.onclick = ()=>{ placingMarker=true; toast("Clique no mapa para colocar o marco.","ok"); };

    pane.querySelectorAll("[data-open-marker]").forEach(b=> b.onclick = ()=> openMarkerPopup(b.dataset.openMarker).catch(()=>{}));
  }

  body.querySelector("#tTokens").onclick = ()=>{ toolsState.section="tokens"; setPane(renderTokensPane()); };
  body.querySelector("#tSheets").onclick = ()=>{ toolsState.section="sheets"; setPane(renderSheetsPane()); };
  body.querySelector("#tRolls").onclick = ()=>{ toolsState.section="rolls"; setPane(renderRollsPane()); };
  body.querySelector("#tLogs").onclick = ()=>{ toolsState.section="logs"; setPane(renderLogsPane()); };
  body.querySelector("#tMarkers").onclick = ()=>{ toolsState.section="markers"; setPane(renderMarkersPane()); };

  if(toolsState.section==="tokens") setPane(renderTokensPane());
  else if(toolsState.section==="rolls") setPane(renderRollsPane());
  else if(toolsState.section==="logs") setPane(renderLogsPane());
  else setPane(renderMarkersPane());
}

/* =================== MARKERS =================== */
async function createMarkerAt(x,y){
  await dbPush(`rooms/${roomId}/markers`, { title:"Marco", x, y, tokenIds:[], items:[], advantages:[], ts:Date.now() });
  toast("Marco criado.", "ok");
}
function tokenSelectOptions(){
  return Object.entries(tokens||{}).map(([id,t])=>`<option value="${id}">${esc(t.name||id)}</option>`).join("");
}
async function openMarkerPopup(markerId){
  const m = markers?.[markerId];
  if(!m) return;
  const tokenIds = (m.tokenIds||[]).slice();
  const items = (m.items||[]).slice();
  const advs = (m.advantages||[]).slice();

  openModal("Marco", `
    <div class="item">
      <label class="label">Nome</label>
      <input id="mkTitle" value="${esc(m.title||"Marco")}" />

      <div class="actions" style="margin-top:10px; flex-wrap:wrap">
        <button class="secondary" id="jump">Ir</button>
        <button class="secondary" id="pickToken">Ctrl+X (pegar token selecionado)</button>
        <button class="secondary" id="pasteToken">Ctrl+V (colocar token no marco)</button>
        <button class="danger" id="del">Deletar marco</button>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Tokens dentro</strong>
          <div class="actions">
            <select id="tokSel"><option value="">(token)</option>${tokenSelectOptions()}</select>
            <button class="secondary" id="addTok">Adicionar</button>
          </div>
        </div>
        <div id="tokList" class="list" style="margin-top:8px"></div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Itens do marco</strong>
          <button class="secondary" id="addItem">+ item</button>
        </div>
        <div id="itemList" class="list" style="margin-top:8px"></div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between">
          <strong>Vantagens do marco</strong>
          <button class="secondary" id="addAdv">+ vantagem</button>
        </div>
        <div id="advList" class="list" style="margin-top:8px"></div>
      </div>

      <div class="actions" style="margin-top:10px">
        <button id="save">Salvar</button>
        <button class="secondary" id="close">Fechar</button>
      </div>
    </div>
  `);

  const renderTokList = ()=>{
    const root=$("#tokList");
    root.innerHTML = tokenIds.length? "" : `<div class="item"><small>vazio</small></div>`;
    tokenIds.forEach((tid, idx)=>{
      const t=tokens?.[tid];
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="actions" style="justify-content:space-between">
        <strong>${esc(t?.name||tid)}</strong>
        <button class="danger" data-rm="${idx}">Remover</button>
      </div>`;
      div.querySelector("[data-rm]").onclick = ()=>{ tokenIds.splice(idx,1); renderTokList(); };
      root.appendChild(div);
    });
  };
  const renderItemList = ()=>{
    const root=$("#itemList");
    root.innerHTML = items.length? "" : `<div class="item"><small>vazio</small></div>`;
    items.forEach((it, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="kv">
        <div><strong>${esc(it.name||"Item")}</strong><br/><small>${esc((it.attrUsed||"FOR").toUpperCase())} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small></div>
        <button class="danger" data-del="${idx}">Del</button>
      </div>`;
      div.querySelector("[data-del]").onclick = ()=>{ items.splice(idx,1); renderItemList(); };
      root.appendChild(div);
    });
  };
  const renderAdvList = ()=>{
    const root=$("#advList");
    root.innerHTML = advs.length? "" : `<div class="item"><small>vazio</small></div>`;
    advs.forEach((a, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="kv">
        <div><strong>${esc(a.name||"Vantagem")}</strong><br/><small>${esc(a.type||"")}</small></div>
        <div style="text-align:right">
          <small style="cursor:pointer" data-dt="${idx}">DT: <span class="mono">${num(a.dt,9)}</span></small>
          <div style="margin-top:6px"><button class="danger" data-del="${idx}">Del</button></div>
        </div>
      </div>`;
      div.querySelector("[data-dt]").onclick = ()=> rollAdvDTInline(advs[idx]);
      div.querySelector("[data-del]").onclick = ()=>{ advs.splice(idx,1); renderAdvList(); };
      root.appendChild(div);
    });
  };

  renderTokList(); renderItemList(); renderAdvList();

  $("#close").onclick=closeModal;
  $("#jump").onclick = ()=>{ view.x = num(m.x,0)-150; view.y = num(m.y,0)-150; mapRender(); };
  $("#del").onclick = async ()=>{ await dbSet(`rooms/${roomId}/markers/${markerId}`, null); toast("Marco deletado.","ok"); closeModal(); };

  $("#addTok").onclick = ()=>{ const tid=$("#tokSel").value; if(!tid) return; if(!tokenIds.includes(tid)) tokenIds.push(tid); renderTokList(); };
  $("#pickToken").onclick = ()=>{ if(!selectedTokenId){ toast("Selecione um token no mapa primeiro.","error"); return; } toolsState.clipboardTokenId=selectedTokenId; toast("Token copiado.","ok"); };
  $("#pasteToken").onclick = ()=>{ const tid=toolsState.clipboardTokenId; if(!tid){ toast("Clipboard vazio.","error"); return; } if(!tokenIds.includes(tid)) tokenIds.push(tid); renderTokList(); toast("Colado.","ok"); };
  $("#addItem").onclick = ()=>{ items.push({ id:`mk_it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" }); renderItemList(); };
  $("#addAdv").onclick  = ()=>{ advs.push({ id:`mk_adv_${Date.now()}`, name:"Vantagem", desc:"", type:"ativa", mod:0, attrUsed:"QI", dt:9 }); renderAdvList(); };

  $("#save").onclick = async ()=>{
    const patch = { title: clampLen($("#mkTitle").value, 80), tokenIds, items, advantages: advs, updatedAt: Date.now() };
    await dbUpdate(`rooms/${roomId}/markers/${markerId}`, patch);
    toast("Marco salvo.","ok");
    closeModal();
  };
}

/* =================== CSS tweaks for fullscreen canvas =================== */
(function injectStyle(){
  const css = `#panelRoot{ padding:0 !important; } .canvasWrap.full{ height: calc(100vh - 76px); } .canvasWrap.full canvas{ width:100%; height:100%; display:block; border-radius:0 !important; }`;
  const s=document.createElement("style"); s.textContent=css; document.head.appendChild(s);
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
