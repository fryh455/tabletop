import { $, $$, bindModal, toast, goHome, esc, clampLen, num, uidShort, openModal, closeModal } from "./app.js";
import { initFirebase, onAuth, logout, dbGet, dbSet, dbUpdate, dbPush, dbOn } from "./firebase.js";
import { intentions as calcIntentions, movement, dodge, dtHead, dtTorso, dtArm, dtLeg, hpTotal, inventoryLimit, roll as rollDice } from "./sur4.js";
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
let players={}, tokens={}, characters={}, rolls={}, logs={};
let unsub=[];

function clearSubs(){ unsub.forEach(fn=>fn&&fn()); unsub=[]; }
function isMaster(){ return role==="master"; }
function myPlayer(){ return me ? players?.[me.uid] : null; }
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
  unsub.push(dbOn(`rooms/${roomId}`, (v)=>{ if(v){ room=v; setHeader(); } }));
  unsub.push(dbOn(`rooms/${roomId}/players`, (v)=>{ players=v||{}; if(me) role = (room?.masterUid===me.uid) ? "master" : (players?.[me.uid]?.role || "player"); mountTabs(); renderCurrent(); }));
  unsub.push(dbOn(`rooms/${roomId}/tokens`, (v)=>{ tokens=v||{}; if(currentTab==="map") mapRender(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; if(currentTab==="sheet") renderSheet(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/rolls`, (v)=>{ rolls=v||{}; if(currentTab==="rolls") renderRolls(); }));
  unsub.push(dbOn(`logs/${roomId}`, (v)=>{ logs=v||{}; if(currentTab==="logs") renderLogs(); }));
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
  root.innerHTML = "";
  const defs = isMaster()
    ? [{id:"map",label:"Mapa"},{id:"sheet",label:"Fichas"},{id:"tokens",label:"Tokens"},{id:"rolls",label:"Rolagens"},{id:"logs",label:"Logs"}]
    : [{id:"map",label:"Mapa"},{id:"sheet",label:"Ficha"}];

  defs.forEach((t, i)=>{
    const div=document.createElement("div");
    div.className="pill"+(i===0?" active":"");
    div.dataset.tab=t.id;
    div.textContent=t.label;
    div.addEventListener("click", ()=>selectTab(t.id));
    root.appendChild(div);
  });
  tabs=Array.from(root.querySelectorAll(".pill"));
  // force valid current tab
  if(!defs.some(d=>d.id===currentTab)) currentTab=defs[0].id;
  tabs.forEach(p=>p.classList.toggle("active", p.dataset.tab===currentTab));
}

function selectTab(id){
  currentTab=id;
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.tab===id));
  renderCurrent();
}

function renderCurrent(){
  if(!me || !room) return;
  if(currentTab==="map") renderMap();
  else if(currentTab==="sheet") renderSheet();
  else if(currentTab==="tokens") renderTokens();
  else if(currentTab==="rolls") renderRolls();
  else if(currentTab==="logs") renderLogs();
}

/* ---------------- Fog buttons ---------------- */
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
    await dbSet(`rooms/${roomId}/settings/fog/reveals`, {});
    await addLog("map", "Fog limpo");
  }catch(e){ toast(String(e?.message||e),"error"); }
});

/* ---------------- Map ---------------- */
let canvas, ctx, dpr=1;
let zoom=1, gridSize=48;
let selectedTokenId=null;
const view={x:0,y:0};

function renderMap(){
  panelRoot.innerHTML = `
    <div class="canvasWrap">
      <canvas id="mapCanvas"></canvas>
    </div>
    <small style="display:block;margin-top:8px;color:var(--muted)">
      Mobile: toque e arraste para mover o mapa / tokens. Desktop: arraste para pan, scroll para zoom. Master: Shift+arrastar para revelar fog (quando ligado).
    </small>
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
  ctx.globalAlpha=0.25;
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
    const r=num(t.r,24);
    const s=worldToScreen(wx,wy);
    const rr=r*zoom*dpr;
    ctx.save();
    ctx.fillStyle = canEditToken(t) ? "rgba(74,163,255,.25)" : "rgba(255,255,255,.08)";
    ctx.strokeStyle = (selectedTokenId===id) ? "#4aa3ff" : "#9aa4b233";
    ctx.lineWidth = (selectedTokenId===id) ? 3 : 2;
    ctx.beginPath(); ctx.arc(s.x,s.y,rr,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle="#e6edf3";
    ctx.font = `${Math.max(12, 12*zoom)}px system-ui`;
    ctx.fillText(t.name||id, s.x+rr+6, s.y+4);
    ctx.restore();
  }
}
function drawFog(){
  const fog = room?.settings?.fog;
  if(!fog?.enabled) return;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.55)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.globalCompositeOperation="destination-out";
  const reveals=fog.reveals||{};
  for(const key of Object.keys(reveals)){
    const r=reveals[key];
    const p0=worldToScreen(num(r.x,0), num(r.y,0));
    const w=num(r.w,100)*zoom*dpr, h=num(r.h,100)*zoom*dpr;
    ctx.fillRect(p0.x,p0.y,w,h);
  }
  ctx.restore();
}
function mapRender(){
  if(!canvas||!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  drawTokens();
  drawFog();
}
function hitToken(wx, wy){
  let best=null;
  for(const [id,t] of Object.entries(tokens||{})){
    const dx=wx-num(t.x,0), dy=wy-num(t.y,0);
    const r=num(t.r,24);
    if(dx*dx+dy*dy<=r*r) best={id,t};
  }
  return best;
}

function bindMapInteractions(){
  if(!canvas) return;
  // mouse
  let down=false;
  let dragging=null;
  let pan=true;
  let last={sx:0,sy:0};
  let fogStart=null;

  canvas.onmousedown = (e)=>{
    down=true;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    last={sx,sy};
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);
    if(hit){
      selectedTokenId=hit.id;
      if(canEditToken(hit.t)){
        dragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
        pan=false;
      }else{
        dragging=null; pan=true;
      }
    }else{
      selectedTokenId=null;
      dragging=null;
      pan=true;
    }
    if(isMaster() && room?.settings?.fog?.enabled && e.shiftKey){
      fogStart={x:w.x,y:w.y};
      dragging=null;
      pan=false;
    }
    mapRender();
  };

  window.onmousemove = (e)=>{
    if(!down) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    if(dragging){
      const nx=w.x-dragging.ox, ny=w.y-dragging.oy;
      if(tokens[dragging.id]){
        tokens[dragging.id].x=nx;
        tokens[dragging.id].y=ny;
        mapRender();
      }
    }else if(pan){
      view.x -= (sx-last.sx)/(zoom*dpr);
      view.y -= (sy-last.sy)/(zoom*dpr);
      last={sx,sy};
      mapRender();
    }
  };

  window.onmouseup = async (e)=>{
    if(!down) return;
    down=false;
    if(fogStart && isMaster() && room?.settings?.fog?.enabled){
      const rect=canvas.getBoundingClientRect();
      const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
      const w=screenToWorld(sx,sy);
      const x=Math.min(fogStart.x,w.x), y=Math.min(fogStart.y,w.y);
      const ww=Math.abs(w.x-fogStart.x), hh=Math.abs(w.y-fogStart.y);
      fogStart=null;
      try{
        const key=`r_${Date.now()}`;
        await dbUpdate(`rooms/${roomId}/settings/fog/reveals`, { [key]: {x,y,w:ww,h:hh} });
        await addLog("map","Reveal fog",{x,y,w:ww,h:hh});
      }catch(err){ toast(String(err?.message||err),"error"); }
      return;
    }
    if(dragging){
      const id=dragging.id;
      const t=tokens[id];
      dragging=null;
      try{
        await dbUpdate(`rooms/${roomId}/tokens/${t.tokenId||id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
        await addLog("token","Token movido",{tokenId:id,x:t.x,y:t.y});
      }catch(err){ toast(String(err?.message||err),"error"); }
    }
    pan=true;
  };

  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta=Math.sign(e.deltaY);
    zoom = Math.max(0.4, Math.min(3.0, zoom + (delta>0?-0.1:0.1)));
    mapRender();
  }, { passive:false });

  // touch (mobile)
  let tDragging=null;
  let tLast=null;
  let tPan=false;

  canvas.addEventListener("touchstart", (e)=>{
    const t0=e.touches[0];
    if(!t0) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);
    if(hit && canEditToken(hit.t)){
      selectedTokenId=hit.id;
      tDragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
      tPan=false;
    }else{
      tDragging=null;
      tPan=true;
    }
    tLast={sx,sy};
    mapRender();
  }, { passive:true });

  canvas.addEventListener("touchmove", (e)=>{
    const t0=e.touches[0];
    if(!t0 || !tLast) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    if(tDragging){
      const nx=w.x-tDragging.ox, ny=w.y-tDragging.oy;
      if(tokens[tDragging.id]){
        tokens[tDragging.id].x=nx;
        tokens[tDragging.id].y=ny;
        mapRender();
      }
    }else if(tPan){
      view.x -= (sx-tLast.sx)/(zoom*dpr);
      view.y -= (sy-tLast.sy)/(zoom*dpr);
      tLast={sx,sy};
      mapRender();
    }
  }, { passive:true });

  canvas.addEventListener("touchend", async ()=>{
    if(tDragging){
      const id=tDragging.id;
      const t=tokens[id];
      tDragging=null;
      try{
        await dbUpdate(`rooms/${roomId}/tokens/${t.tokenId||id}`, { x:num(t.x,0), y:num(t.y,0), updatedAt:Date.now() });
        await addLog("token","Token movido (touch)",{tokenId:id,x:t.x,y:t.y});
      }catch(err){ toast(String(err?.message||err),"error"); }
    }
    tPan=false;
    tLast=null;
  }, { passive:true });
}

/* ---------------- Sheet ---------------- */
function getMyChar(){
  const p=myPlayer();
  return p?.characterId ? characters?.[p.characterId] : null;
}
function defaultChar(ownerUid){
  return {
    name:"Novo Personagem",
    bio:"",
    ownerUid,
    attrs:{ FOR:1, DEX:1, VIG:1, QI:1 },
    mental:0,
    advantages:[],
    disadvantages:[],
    members:{},
    inventory:[],
    updatedAt: Date.now()
  };
}
function derive(char){
  const a=char.attrs||{};
  const FOR=num(a.FOR,1), DEX=num(a.DEX,1), VIG=num(a.VIG,1), QI=num(a.QI,1);
  const dts = {
    head: dtHead(VIG),
    torso: dtTorso(VIG, FOR),
    armL: dtArm(VIG),
    armR: dtArm(VIG),
    legL: dtLeg(VIG),
    legR: dtLeg(VIG)
  };
  return {
    FOR,DEX,VIG,QI,
    intentions: calcIntentions(VIG,DEX),
    movement: movement(DEX),
    dodge: dodge(DEX),
    dts,
    hp: hpTotal(dts),
    invLimit: inventoryLimit(FOR,VIG)
  };
}
async function ensureCharAndToken(){
  const p=myPlayer();
  if(!p) return;
  // character
  if(!p.characterId){
    const charId = await dbPush(`rooms/${roomId}/characters`, { ...defaultChar(me.uid), charId:null });
    await dbUpdate(`rooms/${roomId}/characters/${charId}`, { charId });
    await dbUpdate(`rooms/${roomId}/players/${me.uid}`, { characterId: charId });
    await addLog("character","Ficha criada",{charId});
  }
  // token
  const p2 = await dbGet(`rooms/${roomId}/players/${me.uid}`);
  if(!p2.tokenId){
    const tokenId = await dbPush(`rooms/${roomId}/tokens`, {
      tokenId:null, name: me.email.split("@")[0], x: 120, y: 120, r: 24, layer:"tokens",
      ownerUid: me.uid, linkedCharId: p2.characterId, spriteUrl:"", locked:false, updatedAt: Date.now()
    });
    await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
    await dbUpdate(`rooms/${roomId}/players/${me.uid}`, { tokenId });
    await addLog("token","Token criado",{tokenId});
  }
}
function mentalPenalty(mental){ return (mental<=-8) ? -5 : 0; } // -8/-9 e abaixo
function advantagesDisabled(mental){ return mental<=-11; }

async function rollAttr(attr, char){
  try{
    const base=num(char.attrs?.[attr],1);
    const penalty=mentalPenalty(num(char.mental,0));
    const die=rollDice("normal").dice[0];
    const total=die+base+penalty;
    const rollObj={ userUid:me.uid, expression:`1d12+${base}${penalty?penalty:""}`, mode:"normal", dice:[die], picked:die, total,
      context:{ roomId, charId:char.charId, kind:"attr", attr, baseAttr:base, mental:char.mental, penalty }, visibility:"public", timestamp:Date.now() };
    await dbPush(`rooms/${roomId}/rolls`, rollObj);
    await addLog("roll", `Attr ${attr}: ${total}`, rollObj);
    toast(`${attr}: ${total}`, "ok");
  }catch(e){ toast(String(e?.message||e),"error"); }
}

async function rollItem(item, char){
  try{
    const a=(item.attrUsed||"FOR").toUpperCase();
    const base=num(char.attrs?.[a],1);
    const mod=num(item.mod,0);
    const penalty=mentalPenalty(num(char.mental,0));
    const die=rollDice("normal").dice[0];
    const total=die+base+mod+penalty;
    const rollObj={ userUid:me.uid, expression:`1d12+${base}+${mod}${penalty?penalty:""}`, mode:"normal", dice:[die], picked:die, total,
      context:{ roomId, charId:char.charId, kind:"item", itemId:item.id, name:item.name, attrUsed:a, mod, mental:char.mental, penalty }, visibility:"public", timestamp:Date.now() };
    await dbPush(`rooms/${roomId}/rolls`, rollObj);
    await addLog("roll", `Item ${item.name}: ${total}`, rollObj);
    toast(`Item ${item.name}: ${total}`, "ok");
  }catch(e){ toast(String(e?.message||e),"error"); }
}

async function rollAdv(adv, char){
  try{
    const mental=num(char.mental,0);
    if(!isMaster() && advantagesDisabled(mental)){
      toast("Vantagens desativadas (mental <= -11).", "error");
      return;
    }
    const a=(adv.attrUsed||"QI").toUpperCase();
    const base=num(char.attrs?.[a],1);
    const dt=Math.max(0, num(adv.dt, 9));
    const penalty=mentalPenalty(mental);
    const testDie=rollDice("normal").dice[0];
    const testTotal=testDie+base+penalty;
    const success=testTotal>=dt;

    const dmgDie=rollDice("normal").dice[0];
    const dmg = dmgDie + base + num(adv.mod,0) + penalty;

    const rollObj={ userUid:me.uid, expression:`TEST 1d12+${base}${penalty?penalty:""} vs ${dt}; DMG 1d12+${base}+${num(adv.mod,0)}`, mode:"normal",
      dice:[testDie,dmgDie], picked:testDie, total:testTotal,
      context:{ roomId, charId:char.charId, kind:"adv", advId:adv.id, name:adv.name, type:adv.type, attrUsed:a, dt, success, dmg, mental, penalty }, visibility:"public", timestamp:Date.now() };
    await dbPush(`rooms/${roomId}/rolls`, rollObj);
    await addLog("roll", `Vantagem ${adv.name}: ${success?"SUCESSO":"FALHA"} (${testTotal} vs ${dt})`, rollObj);
    toast(`Vantagem ${adv.name}: ${success?"SUCESSO":"FALHA"} | dano ${dmg}`, success?"ok":"error");
  }catch(e){ toast(String(e?.message||e),"error"); }
}

function renderSheet(){
  const p=myPlayer();
  const char=getMyChar();
  if(!p){ panelRoot.innerHTML=`<div class="card pad">Sem player.</div>`; return; }
  if(!char){
    panelRoot.innerHTML=`<div class="card pad"><h3>Ficha</h3><p>Criando ficha/token...</p></div>`;
    ensureCharAndToken();
    return;
  }
  const d=derive(char);
  const pen=mentalPenalty(num(char.mental,0));
  const advOff = advantagesDisabled(num(char.mental,0));

  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>${isMaster()?"Fichas":"Ficha"}</h3>
          <label class="label">Nome</label>
          <input id="cName" value="${esc(char.name||"")}" />
          <label class="label" style="margin-top:10px">Bio</label>
          <textarea id="cBio" rows="4" style="width:100%">${esc(char.bio||"")}</textarea>
          <div class="actions" style="margin-top:10px">
            <button id="btnSaveChar">Salvar</button>
            <button class="secondary" id="btnImport">Import JSON</button>
            <button class="secondary" id="btnExport">Export JSON</button>
          </div>
        </div>

        <div class="card pad" style="margin-top:12px">
          <h3>Atributos (clique para rolar)</h3>
          <div class="grid2">
            ${["FOR","DEX","VIG","QI"].map(k=>`
              <div class="item">
                <div class="actions" style="justify-content:space-between">
                  <strong>${k}</strong>
                  <button class="secondary" data-roll="${k}">Rolar</button>
                </div>
                <input data-attr="${k}" type="number" value="${d[k]}" />
                <small>Mod base: +${d[k]} ${pen?`| mental ${pen}`:""}</small>
              </div>
            `).join("")}
          </div>
          <div class="item" style="margin-top:10px">
            <div class="kv"><div><small>Intenções (derivado)</small></div><div><strong>${d.intentions}</strong></div></div>
            <div class="kv"><div><small>Movimento</small></div><div><strong>${d.movement} m/inten.</strong></div></div>
            <div class="kv"><div><small>Esquiva</small></div><div><strong>${d.dodge}</strong></div></div>
            <div class="kv"><div><small>HP Total</small></div><div><strong>${d.hp}</strong></div></div>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card pad">
          <h3>Mental</h3>
          <div class="actions">
            <input id="cMental" type="number" value="${num(char.mental,0)}" />
            <button class="secondary" id="btnMental">Aplicar</button>
          </div>
          <small>
            Regra: mental <= -8 aplica <strong>-5</strong> em todos modificadores. 
            mental <= -11 <strong>desativa vantagens</strong> para o player.
          </small>
        </div>

        <div class="card pad" style="margin-top:12px">
          <h3>Vantagens</h3>
          <div id="advList" class="list" style="margin-top:8px"></div>
          <div class="actions" style="margin-top:10px">
            <button class="secondary" id="btnAddAdv">Adicionar vantagem</button>
          </div>
        </div>

        <div class="card pad" style="margin-top:12px">
          <h3>Inventário</h3>
          <div class="kv"><div><small>Limite</small></div><div><strong>${d.invLimit} kg</strong></div></div>
          <div id="invList" class="list" style="margin-top:8px"></div>
          <div class="actions" style="margin-top:10px">
            <button class="secondary" id="btnAddItem">Adicionar item</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#btnSaveChar").onclick = async ()=>{
    try{
      const patch = {
        name: clampLen($("#cName").value, 80),
        bio: clampLen($("#cBio").value, 1200),
        mental: num($("#cMental").value, 0),
        updatedAt: Date.now()
      };
      const attrs={};
      $$("input[data-attr]").forEach(inp=> attrs[inp.dataset.attr] = Math.max(-2, Math.min(6, num(inp.value,1))));
      patch.attrs = attrs;
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, patch);
      await addLog("character","Ficha atualizada",{charId:char.charId});
      toast("Ficha salva.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };

  $$("button[data-roll]").forEach(btn=> btn.onclick = ()=> rollAttr(btn.dataset.roll, char));

  $("#btnImport").onclick = ()=>{
    openModal("Import JSON", `
      <p>Cole JSON da ficha. O ownerUid será forçado para o dono atual.</p>
      <textarea id="imp" rows="12" style="width:100%"></textarea>
      <div class="actions" style="margin-top:10px">
        <button id="doImp">Importar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `);
    $("#cancel").onclick=closeModal;
    $("#doImp").onclick=async ()=>{
      try{
        const obj=JSON.parse($("#imp").value);
        obj.ownerUid = char.ownerUid || me.uid;
        obj.charId = char.charId;
        obj.updatedAt = Date.now();
        if(!Array.isArray(obj.inventory)) obj.inventory=[];
        if(!Array.isArray(obj.advantages)) obj.advantages=[];
        await dbSet(`rooms/${roomId}/characters/${char.charId}`, obj);
        await addLog("character","Ficha importada",{charId:char.charId});
        toast("Importado.", "ok");
        closeModal();
      }catch(e){ toast("JSON inválido: "+String(e?.message||e),"error"); }
    };
  };

  $("#btnExport").onclick = ()=> openModal("Export JSON", `<textarea rows="14" style="width:100%">${esc(JSON.stringify(char,null,2))}</textarea>`);

  $("#btnMental").onclick = async ()=>{
    try{
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { mental: num($("#cMental").value,0), updatedAt: Date.now() });
      await addLog("character","Mental alterado",{charId:char.charId, mental:num($("#cMental").value,0)});
      toast("Mental atualizado.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };

  renderAdvantages(char);
  renderInventory(char, d);
}

function renderAdvantages(char){
  const root=$("#advList");
  const advs=char.advantages||[];
  root.innerHTML="";
  if(!advs.length) root.innerHTML = `<div class="item"><small>Nenhuma vantagem.</small></div>`;
  const disabled = (!isMaster() && advantagesDisabled(num(char.mental,0)));

  advs.forEach((a, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <button class="secondary" data-rolladv="${idx}" ${disabled?"disabled":""}>Rolar</button>
        <strong style="flex:1;margin-left:8px">${esc(a.name||"Vantagem")}</strong>
        <button class="danger" data-del="${idx}">Del</button>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><small>tipo</small><input data-type="${idx}" value="${esc(a.type||"")}" /></div>
        <div><small>atributo</small><input data-attr="${idx}" value="${esc((a.attrUsed||"QI").toUpperCase())}" /></div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><small>mod dano</small><input type="number" data-mod="${idx}" value="${num(a.mod,0)}" /></div>
        <div><small>DT</small><input type="number" data-dt="${idx}" value="${num(a.dt,9)}" /></div>
      </div>
      <small>${esc(a.desc||"")}</small>
    `;
    div.querySelector("[data-del]").onclick = async ()=>{
      advs.splice(idx,1);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: advs, updatedAt: Date.now() });
      await addLog("character","Vantagem removida",{charId:char.charId});
    };
    div.querySelector("[data-rolladv]")?.addEventListener("click", ()=> rollAdv(advs[idx], char));
    root.appendChild(div);
  });

  $("#btnAddAdv").onclick = async ()=>{
    const advs2 = char.advantages || [];
    advs2.push({ id:`adv_${Date.now()}`, name:"Vantagem", desc:"", type:"ativa", mod:0, attrUsed:"QI", dt:9 });
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: advs2, updatedAt: Date.now() });
    await addLog("character","Vantagem adicionada",{charId:char.charId});
  };

  // inline sync
  const sync = async ()=> dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { advantages: advs, updatedAt: Date.now() });
  root.querySelectorAll("input[data-type]").forEach(inp=> inp.onchange=async ()=>{ advs[+inp.dataset.type].type=clampLen(inp.value,40); await sync(); });
  root.querySelectorAll("input[data-attr]").forEach(inp=> inp.onchange=async ()=>{ advs[+inp.dataset.attr].attrUsed=clampLen(inp.value.toUpperCase(),6); await sync(); });
  root.querySelectorAll("input[data-mod]").forEach(inp=> inp.onchange=async ()=>{ advs[+inp.dataset.mod].mod=num(inp.value,0); await sync(); });
  root.querySelectorAll("input[data-dt]").forEach(inp=> inp.onchange=async ()=>{ advs[+inp.dataset.dt].dt=num(inp.value,9); await sync(); });
}

function invWeight(items){ return (items||[]).reduce((s,it)=> s + num(it.kg,0), 0); }

function renderInventory(char, derived){
  const root=$("#invList");
  const items=char.inventory||[];
  root.innerHTML="";
  const total=invWeight(items);
  const warn=total>derived.invLimit;
  const head=document.createElement("div");
  head.className="item";
  head.innerHTML = `<div class="kv"><div><small>Peso atual</small></div><div><strong>${total.toFixed(2)} kg</strong> ${warn?'<span class="badge" style="background:var(--danger)">EXCEDEU</span>':""}</div></div>`;
  root.appendChild(head);

  if(!items.length){
    const d=document.createElement("div");
    d.className="item";
    d.innerHTML=`<small>Nenhum item.</small>`;
    root.appendChild(d);
  }

  items.forEach((it, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <button class="secondary" data-rollitem="${idx}">Rolar</button>
        <strong style="flex:1;margin-left:8px">${esc(it.name||"Item")}</strong>
        <button class="danger" data-del="${idx}">Del</button>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><small>nome</small><input data-name="${idx}" value="${esc(it.name||"Item")}" /></div>
        <div><small>peso (kg)</small><input type="number" step="0.1" data-kg="${idx}" value="${num(it.kg,0)}" /></div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><small>atributo</small><input data-attru="${idx}" value="${esc((it.attrUsed||"FOR").toUpperCase())}" /></div>
        <div><small>mod dano</small><input type="number" data-mod="${idx}" value="${num(it.mod,0)}" /></div>
      </div>
      <div style="margin-top:8px">
        <small>descrição</small>
        <textarea data-desc="${idx}" rows="2" style="width:100%">${esc(it.desc||"")}</textarea>
      </div>
    `;
    div.querySelector("[data-rollitem]").onclick = ()=> rollItem(items[idx], char);
    div.querySelector("[data-del]").onclick = async ()=>{
      items.splice(idx,1);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
      await addLog("character","Item removido",{charId:char.charId});
    };
    root.appendChild(div);
  });

  $("#btnAddItem").onclick = async ()=>{
    items.push({ id:`it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" });
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
    await addLog("character","Item adicionado",{charId:char.charId});
  };

  const sync = async ()=> dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
  root.querySelectorAll("input[data-name]").forEach(inp=> inp.onchange=async ()=>{ items[+inp.dataset.name].name=clampLen(inp.value,60); await sync(); });
  root.querySelectorAll("input[data-kg]").forEach(inp=> inp.onchange=async ()=>{ items[+inp.dataset.kg].kg=num(inp.value,0); await sync(); });
  root.querySelectorAll("input[data-attru]").forEach(inp=> inp.onchange=async ()=>{ items[+inp.dataset.attru].attrUsed=clampLen(inp.value.toUpperCase(),6); await sync(); });
  root.querySelectorAll("input[data-mod]").forEach(inp=> inp.onchange=async ()=>{ items[+inp.dataset.mod].mod=num(inp.value,0); await sync(); });
  root.querySelectorAll("textarea[data-desc]").forEach(inp=> inp.onchange=async ()=>{ items[+inp.dataset.desc].desc=clampLen(inp.value,600); await sync(); });
}

/* ---------------- Tokens (master assigns player) ---------------- */
function renderTokens(){
  if(!isMaster()){
    panelRoot.innerHTML = `<div class="card pad"><h3>Tokens</h3><small>Somente o mestre.</small></div>`;
    return;
  }
  const list = Object.entries(tokens||{}).map(([id,t])=>{
    const owner = t.ownerUid ? uidShort(t.ownerUid) : "—";
    return `<div class="item">
      <div class="actions" style="justify-content:space-between">
        <strong>${esc(t.name||id)}</strong>
        <small class="mono">${id}</small>
      </div>
      <small>owner: ${owner} | x:${num(t.x,0).toFixed(0)} y:${num(t.y,0).toFixed(0)}</small>
      <div class="actions" style="margin-top:8px">
        <button class="secondary" data-edit="${id}">Editar</button>
        <button class="danger" data-del="${id}">Deletar</button>
      </div>
    </div>`;
  }).join("") || `<div class="item"><small>Nenhum token.</small></div>`;

  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>Tokens (mestre)</h3>
          <div class="actions"><button id="btnNewToken">Criar Token</button></div>
          <div class="list" id="tokList" style="margin-top:10px">${list}</div>
        </div>
      </div>
      <div class="col">
        <div class="card pad">
          <h3>PostImage</h3>
          <label class="label" style="margin-top:8px">PostImage API Key</label>
          <input id="postKey" placeholder="ex: 123abc..." />
          <small>Salvo local (localStorage).</small>
        </div>
      </div>
    </div>
  `;

  const postKeyIn = $("#postKey");
  postKeyIn.value = localStorage.getItem("sur4_postimage_key") || "";
  postKeyIn.onchange = ()=> localStorage.setItem("sur4_postimage_key", postKeyIn.value.trim());

  panelRoot.querySelectorAll("[data-edit]").forEach(btn=> btn.onclick = ()=> openTokenEditor(btn.dataset.edit));
  panelRoot.querySelectorAll("[data-del]").forEach(btn=> btn.onclick = async ()=>{
    try{
      const id=btn.dataset.del;
      await dbSet(`rooms/${roomId}/tokens/${id}`, null);
      await addLog("token","Token deletado",{tokenId:id});
    }catch(e){ toast(String(e?.message||e),"error"); }
  });

  $("#btnNewToken").onclick = async ()=>{
    try{
      const tokenId = await dbPush(`rooms/${roomId}/tokens`, {
        tokenId:null, name:"Criatura", x:200, y:200, r:24, layer:"tokens",
        ownerUid:null, linkedCharId:null, spriteUrl:"", locked:false, updatedAt: Date.now()
      });
      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
      await addLog("token","Token criado (mestre)",{tokenId});
      toast("Token criado.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

async function openTokenEditor(tokenId){
  const t=tokens?.[tokenId];
  if(!t) return;
  const apiKey = localStorage.getItem("sur4_postimage_key") || "";
  const playerOptions = `<option value="">(sem dono)</option>` + Object.values(players||{}).map(p=>`<option value="${p.uid}">${p.uid}</option>`).join("");

  openModal("Editar Token", `
    <div class="item">
      <div class="grid2">
        <div><label class="label">Nome</label><input id="tName" value="${esc(t.name||"")}" /></div>
        <div><label class="label">Raio</label><input id="tR" type="number" value="${num(t.r,24)}" /></div>
      </div>

      <label class="label" style="margin-top:10px">Player do token</label>
      <select id="tOwner">${playerOptions}</select>
      <small>Ao marcar um player, esse token + ficha ficam vinculados até desmarcar.</small>

      <div class="grid2" style="margin-top:10px">
        <div><label class="label">X</label><input id="tX" type="number" value="${num(t.x,0)}" /></div>
        <div><label class="label">Y</label><input id="tY" type="number" value="${num(t.y,0)}" /></div>
      </div>

      <label class="label" style="margin-top:10px">Sprite URL</label>
      <input id="tSprite" value="${esc(t.spriteUrl||"")}" />

      <div class="actions" style="margin-top:10px">
        <input id="tFile" type="file" accept="image/*" />
        <button class="secondary" id="btnUp">Upload PostImage</button>
      </div>

      <div class="actions" style="margin-top:10px">
        <button id="btnSaveTok">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    </div>
  `);

  $("#tOwner").value = t.ownerUid || "";
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

  $("#btnSaveTok").onclick = async ()=>{
    try{
      const newOwner = $("#tOwner").value || null;
      const patch={
        name: clampLen($("#tName").value, 60),
        r: Math.max(8, Math.min(80, num($("#tR").value,24))),
        x: num($("#tX").value,0),
        y: num($("#tY").value,0),
        spriteUrl: clampLen($("#tSprite").value.trim(), 420),
        ownerUid: newOwner,
        updatedAt: Date.now()
      };

      // ensure linked character when assigning to a player
      let linkedCharId = t.linkedCharId || null;
      if(newOwner && !linkedCharId){
        const charId = await dbPush(`rooms/${roomId}/characters`, { ...defaultChar(newOwner), charId:null, ownerUid:newOwner });
        await dbUpdate(`rooms/${roomId}/characters/${charId}`, { charId });
        linkedCharId = charId;
        await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { linkedCharId });
      }

      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { ...patch, linkedCharId });

      // Update player links (tokenId/characterId)
      const prevOwner = t.ownerUid || null;
      if(prevOwner && prevOwner!==newOwner){
        const prevP = players?.[prevOwner];
        const clearPatch = {};
        if(prevP?.tokenId===tokenId) clearPatch.tokenId = null;
        if(prevP?.characterId===linkedCharId) clearPatch.characterId = null;
        if(Object.keys(clearPatch).length) await dbUpdate(`rooms/${roomId}/players/${prevOwner}`, clearPatch);
      }
      if(newOwner){
        await dbUpdate(`rooms/${roomId}/players/${newOwner}`, { tokenId: tokenId, characterId: linkedCharId });
      }

      await addLog("token","Token atualizado",{tokenId, patch:{...patch, linkedCharId}});
      toast("Token salvo.", "ok");
      closeModal();
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

/* ---------------- Rolls ---------------- */
function renderRolls(){
  if(!isMaster()){
    panelRoot.innerHTML = `<div class="card pad"><h3>Rolagens</h3><small>Somente o mestre.</small></div>`;
    return;
  }
  const rows = Object.values(rolls||{}).sort((a,b)=> (b.timestamp||0)-(a.timestamp||0)).slice(0,120);
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3>Rolagens</h3>
      <div class="list" id="rollList" style="margin-top:10px"></div>
    </div>
  `;
  const root=$("#rollList");
  root.innerHTML = rows.length? "" : `<div class="item"><small>Nenhuma rolagem.</small></div>`;
  rows.forEach(r=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="actions" style="justify-content:space-between">
      <strong>${esc(r.context?.kind || "roll")}</strong>
      <small class="mono">${uidShort(r.userUid||"")}</small>
    </div>
    <div><strong>${r.total}</strong> <small>${esc(r.expression||"")}</small></div>`;
    root.appendChild(div);
  });
}

/* ---------------- Logs ---------------- */
function renderLogs(){
  if(!isMaster()){
    panelRoot.innerHTML = `<div class="card pad"><h3>Logs</h3><small>Somente o mestre.</small></div>`;
    return;
  }
  const rows = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,160);
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3>Logs</h3>
      <div class="list" id="logList" style="margin-top:10px"></div>
    </div>
  `;
  const root=$("#logList");
  root.innerHTML = rows.length? "" : `<div class="item"><small>Sem logs.</small></div>`;
  rows.forEach(l=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="actions" style="justify-content:space-between">
      <strong>${esc(l.type||"log")}</strong>
      <small class="mono">${new Date(l.ts||0).toLocaleString()}</small>
    </div>
    <div>${esc(l.message||"")}</div>
    <small class="mono">${uidShort(l.actorUid||"")}</small>`;
    root.appendChild(div);
  });
}

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
    await ensureCharAndToken();
    selectTab("map");
  }catch(e){
    toast(String(e?.message||e),"error");
  }
});
