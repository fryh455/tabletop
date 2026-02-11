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
  updateFogButtons();
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
  unsub.push(dbOn(`rooms/${roomId}`, (v)=>{ if(v){ room=v; setHeader(); if(currentTab==="map") mapRender(); } }));
  unsub.push(dbOn(`rooms/${roomId}/players`, (v)=>{ players=v||{}; if(me) role = (room?.masterUid===me.uid) ? "master" : (players?.[me.uid]?.role || "player"); mountTabs(); renderCurrent(); }));
  unsub.push(dbOn(`rooms/${roomId}/tokens`, (v)=>{ tokens=v||{}; if(currentTab==="map") mapRender(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; if(currentTab==="sheets") renderSheets(); if(currentTab==="create") renderCreateSheet(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/rolls`, (v)=>{ rolls=v||{}; if(currentTab==="rolls") renderRolls(); }));
  unsub.push(dbOn(`logs/${roomId}`, (v)=>{ logs=v||{}; if(currentTab==="logs") renderLogs(); }));
  unsub.push(dbOn(`rooms/${roomId}/markers`, (v)=>{ markers=v||{}; if(currentTab==="map") mapRender(); if(currentTab==="markers") renderMarkers(); }));
}

async function addLog(type, message, payload={}){
  const entry = { type, actorUid: me.uid, message: clampLen(message, 220), payload, ts: Date.now() };
  await dbPush(`logs/${roomId}`, entry);
}

/* ---------------- Tabs ---------------- */
let tabs=[];
let currentTab="map";

function mountTabs(){
  const root = $("#tabs");
  if(!root) return;

  // Player: só mapa (sem tabs)
  if(!isMaster()){
    root.style.display="none";
    return;
  }

  root.style.display="";
  root.classList.add("verticalTabs");
  root.innerHTML = "";
  const defs = [
    {id:"map",label:"Mapa"},
    {id:"tokens",label:"Tokens"},
    {id:"sheets",label:"Fichas"},
    {id:"create",label:"Criar Ficha"},
    {id:"rolls",label:"Rolagens"},
    {id:"logs",label:"Logs"},
    {id:"dice",label:"Outros dados"},
    {id:"markers",label:"Marcos"}
  ];

  defs.forEach((t)=>{
    const div=document.createElement("div");
    div.className="pill"+(t.id===currentTab?" active":"");
    div.dataset.tab=t.id;
    div.textContent=t.label;
    div.addEventListener("click", ()=>selectTab(t.id));
    root.appendChild(div);
  });
  tabs=Array.from(root.querySelectorAll(".pill"));
  if(!defs.some(d=>d.id===currentTab)) currentTab="map";
  tabs.forEach(p=>p.classList.toggle("active", p.dataset.tab===currentTab));
}

function selectTab(id){
  currentTab=id;
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.tab===id));
  renderCurrent();
}

function renderCurrent(){
  if(!me || !room) return;
  if(!isMaster()){
    currentTab="map";
    renderMap();
    return;
  }
  if(currentTab==="map") renderMap();
  else if(currentTab==="tokens") renderTokens();
  else if(currentTab==="sheets") renderSheets();
  else if(currentTab==="create") renderCreateSheet();
  else if(currentTab==="rolls") renderRolls();
  else if(currentTab==="logs") renderLogs();
  else if(currentTab==="dice") renderDice();
  else if(currentTab==="markers") renderMarkers();
}

/* ---------------- Fog paint ---------------- */
function updateFogButtons(){
  const enabled = !!room?.settings?.fog?.enabled;
  $("#btnFogToggle").textContent = `Fog: ${enabled?"ON":"OFF"}`;
  $("#btnFogToggle").disabled = !isMaster();
  $("#btnFogClear").disabled = !isMaster();
}
$("#btnFogToggle").addEventListener("click", async ()=>{
  try{
    if(!isMaster()) return;
    const enabled = !!room?.settings?.fog?.enabled;
    await dbUpdate(`rooms/${roomId}/settings/fog`, { enabled: !enabled });
    await addLog("map", `Fog ${!enabled?"ON":"OFF"}`);
  }catch(e){ toast(String(e?.message||e),"error"); }
});
$("#btnFogClear").addEventListener("click", async ()=>{
  try{
    if(!isMaster()) return;
    await dbSet(`rooms/${roomId}/settings/fog/blocks`, {});
    await addLog("map", "Fog limpo");
  }catch(e){ toast(String(e?.message||e),"error"); }
});

/* ---------------- Map ---------------- */
let canvas, ctx, dpr=1;
let zoom=1, gridSize=48;
let selectedTokenId=null;
const view={x:0,y:0};

let fogBrush = 160;
let fogMode = "paint";
let paintingFog = false;

function renderMap(){
  panelRoot.innerHTML = `
    <div class="canvasWrap">
      <canvas id="mapCanvas"></canvas>
    </div>
    ${isMaster()?`
      <div class="card pad" style="margin-top:10px">
        <div class="actions" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <small>Fog brush</small>
            <div class="actions" style="gap:8px">
              <input id="fogSize" type="number" value="${fogBrush}" style="width:120px" />
              <button class="secondary" id="fogPaint">Pintar</button>
              <button class="secondary" id="fogErase">Apagar</button>
            </div>
          </div>
          <small style="color:var(--muted)">Fog ON → clique/arraste para pintar quadrados.</small>
        </div>
      </div>
    `:""}
  `;

  canvas = $("#mapCanvas");
  ctx = canvas.getContext("2d");
  dpr = window.devicePixelRatio || 1;
  zoom = num(room?.settings?.map?.zoom, 1);
  gridSize = num(room?.settings?.map?.gridSize, 48);
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive:true });
  bindMapInteractions();
  mapRender();

  if(isMaster()){
    $("#fogSize").onchange = ()=> { fogBrush = Math.max(20, Math.min(800, num($("#fogSize").value,160))); };
    $("#fogPaint").onclick = ()=> { fogMode="paint"; toast("Fog: pintar", "ok"); };
    $("#fogErase").onclick = ()=> { fogMode="erase"; toast("Fog: apagar", "ok"); };
  }
}
function resizeCanvas(){
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  mapRender();
}
function worldToScreen(wx, wy){ return { x:(wx-view.x)*zoom*dpr, y:(wy-view.y)*zoom*dpr }; }
function screenToWorld(sx, sy){ return { x:sx/(zoom*dpr)+view.x, y:sy/(zoom*dpr)+view.y }; }

function drawGrid(){
  const w=canvas.width,h=canvas.height;
  ctx.save();
  ctx.globalAlpha=0.22;
  ctx.lineWidth=1;
  ctx.strokeStyle="#22304a";
  const gs = gridSize*zoom*dpr;
  const ox = -(view.x*zoom*dpr) % gs;
  const oy = -(view.y*zoom*dpr) % gs;
  for(let x=ox; x<w; x+=gs){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=oy; y<h; y+=gs){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}

const _imgCache = new Map();
function getImg(url){
  if(!_imgCache.has(url)){
    const img=new Image();
    img.crossOrigin="anonymous";
    img.src=url;
    _imgCache.set(url,img);
  }
  return _imgCache.get(url);
}

function drawTokens(){
  for(const [id,t] of Object.entries(tokens||{})){
    // Player vê só o próprio token
    if(!isMaster() && !(t?.ownerUid && me && t.ownerUid===me.uid)) continue;

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
    ctx.strokeStyle = (selectedTokenId===id) ? "#4aa3ff" : "#9aa4b233";
    ctx.lineWidth = (selectedTokenId===id) ? 3 : 2;
    ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

function drawMarkers(){
  if(!isMaster()) return;
  for(const [id,m] of Object.entries(markers||{})){
    const p=worldToScreen(num(m.x,0), num(m.y,0));
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,.8)";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y-8);
    ctx.lineTo(p.x+8, p.y+8);
    ctx.lineTo(p.x-8, p.y+8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.85)";
    ctx.font = `${Math.max(12, 12*zoom)}px system-ui`;
    ctx.fillText(m.title||"Marco", p.x+10, p.y+4);
    ctx.restore();
  }
}

function drawFog(){
  const fog = room?.settings?.fog;
  if(!fog?.enabled) return;
  const blocks = fog.blocks || {};
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.60)";
  for(const key of Object.keys(blocks)){
    const b=blocks[key];
    const p=worldToScreen(num(b.x,0), num(b.y,0));
    const w=num(b.w,160)*zoom*dpr;
    const h=num(b.h,160)*zoom*dpr;
    ctx.fillRect(p.x,p.y,w,h);
  }
  ctx.restore();
}

function mapRender(){
  if(!canvas||!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  drawTokens();
  drawMarkers();
  drawFog();
}

function hitToken(wx, wy){
  let best=null;
  for(const [id,t] of Object.entries(tokens||{})){
    if(!isMaster() && !(t?.ownerUid && me && t.ownerUid===me.uid)) continue;
    const dx=wx-num(t.x,0), dy=wy-num(t.y,0);
    const r=24;
    if(dx*dx+dy*dy<=r*r) best={id,t};
  }
  return best;
}

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

function bindMapInteractions(){
  if(!canvas) return;
  let down=false, moved=false;
  let dragging=null, pan=true;
  let last={sx:0,sy:0};

  canvas.onmousedown=(e)=>{
    down=true; moved=false;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    last={sx,sy};
    const w=screenToWorld(sx,sy);

    if(isMaster() && room?.settings?.fog?.enabled){
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
    }else{
      selectedTokenId=null; dragging=null; pan=true;
    }
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
      await dbUpdate(`rooms/${roomId}/tokens/${id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
      await addLog("token","Token movido",{tokenId:id,x:t.x,y:t.y});
      return;
    }
    if(!moved && selectedTokenId){
      const t=tokens[selectedTokenId];
      if(t && canEditToken(t)) openPlayerSheetPopup(selectedTokenId).catch(()=>{});
    }
  };

  canvas.addEventListener("wheel",(e)=>{
    e.preventDefault();
    const delta=Math.sign(e.deltaY);
    zoom = Math.max(0.02, Math.min(6.0, zoom + (delta>0?-0.1:0.1)));
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

    if(isMaster() && room?.settings?.fog?.enabled){
      paintingFog=true;
      applyFogAt(w.x,w.y).catch(()=>{});
      return;
    }

    const hit=hitToken(w.x,w.y);
    if(hit && canEditToken(hit.t)){
      selectedTokenId=hit.id;
      tDragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
      tPan=false;
    }else{
      selectedTokenId=null;
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
      await dbUpdate(`rooms/${roomId}/tokens/${id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
      await addLog("token","Token movido (touch)",{tokenId:id,x:t.x,y:t.y});
      return;
    }
    if(!tMoved && selectedTokenId){
      const t=tokens[selectedTokenId];
      if(t && canEditToken(t)) openPlayerSheetPopup(selectedTokenId).catch(()=>{});
    }
    tPan=false; tLast=null;
  },{passive:true});
}

/* ---------------- Player sheet popup ---------------- */
function mentalPenalty(mental){ return (mental<=-8) ? -5 : 0; }
function advantagesDisabled(mental){ return mental<=-11; }

function getCharByToken(tokenId){
  const t=tokens?.[tokenId];
  if(!t?.linkedCharId) return null;
  return characters?.[t.linkedCharId] || null;
}

async function pushRoll(payload){
  await dbPush(`rooms/${roomId}/rolls`, payload);
  await addLog("roll", payload?.context?.label || "Rolagem", payload.context||{});
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

async function openPlayerSheetPopup(tokenId){
  const t=tokens[tokenId];
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
          <button class="secondary" id="addItem">+ item</button>
        </div>
        <div id="inv" class="list" style="margin-top:8px"></div>
      </div>

      ${isMaster()?`
        <div class="card pad" style="margin-top:10px">
          <strong>Vantagens</strong>
          <div id="advs" class="list" style="margin-top:8px"></div>
        </div>
      `:""}

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

  $("#addItem").onclick = async ()=>{
    const items=(char.inventory||[]).slice();
    items.push({ id:`it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" });
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
    toast("Item criado.", "ok");
  };

  if(isMaster()){
    const advRoot=$("#advs");
    advRoot.innerHTML = advs.length? "" : `<div class="item"><small>Sem vantagens.</small></div>`;
    advs.forEach((a, idx)=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `<div class="kv"><div><strong style="cursor:pointer" data-adv="${idx}">${esc(a.name||"Vantagem")}</strong><br/><small>${esc(a.type||"")}</small></div><div style="text-align:right"><small style="cursor:pointer" data-dt="${idx}">DT: <span class="mono">${num(a.dt,9)}</span></small></div></div>`;
      div.querySelector("[data-adv]").onclick = ()=> rollAdvInline(char, advs[idx]);
      div.querySelector("[data-dt]").onclick = ()=> rollAdvDTInline(advs[idx]);
      advRoot.appendChild(div);
    });
  }
}

/* ---------------- Master: Tokens ---------------- */
function tokenOptionsForSheets(selectedId){
  const opts = Object.values(characters||{}).map(c=>`<option value="${c.charId}" ${c.charId===selectedId?"selected":""}>${esc(c.name||c.charId)}</option>`).join("");
  return `<option value="">(nenhuma)</option>` + opts;
}
function playerOptions(selectedUid){
  const opts = Object.values(players||{}).map(p=>`<option value="${p.uid}" ${p.uid===selectedUid?"selected":""}>${p.uid}</option>`).join("");
  return `<option value="">(mestre)</option>` + opts;
}

function renderTokens(){
  panelRoot.innerHTML = `
    <div class="card pad">
      <div class="actions" style="justify-content:space-between">
        <h3 style="margin:0">Tokens</h3>
        <button id="btnNewToken">Novo token</button>
      </div>
      <div class="list" id="tokList" style="margin-top:10px"></div>
      <div class="card pad" style="margin-top:12px">
        <h3 style="margin:0 0 8px 0">PostImage</h3>
        <label class="label">API Key</label>
        <input id="postKey" placeholder="ex: 123abc..." />
      </div>
    </div>
  `;
  const postKeyIn=$("#postKey");
  postKeyIn.value = localStorage.getItem("sur4_postimage_key") || "";
  postKeyIn.onchange = ()=> localStorage.setItem("sur4_postimage_key", postKeyIn.value.trim());

  const root=$("#tokList");
  const list=Object.entries(tokens||{});
  root.innerHTML = list.length? "" : `<div class="item"><small>Nenhum token.</small></div>`;
  list.forEach(([id,t])=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <strong>${esc(t.name||"Token")}</strong>
        <div class="actions">
          <button class="secondary" data-edit="${id}">Editar</button>
          <button class="danger" data-del="${id}">Del</button>
        </div>
      </div>
      <small>player: ${t.ownerUid?uidShort(t.ownerUid):"mestre"} | ficha: ${t.linkedCharId?esc(characters?.[t.linkedCharId]?.name||t.linkedCharId):"—"}</small>
    `;
    div.querySelector("[data-edit]").onclick = ()=> openTokenEditor(id);
    div.querySelector("[data-del]").onclick = async ()=>{
      await dbSet(`rooms/${roomId}/tokens/${id}`, null);
      await addLog("token","Token deletado",{tokenId:id});
    };
    root.appendChild(div);
  });

  $("#btnNewToken").onclick = async ()=>{
    const tokenId = await dbPush(`rooms/${roomId}/tokens`, { tokenId:null, name:"Token", x:200, y:200, ownerUid:null, linkedCharId:null, spriteUrl:"", updatedAt: Date.now() });
    await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
    await addLog("token","Token criado",{tokenId});
    toast("Token criado.", "ok");
  };
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

      <label class="label" style="margin-top:10px">Nome (interno, não aparece no mapa)</label>
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
      const patch = {
        ownerUid: owner,
        linkedCharId: sheet,
        name: clampLen($("#tName").value, 60),
        spriteUrl: clampLen($("#tSprite").value.trim(), 420),
        updatedAt: Date.now()
      };
      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, patch);

      // link to player (so player sees this token + sheet)
      if(owner){
        await dbUpdate(`rooms/${roomId}/players/${owner}`, { tokenId: tokenId, characterId: sheet });
      }
      await addLog("token","Token atualizado",{tokenId, patch});
      toast("Salvo.", "ok");
      closeModal();
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

/* ---------------- Master: Create Sheet ---------------- */
function renderCreateSheet(){
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3 style="margin:0 0 10px 0">Criar ficha</h3>
      <label class="label">Nome</label>
      <input id="newName" placeholder="ex: NPC / Criatura / Player" />
      <label class="label" style="margin-top:10px">Atributos (FOR/DEX/VIG/QI)</label>
      <div class="grid2">
        <input id="aFOR" type="number" value="1" />
        <input id="aDEX" type="number" value="1" />
        <input id="aVIG" type="number" value="1" />
        <input id="aQI" type="number" value="1" />
      </div>
      <label class="label" style="margin-top:10px">Mental</label>
      <input id="newMental" type="number" value="0" />
      <div class="actions" style="margin-top:10px">
        <button id="create">Criar</button>
      </div>
    </div>
  `;
  $("#create").onclick = async ()=>{
    const obj={
      name: clampLen($("#newName").value||"Ficha", 80),
      ownerUid: null,
      attrs:{ FOR:num($("#aFOR").value,1), DEX:num($("#aDEX").value,1), VIG:num($("#aVIG").value,1), QI:num($("#aQI").value,1) },
      mental: num($("#newMental").value,0),
      inventory:[], advantages:[],
      updatedAt: Date.now(),
      charId:null
    };
    const charId = await dbPush(`rooms/${roomId}/characters`, obj);
    await dbUpdate(`rooms/${roomId}/characters/${charId}`, { charId });
    await addLog("character","Ficha criada",{charId});
    toast("Ficha criada.", "ok");
    selectTab("sheets");
  };
}

/* ---------------- Rolls & Logs clear ---------------- */
function renderRolls(){
  const rows = Object.values(rolls||{}).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,180);
  panelRoot.innerHTML = `
    <div class="card pad">
      <div class="actions" style="justify-content:space-between">
        <h3 style="margin:0">Rolagens</h3>
        <button class="danger" id="clearRolls">Limpar rolagens</button>
      </div>
      <div class="list" id="rollList" style="margin-top:10px"></div>
    </div>
  `;
  $("#clearRolls").onclick = async ()=>{
    await dbSet(`rooms/${roomId}/rolls`, {});
    await addLog("system","Rolagens limpas");
    toast("Rolagens limpas.", "ok");
  };
  const root=$("#rollList");
  root.innerHTML = rows.length? "" : `<div class="item"><small>Nenhuma rolagem.</small></div>`;
  rows.forEach(r=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="actions" style="justify-content:space-between">
      <strong>${esc(r.context?.kind || "roll")}</strong>
      <small class="mono">${new Date(r.timestamp||0).toLocaleTimeString()}</small>
    </div>
    <div><strong>${r.total}</strong> <small>${esc(r.expression||"")}</small></div>`;
    root.appendChild(div);
  });
}

function renderLogs(){
  const rows = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,220);
  panelRoot.innerHTML = `
    <div class="card pad">
      <div class="actions" style="justify-content:space-between">
        <h3 style="margin:0">Logs</h3>
        <button class="danger" id="clearLogs">Limpar logs</button>
      </div>
      <div class="list" id="logList" style="margin-top:10px"></div>
    </div>
  `;
  $("#clearLogs").onclick = async ()=>{
    await dbSet(`logs/${roomId}`, {});
    toast("Logs limpos.", "ok");
  };
  const root=$("#logList");
  root.innerHTML = rows.length? "" : `<div class="item"><small>Sem logs.</small></div>`;
  rows.forEach(l=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="actions" style="justify-content:space-between">
      <strong>${esc(l.type||"log")}</strong>
      <small class="mono">${new Date(l.ts||0).toLocaleString()}</small>
    </div>
    <div>${esc(l.message||"")}</div>`;
    root.appendChild(div);
  });
}

/* ---------------- Dice ---------------- */
async function rollDie(sides){
  const die = Math.floor(Math.random()*sides)+1;
  await dbPush(`rooms/${roomId}/rolls`, {
    userUid: me.uid, expression:`1d${sides}`, mode:"normal",
    dice:[die], picked:die, total:die,
    context:{ roomId, kind:"die", label:`d${sides}: ${die}` },
    visibility:"public", timestamp:Date.now()
  });
  toast(`d${sides}: ${die}`, "ok");
}
function renderDice(){
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3 style="margin:0 0 10px 0">Outros dados</h3>
      <div class="actions" style="flex-wrap:wrap">
        <button class="secondary" data-d="4">d4</button>
        <button class="secondary" data-d="6">d6</button>
        <button class="secondary" data-d="8">d8</button>
        <button class="secondary" data-d="10">d10</button>
      </div>
    </div>
  `;
  $$("button[data-d]").forEach(b=> b.onclick = ()=> rollDie(Number(b.dataset.d)));
}

/* ---------------- Markers ---------------- */
function renderMarkers(){
  const list = Object.entries(markers||{});
  panelRoot.innerHTML = `
    <div class="card pad">
      <div class="actions" style="justify-content:space-between">
        <h3 style="margin:0">Marcos</h3>
        <button id="addMarker">Novo</button>
      </div>
      <div class="list" id="mList" style="margin-top:10px"></div>
      <small style="color:var(--muted)">Só mestre enxerga.</small>
    </div>
  `;
  $("#addMarker").onclick = async ()=>{
    await dbPush(`rooms/${roomId}/markers`, { title:"Marco", x:view.x+120, y:view.y+120, ts:Date.now() });
    toast("Marco criado.", "ok");
  };
  const root=$("#mList");
  root.innerHTML = list.length? "" : `<div class="item"><small>Nenhum marco.</small></div>`;
  list.forEach(([id,m])=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <strong>${esc(m.title||"Marco")}</strong>
        <div class="actions">
          <button class="secondary" data-j="${id}">Ir</button>
          <button class="danger" data-d="${id}">Del</button>
        </div>
      </div>
      <small class="mono">x:${num(m.x,0).toFixed(0)} y:${num(m.y,0).toFixed(0)}</small>
    `;
    div.querySelector("[data-j]").onclick = ()=>{ view.x=num(m.x,0)-150; view.y=num(m.y,0)-150; selectTab("map"); mapRender(); };
    div.querySelector("[data-d]").onclick = async ()=>{ await dbSet(`rooms/${roomId}/markers/${id}`, null); toast("Removido.", "ok"); };
    root.appendChild(div);
  });
}

/* ---------------- Style injection ---------------- */
(function injectStyle(){
  const css = `
  #tabs.verticalTabs{ display:flex; flex-direction:column; gap:8px; width:180px; position:sticky; top:12px; }
  @media (max-width: 860px){ #tabs.verticalTabs{ flex-direction:row; width:auto; position:static; overflow:auto; } }
  `;
  const s=document.createElement("style");
  s.textContent=css;
  document.head.appendChild(s);
})();

/* ---------------- Auth gate ---------------- */
onAuth(async (user)=>{
  if(!user){ toast("Faça login primeiro.", "error"); goHome(); return; }
  me = user;
  try{
    await ensureJoin();
    setHeader();
    mountTabs();
    subAll();
    await addLog("system","Conectado",{ uid: me.uid });
    currentTab="map";
    renderCurrent();
  }catch(e){
    toast(String(e?.message||e),"error");
  }
});
