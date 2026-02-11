import { $, $$, bindModal, toast, goHome, esc, clampLen, num, uidShort, openModal, closeModal } from "./app.js";
import { initFirebase, onAuth, logout, dbGet, dbSet, dbUpdate, dbPush, dbOn } from "./firebase.js";
import { intentions as calcIntentions, movement, dodge, dtHead, dtTorso, dtArm, dtLeg, hpTotal, inventoryLimit, classifyKg, roll as rollDice, resolveDamage } from "./sur4.js";
import { uploadToPostImage } from "./postimage.js";

initFirebase();
bindModal();

const roomId = new URL(location.href).searchParams.get("room");
if(!roomId){ toast("Sem roomId na URL.", "error"); }

$("#btnHome").addEventListener("click", ()=>goHome());
$("#btnLogout").addEventListener("click", async ()=>{ await logout(); goHome(); });

const panelRoot = $("#panelRoot");
const tabs = $$("#tabs .pill");
tabs.forEach(p=>p.addEventListener("click", ()=>selectTab(p.dataset.tab)));

let me=null;
let role="player";
let room=null;
let players={}, tokens={}, characters={}, intentions={}, rolls={}, logs={};
let unsub=[];

function clearSubs(){ unsub.forEach(fn=>fn&&fn()); unsub=[]; }

function isMaster(){ return role==="master"; }

function myPlayer(){
  return me ? players?.[me.uid] : null;
}

function canEditToken(t){
  if(isMaster()) return true;
  return t?.ownerUid && me && t.ownerUid===me.uid;
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
  // ensure player node exists
  await dbSet(`rooms/${roomId}/players/${me.uid}`, {
    uid: me.uid, role, connected:true, joinedAt: room.players?.[me.uid]?.joinedAt || Date.now(), lastSeenAt: Date.now(),
    characterId: room.players?.[me.uid]?.characterId || null,
    tokenId: room.players?.[me.uid]?.tokenId || null
  });
  await dbUpdate(`users/${me.uid}/rooms`, { [roomId]: true });
}

function subAll(){
  clearSubs();
  unsub.push(dbOn(`rooms/${roomId}`, (v)=>{ room=v||room; if(v) setHeader(); updateFogButtons(); }));
  unsub.push(dbOn(`rooms/${roomId}/players`, (v)=>{ players=v||{}; renderCurrent(); }));
  unsub.push(dbOn(`rooms/${roomId}/tokens`, (v)=>{ tokens=v||{}; if(currentTab==="map") mapRender(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; if(currentTab==="sheet") renderSheet(); if(currentTab==="tokens") renderTokens(); }));
  unsub.push(dbOn(`rooms/${roomId}/intentions`, (v)=>{ intentions=v||{}; if(currentTab==="intentions") renderIntentions(); if(currentTab==="combat") renderCombat(); }));
  unsub.push(dbOn(`rooms/${roomId}/rolls`, (v)=>{ rolls=v||{}; if(currentTab==="rolls") renderRolls(); }));
  unsub.push(dbOn(`logs/${roomId}`, (v)=>{ logs=v||{}; if(currentTab==="logs") renderLogs(); }));
}

async function addLog(type, message, payload={}){
  const entry = { type, actorUid: me.uid, message: clampLen(message, 220), payload, ts: Date.now() };
  await dbPush(`logs/${roomId}`, entry);
}

function selectTab(id){
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.tab===id));
  currentTab=id;
  renderCurrent();
}

let currentTab="map";

function renderCurrent(){
  if(!me || !room) return;
  if(currentTab==="map") renderMap();
  else if(currentTab==="sheet") renderSheet();
  else if(currentTab==="tokens") renderTokens();
  else if(currentTab==="intentions") renderIntentions();
  else if(currentTab==="rolls") renderRolls();
  else if(currentTab==="combat") renderCombat();
  else if(currentTab==="logs") renderLogs();
}

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

// ---------- MAP ----------
let canvas, ctx, dpr=1;
let zoom=1, gridSize=48;
let dragging=null;

function renderMap(){
  panelRoot.innerHTML = `
    <div class="panelGrid">
      <div class="canvasWrap">
        <canvas id="mapCanvas"></canvas>
      </div>
      <div class="card pad">
        <h3>Mapa</h3>
        <div class="kv"><div><small>Grid</small></div><div><input id="gridIn" type="number" value="${room?.settings?.map?.gridSize||48}" /></div></div>
        <div class="kv" style="margin-top:8px"><div><small>Zoom</small></div><div><input id="zoomIn" type="number" step="0.1" value="${room?.settings?.map?.zoom||1}" /></div></div>
        <div class="actions" style="margin-top:10px">
          <button class="secondary" id="btnApplyMap">Aplicar</button>
          <button class="secondary" id="btnCenter">Centralizar</button>
        </div>
        <hr/>
        <div class="item">
          <div><small>Seleção</small></div>
          <div id="selToken" class="mono">—</div>
          <div class="actions" style="margin-top:8px">
            <button class="secondary" id="btnMyToken">Ir no meu token</button>
          </div>
        </div>
        <small>Arraste tokens no canvas. Player só move o próprio token.</small>
      </div>
    </div>
  `;
  canvas = $("#mapCanvas");
  ctx = canvas.getContext("2d");
  dpr = window.devicePixelRatio || 1;
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive:true });
  zoom = num(room?.settings?.map?.zoom, 1);
  gridSize = num(room?.settings?.map?.gridSize, 48);

  $("#btnApplyMap").addEventListener("click", async ()=>{
    try{
      const gs = Math.max(16, Math.min(200, num($("#gridIn").value, 48)));
      const z = Math.max(0.4, Math.min(3.0, num($("#zoomIn").value, 1)));
      if(isMaster()){
        await dbUpdate(`rooms/${roomId}/settings/map`, { gridSize: gs, zoom: z });
        await addLog("map", "Config mapa atualizada", { gridSize:gs, zoom:z });
      }else{
        // local only
        gridSize=gs; zoom=z; mapRender();
      }
    }catch(e){ toast(String(e?.message||e),"error"); }
  });
  $("#btnCenter").addEventListener("click", ()=>{ view.x=0; view.y=0; mapRender(); });
  $("#btnMyToken").addEventListener("click", ()=>{
    const pid = myPlayer();
    const t = pid?.tokenId ? tokens?.[pid.tokenId] : null;
    if(t){ view.x = (t.x||0) - canvas.width/(2*dpr)/zoom; view.y=(t.y||0)-canvas.height/(2*dpr)/zoom; mapRender(); }
  });

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

const view = { x:0, y:0 }; // world top-left

function worldToScreen(wx, wy){
  return { x: (wx - view.x)*zoom*dpr, y:(wy - view.y)*zoom*dpr };
}
function screenToWorld(sx, sy){
  return { x: sx/(zoom*dpr) + view.x, y: sy/(zoom*dpr) + view.y };
}

function drawGrid(){
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.globalAlpha=0.25;
  ctx.lineWidth=1;
  ctx.strokeStyle="#22304a";
  const gs = gridSize*zoom*dpr;
  const ox = -(view.x*zoom*dpr) % gs;
  const oy = -(view.y*zoom*dpr) % gs;
  for(let x=ox; x<w; x+=gs){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
  }
  for(let y=oy; y<h; y+=gs){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.restore();
}

function drawTokens(){
  for(const [id,t] of Object.entries(tokens||{})){
    const wx=num(t.x,0), wy=num(t.y,0);
    const r = num(t.r,24);
    const s = worldToScreen(wx, wy);
    const rr = r*zoom*dpr;
    // circle
    ctx.save();
    ctx.fillStyle = canEditToken(t) ? "rgba(74,163,255,.25)" : "rgba(255,255,255,.08)";
    ctx.strokeStyle = (selectedTokenId===id) ? "#4aa3ff" : "#9aa4b233";
    ctx.lineWidth = (selectedTokenId===id) ? 3 : 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    // label
    ctx.fillStyle="#e6edf3";
    ctx.font = `${Math.max(12, 12*zoom)}px system-ui`;
    ctx.fillText(t.name||id, s.x+rr+6, s.y+4);
    ctx.restore();
  }
}

function drawFog(){
  const fog = room?.settings?.fog;
  if(!fog?.enabled) return;
  // simple: cover all, then clear revealed rects
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.55)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.globalCompositeOperation="destination-out";
  const reveals = fog.reveals || {};
  for(const key of Object.keys(reveals)){
    const r = reveals[key];
    const p0 = worldToScreen(num(r.x,0), num(r.y,0));
    const w = num(r.w,100)*zoom*dpr;
    const h = num(r.h,100)*zoom*dpr;
    ctx.fillRect(p0.x, p0.y, w, h);
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

let selectedTokenId=null;

function hitToken(wx, wy){
  let best=null;
  for(const [id,t] of Object.entries(tokens||{})){
    const dx = wx-num(t.x,0);
    const dy = wy-num(t.y,0);
    const r = num(t.r,24);
    if(dx*dx+dy*dy <= r*r){
      best={id,t};
    }
  }
  return best;
}

function bindMapInteractions(){
  let down=false, start={sx:0,sy:0, wx:0, wy:0};
  canvas.addEventListener("mousedown", (e)=>{
    down=true;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    start={sx,sy, wx:w.x, wy:w.y};
    const hit=hitToken(w.x,w.y);
    if(hit){
      selectedTokenId=hit.id;
      $("#selToken").textContent = `${hit.t.name||hit.id} (${hit.id})`;
      if(canEditToken(hit.t)){
        dragging={ id:hit.id, ox:w.x-num(hit.t.x,0), oy:w.y-num(hit.t.y,0) };
      }
    }else{
      selectedTokenId=null;
      $("#selToken").textContent="—";
      dragging=null;
    }
    mapRender();
  });
  window.addEventListener("mousemove", async (e)=>{
    if(!down || !canvas) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    if(dragging){
      const nx = w.x - dragging.ox;
      const ny = w.y - dragging.oy;
      // optimistic render
      if(tokens[dragging.id]){
        tokens[dragging.id].x = nx;
        tokens[dragging.id].y = ny;
        mapRender();
      }
    }else{
      // pan
      view.x -= (sx-start.sx)/(zoom*dpr);
      view.y -= (sy-start.sy)/(zoom*dpr);
      start.sx=sx; start.sy=sy;
      mapRender();
    }
  }, { passive:true });
  window.addEventListener("mouseup", async ()=>{
    if(!down){ return; }
    down=false;
    if(dragging){
      const t=tokens[dragging.id];
      dragging=null;
      try{
        await dbUpdate(`rooms/${roomId}/tokens/${t.tokenId||selectedTokenId}`, { x: num(t.x,0), y:num(t.y,0), updatedAt: Date.now() });
        await addLog("token", "Token movido", { tokenId: selectedTokenId, x:t.x, y:t.y });
      }catch(e){ toast(String(e?.message||e),"error"); }
    }
  });

  // wheel zoom
  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    zoom = Math.max(0.4, Math.min(3.0, zoom + (delta>0?-0.1:0.1)));
    $("#zoomIn") && ($("#zoomIn").value = String(zoom.toFixed(2)));
    mapRender();
  }, { passive:false });

  // fog reveal (master, shift+drag draws reveal rect)
  let fogStart=null;
  canvas.addEventListener("mousedown", (e)=>{
    if(!isMaster()) return;
    if(!room?.settings?.fog?.enabled) return;
    if(!e.shiftKey) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    fogStart={x:w.x,y:w.y};
  });
  window.addEventListener("mouseup", async (e)=>{
    if(!fogStart || !isMaster()) return;
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
    const w=screenToWorld(sx,sy);
    const x=Math.min(fogStart.x, w.x), y=Math.min(fogStart.y, w.y);
    const ww=Math.abs(w.x-fogStart.x), hh=Math.abs(w.y-fogStart.y);
    fogStart=null;
    try{
      const key = `r_${Date.now()}`;
      await dbUpdate(`rooms/${roomId}/settings/fog/reveals`, { [key]: { x, y, w:ww, h:hh } });
      await addLog("map", "Reveal fog", { x,y,w:ww,h:hh });
    }catch(err){ toast(String(err?.message||err),"error"); }
  });
}

// ---------- SHEET ----------
function getMyChar(){
  const p=myPlayer();
  return p?.characterId ? characters?.[p.characterId] : null;
}

function defaultChar(){
  return {
    name:"Novo Personagem",
    bio:"",
    ownerUid: me.uid,
    attrs:{ FOR:1, DEX:1, VIG:1, QI:1 },
    mental:0,
    advantages:[],
    disadvantages:[],
    members:{
      head:{ dt:0, state:"Completo" },
      torso:{ dt:0, state:"Completo" },
      armL:{ dt:0, state:"Completo" },
      armR:{ dt:0, state:"Completo" },
      legL:{ dt:0, state:"Completo" },
      legR:{ dt:0, state:"Completo" }
    },
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
    const charId = await dbPush(`rooms/${roomId}/characters`, { ...defaultChar(), charId:null });
    await dbUpdate(`rooms/${roomId}/characters/${charId}`, { charId });
    await dbUpdate(`rooms/${roomId}/players/${me.uid}`, { characterId: charId });
    await addLog("character","Ficha criada", { charId });
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
    await addLog("token","Token criado", { tokenId });
  }
}

function renderSheet(){
  const p = myPlayer();
  const char = getMyChar();
  if(!p){ panelRoot.innerHTML = `<div class="card pad">Sem player.</div>`; return; }
  if(!char){
    panelRoot.innerHTML = `<div class="card pad"><h3>Ficha</h3><p>Criando ficha/token...</p></div>`;
    ensureCharAndToken();
    return;
  }
  const d = derive(char);
  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>Ficha</h3>
          <label class="label">Nome</label>
          <input id="cName" value="${esc(char.name||"")}" />
          <label class="label" style="margin-top:10px">Bio (curta)</label>
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
              </div>
            `).join("")}
          </div>
          <div class="item" style="margin-top:10px">
            <div class="kv"><div><small>Intenções</small></div><div><strong>${d.intentions}</strong></div></div>
            <div class="kv"><div><small>Movimento</small></div><div><strong>${d.movement} m/inten.</strong></div></div>
            <div class="kv"><div><small>Esquiva</small></div><div><strong>${d.dodge}</strong></div></div>
            <div class="kv"><div><small>HP Total</small></div><div><strong>${d.hp}</strong></div></div>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card pad">
          <h3>Membros (DT)</h3>
          ${Object.entries(d.dts).map(([k,v])=>`
            <div class="kv"><div><small>${k}</small></div><div><span class="mono">${v}</span></div></div>
          `).join("")}
          <hr/>
          <h3>Mental</h3>
          <div class="actions">
            <input id="cMental" type="number" value="${num(char.mental,0)}" />
            <button class="secondary" id="btnMental">Aplicar</button>
          </div>
          <small>Aplicação pós-combate (registrar agora, aplicar efeitos depois).</small>
        </div>

        <div class="card pad" style="margin-top:12px">
          <h3>Inventário</h3>
          <div class="kv"><div><small>Limite</small></div><div><strong>${d.invLimit} kg</strong></div></div>
          <div id="invList" class="list" style="margin-top:8px"></div>
          <div class="actions" style="margin-top:10px">
            <button class="secondary" id="btnAddItem">Adicionar item</button>
          </div>
          <small>Excedeu: teste FOR/VIG (DT = peso). Falha danifica membro usado.</small>
        </div>
      </div>
    </div>
  `;

  // hooks
  $("#btnSaveChar").addEventListener("click", async ()=>{
    try{
      const patch = {
        name: clampLen($("#cName").value, 80),
        bio: clampLen($("#cBio").value, 1200),
        mental: num($("#cMental").value, 0),
        updatedAt: Date.now()
      };
      // attrs
      const attrs = {};
      $$("input[data-attr]").forEach(inp=> attrs[inp.dataset.attr] = Math.max(-2, Math.min(6, num(inp.value,1))));
      patch.attrs = attrs;
      // only master or owner can write by rules; here owner
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, patch);
      await addLog("character","Ficha atualizada", { charId: char.charId });
      toast("Ficha salva.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  });

  $$("button[data-roll]").forEach(btn=>{
    btn.addEventListener("click", ()=> openRollForAttr(btn.dataset.roll, char));
  });

  $("#btnImport").addEventListener("click", ()=>{
    openModal("Import JSON", `
      <p>Cole JSON da ficha. O ownerUid será forçado para você.</p>
      <textarea id="imp" rows="12" style="width:100%"></textarea>
      <div class="actions" style="margin-top:10px">
        <button id="doImp">Importar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `);
    $("#cancel").onclick=closeModal;
    $("#doImp").onclick=async ()=>{
      try{
        const obj = JSON.parse($("#imp").value);
        obj.ownerUid = me.uid;
        obj.charId = char.charId;
        obj.updatedAt = Date.now();
        await dbSet(`rooms/${roomId}/characters/${char.charId}`, obj);
        await addLog("character","Ficha importada", { charId: char.charId });
        toast("Importado.", "ok");
        closeModal();
      }catch(e){ toast("JSON inválido: "+String(e?.message||e),"error"); }
    };
  });

  $("#btnExport").addEventListener("click", ()=>{
    openModal("Export JSON", `<textarea rows="14" style="width:100%">${esc(JSON.stringify(char,null,2))}</textarea>`);
  });

  $("#btnMental").addEventListener("click", async ()=>{
    try{
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { mental: num($("#cMental").value,0), updatedAt: Date.now() });
      await addLog("character","Mental alterado", { charId: char.charId, mental: num($("#cMental").value,0) });
      toast("Mental atualizado.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  });

  // inventory UI
  renderInv(char, d);
}

function invWeight(char){
  return (char.inventory||[]).reduce((s,it)=> s + num(it.kg,0), 0);
}

function renderInv(char, derived){
  const root = $("#invList");
  const items = char.inventory || [];
  root.innerHTML = "";
  const total = invWeight(char);
  const warn = total>derived.invLimit;
  const head = document.createElement("div");
  head.className="item";
  head.innerHTML = `<div class="kv"><div><small>Peso atual</small></div><div><strong>${total.toFixed(2)} kg</strong> ${warn?'<span class="badge" style="background:var(--danger)">EXCEDEU</span>':""}</div></div>`;
  root.appendChild(head);

  items.forEach((it, idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <strong>${esc(it.name||"Item")}</strong>
        <button class="danger" data-del="${idx}">Del</button>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><small>kg</small><input type="number" step="0.1" data-kg="${idx}" value="${num(it.kg,0)}" /></div>
        <div><small>tipo</small><input data-type="${idx}" value="${esc(it.type||classifyKg(num(it.kg,0)))}" /></div>
      </div>
      <small>${esc(it.notes||"")}</small>
    `;
    div.querySelector("[data-del]").onclick= async ()=>{
      items.splice(idx,1);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
      await addLog("character","Item removido", { charId: char.charId });
    };
    root.appendChild(div);
  });

  $("#btnAddItem").onclick = async ()=>{
    items.push({ id:`it_${Date.now()}`, name:"Item", kg:1, type:"leve", notes:"" });
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
    await addLog("character","Item adicionado", { charId: char.charId });
  };

  // inline updates
  root.querySelectorAll("input[data-kg]").forEach(inp=>{
    inp.addEventListener("change", async ()=>{
      const idx=Number(inp.dataset.kg);
      items[idx].kg = num(inp.value,0);
      items[idx].type = classifyKg(items[idx].kg);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
    });
  });
}

async function openRollForAttr(attr, char){
  const base = num(char.attrs?.[attr],1);
  openModal(`Rolar ${attr}`, `
    <div class="item">
      <div class="kv"><div><small>Base</small></div><div><strong>${base}</strong></div></div>
      <div class="kv"><div><small>Mod</small></div><div><input id="mod" type="number" value="0"></div></div>
      <div class="kv"><div><small>Modo</small></div><div>
        <select id="mode">
          <option value="normal">Normal (1d12)</option>
          <option value="advantage">Vantagem (2d12 pega maior)</option>
          <option value="disadvantage">Desvantagem (2d12 pega menor)</option>
        </select>
      </div></div>
      <div class="actions" style="margin-top:10px">
        <button id="doRoll">Rolar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
      <div id="out" class="item" style="margin-top:10px;display:none"></div>
    </div>
  `);
  $("#cancel").onclick=closeModal;
  $("#doRoll").onclick= async ()=>{
    try{
      const mod = num($("#mod").value,0);
      const mode = $("#mode").value;
      const r = rollDice(mode);
      const picked = (mode==="normal") ? r.dice[0] : r.picked;
      const total = picked + mod;
      const out = $("#out");
      out.style.display="";
      out.innerHTML = `<div><strong>${total}</strong> <small>(dice: ${r.dice.join(",")} | mod: ${mod})</small></div>`;
      const rollObj = {
        userUid: me.uid,
        expression: (mode==="normal"?"1d12":"2d12")+"+"+mod,
        mode,
        dice: r.dice,
        picked,
        total,
        context:{ roomId, charId: char.charId, attr },
        visibility:"public",
        timestamp: Date.now()
      };
      await dbPush(`rooms/${roomId}/rolls`, rollObj);
      await addLog("roll", `Rolagem ${attr}: ${total}`, rollObj);
      toast("Rolagem registrada.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

// ---------- TOKENS ----------
function renderTokens(){
  const list = Object.entries(tokens||{}).map(([id,t])=>{
    const can = canEditToken(t);
    const owner = t.ownerUid ? uidShort(t.ownerUid) : "—";
    return `<div class="item">
      <div class="actions" style="justify-content:space-between">
        <strong>${esc(t.name||id)}</strong>
        <small class="mono">${id}</small>
      </div>
      <small>owner: ${owner} | x:${num(t.x,0).toFixed(0)} y:${num(t.y,0).toFixed(0)}</small>
      <div class="actions" style="margin-top:8px">
        <button class="secondary" data-edit="${id}" ${!can?"disabled":""}>Editar</button>
        ${isMaster()?`<button class="danger" data-del="${id}">Deletar</button>`:""}
      </div>
    </div>`;
  }).join("") || `<div class="item"><small>Nenhum token.</small></div>`;

  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>Tokens</h3>
          ${isMaster()?`<div class="actions"><button id="btnNewToken">Criar Token (master)</button></div>`:""}
          <div class="list" id="tokList" style="margin-top:10px">${list}</div>
        </div>
      </div>
      <div class="col">
        <div class="card pad">
          <h3>PostImage</h3>
          <small>Para trocar sprite: informe sua API Key do PostImage (não é do Firebase).</small>
          <label class="label" style="margin-top:8px">PostImage API Key</label>
          <input id="postKey" placeholder="ex: 123abc..." />
          <small>Salvo apenas local (localStorage).</small>
        </div>
      </div>
    </div>
  `;

  const postKeyIn = $("#postKey");
  postKeyIn.value = localStorage.getItem("sur4_postimage_key") || "";
  postKeyIn.addEventListener("change", ()=> localStorage.setItem("sur4_postimage_key", postKeyIn.value.trim()));

  panelRoot.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> openTokenEditor(btn.dataset.edit));
  });
  panelRoot.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      try{
        const id=btn.dataset.del;
        await dbSet(`rooms/${roomId}/tokens/${id}`, null);
        await addLog("token","Token deletado", { tokenId:id });
      }catch(e){ toast(String(e?.message||e),"error"); }
    });
  });

  $("#btnNewToken")?.addEventListener("click", async ()=>{
    try{
      const tokenId = await dbPush(`rooms/${roomId}/tokens`, {
        tokenId:null, name:"NPC", x:200, y:200, r:24, layer:"tokens",
        ownerUid:null, linkedCharId:null, spriteUrl:"", locked:false, updatedAt: Date.now()
      });
      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
      await addLog("token","Token master criado", { tokenId });
      toast("Token criado.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  });
}

function openTokenEditor(tokenId){
  const t = tokens?.[tokenId];
  if(!t) return;
  if(!canEditToken(t)){ toast("Sem permissão.", "error"); return; }

  const apiKey = localStorage.getItem("sur4_postimage_key") || "";
  openModal("Editar Token", `
    <div class="item">
      <div class="grid2">
        <div><label class="label">Nome</label><input id="tName" value="${esc(t.name||"")}" /></div>
        <div><label class="label">Raio</label><input id="tR" type="number" value="${num(t.r,24)}" /></div>
      </div>
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
      <small>Player só edita próprio token. Master edita todos.</small>
    </div>
  `);
  $("#cancel").onclick=closeModal;
  $("#btnUp").onclick = async ()=>{
    try{
      const file = $("#tFile").files?.[0];
      if(!file) throw new Error("Escolha um arquivo.");
      const url = await uploadToPostImage(file, apiKey || localStorage.getItem("sur4_postimage_key"));
      $("#tSprite").value = url;
      // persist image meta
      await dbPush("images", { url, ownerUid: me.uid, source:"postimage", createdAt: Date.now(), meta:{ name:file.name, w:0, h:0 } });
      toast("Upload ok.", "ok");
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
  $("#btnSaveTok").onclick = async ()=>{
    try{
      const patch = {
        name: clampLen($("#tName").value, 60),
        r: Math.max(8, Math.min(80, num($("#tR").value,24))),
        x: num($("#tX").value,0),
        y: num($("#tY").value,0),
        spriteUrl: clampLen($("#tSprite").value.trim(), 420),
        updatedAt: Date.now()
      };
      await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, patch);
      await addLog("token","Token atualizado", { tokenId, patch });
      toast("Token salvo.", "ok");
      closeModal();
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

// ---------- INTENTIONS ----------
function renderIntentions(){
  const myChar = getMyChar();
  const d = myChar ? derive(myChar) : null;
  const round = num(room?.settings?.combatRound, 1);
  const my = Object.entries(intentions||{}).filter(([id,it])=> it?.uid===me.uid && it?.round===round);

  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>Intenções (Round ${round})</h3>
          <small>Você tem ${d?d.intentions:"?"} intenções. Distribua entre Ataque / Movimento / Esquiva / Outro.</small>
          <div class="actions" style="margin-top:10px">
            <button class="secondary" id="btnAddAtk">+ Ataque</button>
            <button class="secondary" id="btnAddMov">+ Movimento</button>
            <button class="secondary" id="btnAddDodge">+ Esquiva</button>
            <button class="secondary" id="btnAddOther">+ Outro</button>
          </div>
          <div class="list" id="myIntents" style="margin-top:10px"></div>
        </div>
      </div>

      <div class="col">
        <div class="card pad">
          <h3>Controle (master)</h3>
          <div class="actions">
            <button class="secondary" id="btnNextRound">Próximo round</button>
            <button class="secondary" id="btnClearRound">Limpar intenções</button>
          </div>
          <small>Somente master. Round atual fica em rooms/{roomId}/settings/combatRound</small>
        </div>
        <div class="card pad" style="margin-top:12px">
          <h3>Status</h3>
          <div class="item"><small>Total intenções no round:</small> <strong>${Object.values(intentions||{}).filter(it=>it?.round===round).length}</strong></div>
        </div>
      </div>
    </div>
  `;

  const listRoot=$("#myIntents");
  listRoot.innerHTML = my.length? "" : `<div class="item"><small>Nenhuma intenção ainda.</small></div>`;
  my.forEach(([id,it])=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="actions" style="justify-content:space-between">
        <strong>${it.type}</strong>
        <button class="danger" data-del="${id}">Del</button>
      </div>
      <small>${esc(it.payload?.note||"")}</small>
      <input data-note="${id}" placeholder="nota..." value="${esc(it.payload?.note||"")}" />
    `;
    div.querySelector("[data-del]").onclick = async ()=>{ await dbSet(`rooms/${roomId}/intentions/${id}`, null); await addLog("intentions","Intenção removida",{id}); };
    div.querySelector("input").onchange = async (e)=>{
      await dbUpdate(`rooms/${roomId}/intentions/${id}/payload`, { note: clampLen(e.target.value, 160) });
    };
    listRoot.appendChild(div);
  });

  const addIntent = async (type)=>{
    try{
      const max = d ? d.intentions : 99;
      if(my.length>=max) throw new Error("Sem intenções disponíveis.");
      const id = await dbPush(`rooms/${roomId}/intentions`, { intentId:null, round, uid: me.uid, type, payload:{note:""}, status:"planned", createdAt: Date.now() });
      await dbUpdate(`rooms/${roomId}/intentions/${id}`, { intentId:id });
      await addLog("intentions","Intenção adicionada",{id,type});
    }catch(e){ toast(String(e?.message||e),"error"); }
  };

  $("#btnAddAtk").onclick=()=>addIntent("attack");
  $("#btnAddMov").onclick=()=>addIntent("move");
  $("#btnAddDodge").onclick=()=>addIntent("dodge");
  $("#btnAddOther").onclick=()=>addIntent("other");

  $("#btnNextRound").disabled = !isMaster();
  $("#btnClearRound").disabled = !isMaster();

  $("#btnNextRound").onclick = async ()=>{
    if(!isMaster()) return;
    const next = round+1;
    await dbUpdate(`rooms/${roomId}/settings`, { combatRound: next });
    await addLog("combat", `Round ${next}`, {});
  };
  $("#btnClearRound").onclick = async ()=>{
    if(!isMaster()) return;
    // remove all intentions in this round (brute)
    const all = Object.entries(intentions||{}).filter(([id,it])=>it?.round===round).map(([id])=>id);
    const patch = {};
    for(const id of all) patch[id]=null;
    await dbUpdate(`rooms/${roomId}/intentions`, patch);
    await addLog("intentions","Round limpo",{round});
  };
}

// ---------- ROLLS ----------
function renderRolls(){
  const rows = Object.values(rolls||{}).sort((a,b)=> (b.timestamp||0)-(a.timestamp||0)).slice(0,100);
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3>Rolagens</h3>
      <div class="actions">
        <button class="secondary" id="btnManualRoll">Rolagem manual</button>
      </div>
      <div class="list" id="rollList" style="margin-top:10px"></div>
    </div>
  `;
  const root=$("#rollList");
  root.innerHTML = rows.length? "" : `<div class="item"><small>Nenhuma rolagem.</small></div>`;
  rows.forEach(r=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `<div class="actions" style="justify-content:space-between">
      <strong>${esc(r.context?.attr || "ROLL")}</strong>
      <small class="mono">${uidShort(r.userUid||"")}</small>
    </div>
    <div><strong>${r.total}</strong> <small>dice: ${r.dice?.join(",")} | ${esc(r.expression||"")}</small></div>`;
    root.appendChild(div);
  });

  $("#btnManualRoll").onclick = ()=>{
    openModal("Rolagem manual", `
      <div class="item">
        <small>Suporta: normal (1d12) / vantagem / desvantagem + modificador.</small>
        <div class="grid2" style="margin-top:10px">
          <div><small>Modo</small>
            <select id="mMode">
              <option value="normal">normal</option>
              <option value="advantage">advantage</option>
              <option value="disadvantage">disadvantage</option>
            </select>
          </div>
          <div><small>Mod</small><input id="mMod" type="number" value="0"></div>
        </div>
        <div class="actions" style="margin-top:10px">
          <button id="mGo">Rolar</button>
          <button class="secondary" id="mCancel">Cancelar</button>
        </div>
      </div>
    `);
    $("#mCancel").onclick=closeModal;
    $("#mGo").onclick= async ()=>{
      try{
        const mode=$("#mMode").value;
        const mod=num($("#mMod").value,0);
        const r=rollDice(mode);
        const picked=(mode==="normal")?r.dice[0]:r.picked;
        const total=picked+mod;
        await dbPush(`rooms/${roomId}/rolls`, { userUid:me.uid, expression:(mode==="normal"?"1d12":"2d12")+"+"+mod, mode, dice:r.dice, picked, total, context:{roomId}, visibility:"public", timestamp:Date.now() });
        await addLog("roll", `Rolagem manual: ${total}`, {});
        toast("Rolado.", "ok");
        closeModal();
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
  };
}

// ---------- COMBAT (minimal resolution helpers) ----------
function renderCombat(){
  // minimal: pick attacker token + target token + member dt and damage roll
  const tokOpts = Object.entries(tokens||{}).map(([id,t])=>`<option value="${id}">${esc(t.name||id)}</option>`).join("");
  panelRoot.innerHTML = `
    <div class="row">
      <div class="col">
        <div class="card pad">
          <h3>Combate (resolver dano)</h3>
          <small>Ferramenta simples pra aplicar as regras SUR4 em um ataque.</small>
          <div class="grid2" style="margin-top:10px">
            <div><small>Atacante (token)</small><select id="atkTok">${tokOpts}</select></div>
            <div><small>Alvo (token)</small><select id="defTok">${tokOpts}</select></div>
          </div>
          <div class="grid2" style="margin-top:10px">
            <div><small>Membro</small>
              <select id="member">
                <option value="head">cabeça</option>
                <option value="torso">torso</option>
                <option value="armL">braço E</option>
                <option value="armR">braço D</option>
                <option value="legL">perna E</option>
                <option value="legR">perna D</option>
              </select>
            </div>
            <div><small>Mod dano</small><input id="dMod" type="number" value="0"></div>
          </div>
          <div class="actions" style="margin-top:10px">
            <button id="btnResolve">Rolar dano (ST) e avaliar</button>
          </div>
          <div id="combatOut" class="item" style="margin-top:10px;display:none"></div>
        </div>
      </div>
      <div class="col">
        <div class="card pad">
          <h3>Notas</h3>
          <ul>
            <li>ST = d12 + modificadores</li>
            <li>ST &lt;= DT: dano normal</li>
            <li>ST &gt; DT: dano dobrado + Muito Danificado</li>
            <li>ST &gt;= 3×DT: Inutilizado</li>
            <li>Crítico natural 12: +50%</li>
          </ul>
          <small>Aplicação automática em DT/estado do membro ainda é manual (master decide).</small>
        </div>
      </div>
    </div>
  `;

  $("#btnResolve").onclick = async ()=>{
    try{
      const defId=$("#defTok").value;
      const def = tokens?.[defId];
      const char = def?.linkedCharId ? characters?.[def.linkedCharId] : null;
      const mem = $("#member").value;
      const mod = num($("#dMod").value,0);
      const r = rollDice("normal");
      const natural = r.dice[0];
      const st = natural + mod;
      // get DT from derived character if exists; else estimate 9
      let dt=9;
      if(char){
        const d=derive(char);
        dt = d.dts[mem] || 9;
      }
      const res = resolveDamage(st, dt, natural);
      const out=$("#combatOut");
      out.style.display="";
      out.innerHTML = `<div><strong>ST ${st}</strong> (d12=${natural} + mod=${mod}) vs <strong>DT ${dt}</strong></div>
        <div>Resultado: <strong>${res.outcome}</strong> | Dano final: <strong>${res.final}</strong> <small>${res.flags.join(",")}</small></div>`;
      await addLog("combat", "Resolução de dano", { defTokenId:defId, member:mem, st, dt, ...res });
    }catch(e){ toast(String(e?.message||e),"error"); }
  };
}

// ---------- LOGS ----------
function renderLogs(){
  const rows = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,150);
  panelRoot.innerHTML = `
    <div class="card pad">
      <h3>Logs</h3>
      <small>Audit trail da sala.</small>
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

// ---------- Auth gate ----------
onAuth(async (user)=>{
  if(!user){ toast("Faça login primeiro.", "error"); goHome(); return; }
  me = user;
  try{
    await ensureJoin();
    setHeader();
    subAll();
    await addLog("system","Conectado", { uid: me.uid });
    // ensure defaults for player
    await ensureCharAndToken();
    selectTab("map");
  }catch(e){
    toast(String(e?.message||e),"error");
  }
});
