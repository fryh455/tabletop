import { on, SET, UP, DEL, PUSH, GET, P } from "./db.js";
import { calcDT, calcHP, calcIntentions, calcMove, calcInvLimit, roll, parseMod } from "./sur4.js";

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=(s)=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

const state={roomId:null,uid:null,role:null,masterUid:null,
data:{meta:null,players:{},tokens:{},groups:{},sheets:{},rolls:{},map:{locked:false,fog:{enabled:false,opacity:0.65,imageBase64:null,rects:{}}},marks:{}},
ui:{tab:"sheet",selectedTokenId:null,zoom:1,panX:0,panY:0,dragging:null,panning:false,fogDrag:null,selectedForGroup:new Set()}
};

function showLogin(on=true){ $("#login").classList.toggle("hidden", !on); }
function setSession(){ $("#session").textContent=[state.uid?`uid=${state.uid}`:"",state.role?`role=${state.role}`:"",state.roomId?`room=${state.roomId}`:""].filter(Boolean).join(" • "); }
function cleanName(s){ const v=String(s||"").trim().slice(0,24); if(!v) return ""; if(!/^[a-zA-Z0-9_ -]{1,24}$/.test(v)) return ""; return v.replace(/\s+/g," ").trim(); }
function parseHashRoom(){ const m=(location.hash||"").match(/^#\/room\/([a-zA-Z0-9_-]{3,64})/); return m?m[1]:null; }
function roomLink(){ return `${location.origin}${location.pathname}#/room/${state.roomId}`; }

$("#joinRoom").addEventListener("click", ()=>$("#joinArea").classList.remove("hidden"));
$("#cancelJoin").addEventListener("click", ()=>$("#joinArea").classList.add("hidden"));

$("#createRoom").addEventListener("click", async ()=>{
  const name=cleanName($("#name").value); if(!name) return alert("Nome obrigatório.");
  state.uid=name;
  const roomId=`room_${Math.random().toString(36).slice(2,10)}`;
  state.roomId=roomId; location.hash=`#/room/${roomId}`;
  const room={meta:{masterUid:state.uid,createdAt:Date.now()},players:{},tokens:{},groups:{},sheets:{},rolls:{},marks:{},map:{locked:false,fog:{enabled:false,opacity:0.65,imageBase64:null,rects:{}}}};
  await SET(P.room(roomId), room);
  await SET(P.player(roomId, state.uid), {uid:state.uid,name:state.uid,joinedAt:Date.now()});
  showLogin(false); mountRoom();
});

$("#confirmJoin").addEventListener("click", async ()=>{
  const name=cleanName($("#name").value); if(!name) return alert("Nome obrigatório.");
  const roomId=($("#roomCode").value||"").trim(); if(!roomId) return alert("Código obrigatório.");
  state.uid=name; state.roomId=roomId; location.hash=`#/room/${roomId}`;
  const meta=await GET(P.meta(roomId)); if(!meta) return alert("Sala não existe.");
  await SET(P.player(roomId, state.uid), {uid:state.uid,name:state.uid,joinedAt:Date.now()});
  showLogin(false); mountRoom();
});

$("#btn-exit").addEventListener("click", ()=>{ location.hash=""; location.reload(); });
$("#btn-room").addEventListener("click", ()=>prompt("Link/código:", roomLink()));

window.addEventListener("hashchange", ()=>{ const rid=parseHashRoom(); if(rid && rid!==state.roomId){ state.roomId=rid; showLogin(true); } });

let unsubs=[];
function mountRoom(){
  unsubs.forEach(u=>{try{u&&u();}catch{}}); unsubs=[];
  if(!state.roomId) return;
  unsubs.push(on(P.meta(state.roomId), v=>{ state.data.meta=v||null; state.masterUid=v?.masterUid||null; state.role=(state.uid===state.masterUid)?"master":"player"; bindRoleUI(); renderAll(); }));
  unsubs.push(on(P.players(state.roomId), v=>{ state.data.players=v||{}; renderAll(); }));
  unsubs.push(on(P.tokens(state.roomId), v=>{ state.data.tokens=v||{}; renderAll(); }));
  unsubs.push(on(P.groups(state.roomId), v=>{ state.data.groups=v||{}; renderAll(); }));
  unsubs.push(on(P.sheets(state.roomId), v=>{ state.data.sheets=v||{}; renderAll(); }));
  unsubs.push(on(P.rolls(state.roomId), v=>{ state.data.rolls=v||{}; renderAll(); }));
  unsubs.push(on(P.map(state.roomId), v=>{ state.data.map=v||state.data.map; setFogImg(); renderAll(); }));
  $("#btn-room").classList.remove("hidden");
  setSession();
}

function bindRoleUI(){
  const isM=state.role==="master";
  $("#btn-lock").classList.toggle("hidden", !isM);
  $("#btn-fog").classList.toggle("hidden", !isM);
  $("#btn-fog-img").classList.toggle("hidden", !isM);
  $("#btn-add-token").classList.toggle("hidden", !isM);
  $("#btn-clone-token").classList.toggle("hidden", !isM);
  $("#btn-group").classList.toggle("hidden", !isM);
  $("#btn-ungroup").classList.toggle("hidden", !isM);
  $("#btn-hide-token").classList.toggle("hidden", !isM);
  $("#btn-del-token").classList.toggle("hidden", !isM);
  $(`[data-tab="master"]`).classList.toggle("hidden", !isM);
  if(!isM && state.ui.tab==="master") setTab("sheet");
  setSession();
}

$$(".tab").forEach(t=>t.addEventListener("click", ()=>setTab(t.dataset.tab)));
function setTab(name){
  state.ui.tab=name;
  $$(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.tab===name?"true":"false"));
  $("#panel-sheet").classList.toggle("hidden", name!=="sheet");
  $("#panel-master").classList.toggle("hidden", name!=="master");
  $("#panel-rolls").classList.toggle("hidden", name!=="rolls");
  renderAll();
}

$("#btn-lock").addEventListener("click", async ()=>{ if(state.role!=="master") return; await UP(P.map(state.roomId), {locked: !state.data.map?.locked}); });
$("#btn-fog").addEventListener("click", async ()=>{ if(state.role!=="master") return; await UP(P.fog(state.roomId), {enabled: !state.data.map?.fog?.enabled}); });
$("#btn-fog-img").addEventListener("click", ()=>{ if(state.role!=="master") return; $("#fogModal").classList.remove("hidden"); });
$("#fogClose").addEventListener("click", ()=>$("#fogModal").classList.add("hidden"));
$("#fogClear").addEventListener("click", async ()=>{ if(state.role!=="master") return; await UP(P.fog(state.roomId), {imageBase64:null}); });
$("#fogApply").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const op=clamp(Number($("#fogOpacity").value)||0.65,0,1);
  const file=$("#fogFile").files?.[0];
  const patch={opacity:op};
  if(file) patch.imageBase64=await fileToDataURL(file);
  await UP(P.fog(state.roomId), patch);
  $("#fogModal").classList.add("hidden");
});
$("#btn-zoom-plus").addEventListener("click", ()=>state.ui.zoom*=1.15);
$("#btn-zoom-minus").addEventListener("click", ()=>state.ui.zoom/=1.15);

const canvas=$("#c"), ctx=canvas.getContext("2d");
let fogImg=null;
const imgCache=new Map();
function setFogImg(){ const b=state.data.map?.fog?.imageBase64; if(!b){fogImg=null;return;} const im=new Image(); im.src=b; fogImg=im; }
function resize(){ const r=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1; const w=Math.max(800,Math.floor(r.width*dpr)), h=Math.max(500,Math.floor(r.height*dpr)); if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;} }
function worldToScreen(wx,wy){ const z=state.ui.zoom; return {x:(wx+state.ui.panX)*z, y:(wy+state.ui.panY)*z}; }
function screenToWorld(sx,sy){ const z=state.ui.zoom; return {x:(sx/z)-state.ui.panX, y:(sy/z)-state.ui.panY}; }
function getTokenImg(t){ if(!t.imageBase64) return null; if(imgCache.has(t.id)) return imgCache.get(t.id); const im=new Image(); im.src=t.imageBase64; imgCache.set(t.id,im); return im; }

function draw(){
  resize(); ctx.clearRect(0,0,canvas.width,canvas.height);
  const z=state.ui.zoom, step=100*z;
  if(step>18){
    ctx.save(); ctx.strokeStyle="rgba(255,255,255,0.05)"; ctx.lineWidth=1;
    for(let x=0;x<canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    ctx.restore();
  }
  const tokens=Object.values(state.data.tokens||{});
  for(const t of tokens){
    if(t.hidden && state.role!=="master") continue;
    const s=worldToScreen(t.x,t.y), size=(t.size||64)*z;
    if(state.ui.selectedTokenId===t.id){ ctx.save(); ctx.strokeStyle="rgba(91,214,255,.85)"; ctx.lineWidth=Math.max(2,2*z); ctx.strokeRect(s.x-size/2-4,s.y-size/2-4,size+8,size+8); ctx.restore(); }
    const im=getTokenImg(t);
    if(im?.complete) ctx.drawImage(im, s.x-size/2, s.y-size/2, size, size);
    else { ctx.save(); ctx.fillStyle="rgba(255,255,255,.08)"; ctx.fillRect(s.x-size/2,s.y-size/2,size,size); ctx.restore(); }
    const label=(t.ownerUid||"master");
    ctx.save(); ctx.font=`${Math.max(10,12*z)}px ui-sans-serif`; const tw=ctx.measureText(label).width;
    ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(s.x-tw/2-6, s.y+size/2+4, tw+12, 18*z);
    ctx.fillStyle="rgba(255,255,255,.85)"; ctx.fillText(label, s.x-tw/2, s.y+size/2+18*z);
    ctx.restore();
  }
  const fog=state.data.map?.fog;
  if(fog?.enabled){
    if(fogImg?.complete){ ctx.save(); ctx.globalAlpha=clamp(fog.opacity??0.65,0,1); const s0=worldToScreen(0,0); ctx.drawImage(fogImg,s0.x,s0.y,fogImg.width*z,fogImg.height*z); ctx.restore(); }
    ctx.save(); ctx.fillStyle="rgba(0,0,0,.86)";
    const rects=fog.rects||{};
    for(const rid of Object.keys(rects)){ const r=rects[rid]; const s=worldToScreen(r.x,r.y); ctx.fillRect(s.x,s.y,r.w*z,r.h*z); }
    if(state.ui.fogDrag && state.role==="master"){ const d=state.ui.fogDrag; const x=Math.min(d.x0,d.x1), y=Math.min(d.y0,d.y1), w=Math.abs(d.x1-d.x0), h=Math.abs(d.y1-d.y0); const s=worldToScreen(x,y); ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(s.x,s.y,w*z,h*z); ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=Math.max(2,2*z); ctx.strokeRect(s.x,s.y,w*z,h*z); }
    ctx.restore();
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

canvas.addEventListener("wheel",(e)=>{ e.preventDefault(); const factor=(Math.sign(e.deltaY)>0)?0.9:1.1;
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr;
  const before=screenToWorld(sx,sy); state.ui.zoom*=factor; const after=screenToWorld(sx,sy);
  state.ui.panX += (after.x-before.x); state.ui.panY += (after.y-before.y);
},{passive:false});

function mouseWorld(e){ const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1; const sx=(e.clientX-rect.left)*dpr, sy=(e.clientY-rect.top)*dpr; return screenToWorld(sx,sy); }
function hitToken(wx,wy){
  const tokens=Object.values(state.data.tokens||{});
  for(let i=tokens.length-1;i>=0;i--){
    const t=tokens[i]; if(t.hidden && state.role!=="master") continue;
    const half=(t.size||64)/2; if(wx>=t.x-half && wx<=t.x+half && wy>=t.y-half && wy<=t.y+half) return t;
  } return null;
}
function canMoveToken(t){
  if(state.role==="master") return true;
  if(state.data.map?.locked) return false;
  return t?.ownerUid===state.uid;
}
function tokenGroupId(t){ return t.groupId||null; }
function startDrag(t,pos){
  const gid=tokenGroupId(t);
  if(gid){
    const g=state.data.groups?.[gid]; if(!g) return null;
    if(state.role!=="master"){
      if(state.data.map?.locked) return null;
      let ok=false; for(const tid of Object.keys(g.tokenIds||{})){ if(state.data.tokens?.[tid]?.ownerUid===state.uid){ ok=true; break; } }
      if(!ok) return null;
    }
    const offsets={}; for(const tid of Object.keys(g.tokenIds||{})){ const tt=state.data.tokens?.[tid]; if(tt) offsets[tid]={dx:pos.x-tt.x, dy:pos.y-tt.y}; }
    return {type:"group",groupId:gid,offsets};
  }
  if(!canMoveToken(t)) return null;
  return {type:"token",tokenId:t.id,dx:pos.x-t.x,dy:pos.y-t.y};
}

let writeTimer=null;
function scheduleWrite(){ if(writeTimer) return; writeTimer=setTimeout(async()=>{ writeTimer=null; await flushDrag(); },60); }
function moveDrag(pos){
  const d=state.ui.dragging; if(!d) return;
  if(d.type==="token"){
    const t=state.data.tokens?.[d.tokenId]; if(!t) return;
    t.x=pos.x-d.dx; t.y=pos.y-d.dy;
  }else{
    for(const [tid,off] of Object.entries(d.offsets)){
      const t=state.data.tokens?.[tid]; if(!t) continue;
      t.x=pos.x-off.dx; t.y=pos.y-off.dy;
    }
  }
  scheduleWrite();
}
async function flushDrag(){
  const d=state.ui.dragging; if(!d) return;
  if(d.type==="token"){
    const t=state.data.tokens?.[d.tokenId]; if(!t) return;
    await UP(P.token(state.roomId,t.id), {x:t.x,y:t.y,updatedAt:Date.now()});
  }else{
    const g=state.data.groups?.[d.groupId]; if(!g) return;
    for(const tid of Object.keys(g.tokenIds||{})){
      const t=state.data.tokens?.[tid]; if(!t) continue;
      await UP(P.token(state.roomId,tid), {x:t.x,y:t.y,updatedAt:Date.now()});
    }
  }
}

canvas.addEventListener("mousedown",(e)=>{
  if(!state.roomId) return;
  const pos=mouseWorld(e);
  if(state.role==="master" && state.data.map?.fog?.enabled && e.altKey){
    state.ui.fogDrag={x0:pos.x,y0:pos.y,x1:pos.x,y1:pos.y}; return;
  }
  if(e.shiftKey){ state.ui.panning=true; canvas.style.cursor="grabbing"; return; }
  const hit=hitToken(pos.x,pos.y);
  if(hit){
    state.ui.selectedTokenId=hit.id;
    if(state.role==="master" && e.ctrlKey){
      if(state.ui.selectedForGroup.has(hit.id)) state.ui.selectedForGroup.delete(hit.id);
      else state.ui.selectedForGroup.add(hit.id);
      renderAll(); return;
    }else state.ui.selectedForGroup.clear();
    const d=startDrag(hit,pos); if(d) state.ui.dragging=d;
  }else{
    state.ui.selectedTokenId=null; state.ui.selectedForGroup.clear(); renderAll();
  }
});

window.addEventListener("mousemove",(e)=>{
  if(!state.roomId) return;
  const pos=mouseWorld(e);
  if(state.ui.fogDrag && state.role==="master"){ state.ui.fogDrag.x1=pos.x; state.ui.fogDrag.y1=pos.y; return; }
  if(state.ui.panning){ const dpr=window.devicePixelRatio||1; state.ui.panX += (e.movementX*dpr)/state.ui.zoom; state.ui.panY += (e.movementY*dpr)/state.ui.zoom; return; }
  if(state.ui.dragging) moveDrag(pos);
});

window.addEventListener("mouseup", async ()=>{
  canvas.style.cursor="default"; state.ui.panning=false;
  if(state.ui.fogDrag && state.role==="master"){
    const d=state.ui.fogDrag; state.ui.fogDrag=null;
    const x=Math.min(d.x0,d.x1), y=Math.min(d.y0,d.y1), w=Math.abs(d.x1-d.x0), h=Math.abs(d.y1-d.y0);
    if(w>10 && h>10){ const rid=`fog_${Math.random().toString(36).slice(2,10)}`; await SET(`${P.fogRects(state.roomId)}/${rid}`, {x,y,w,h}); }
  }
  if(state.ui.dragging){ await flushDrag(); state.ui.dragging=null; }
});

$("#btn-add-token").addEventListener("click", ()=>{
  if(state.role!=="master") return;
  $("#tokenModal").classList.remove("hidden");
  $("#tokOwner").value=""; $("#tokSheet").value=""; $("#tokSize").value="64"; $("#tokFile").value="";
});
$("#tokCancel").addEventListener("click", ()=>$("#tokenModal").classList.add("hidden"));
$("#tokCreate").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const file=$("#tokFile").files?.[0]; if(!file) return alert("Imagem obrigatória.");
  const owner=cleanName($("#tokOwner").value)||null;
  const sheetId=($("#tokSheet").value||"").trim()||null;
  const size=Math.max(1,Number($("#tokSize").value)||64);
  const b64=await fileToDataURL(file);
  const id=`tok_${Math.random().toString(36).slice(2,10)}`;
  await SET(P.token(state.roomId,id), {id,ownerUid:owner,sheetId,x:220+Math.random()*220,y:200+Math.random()*220,size,imageBase64:b64,hidden:false,groupId:null,updatedAt:Date.now()});
  $("#tokenModal").classList.add("hidden");
  state.ui.selectedTokenId=id; renderAll();
});
$("#btn-clone-token").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const t=state.data.tokens?.[state.ui.selectedTokenId]; if(!t) return alert("Selecione um token.");
  const id=`tok_${Math.random().toString(36).slice(2,10)}`;
  await SET(P.token(state.roomId,id), {...t,id,x:t.x+40,y:t.y+40,updatedAt:Date.now()});
  state.ui.selectedTokenId=id;
});
$("#btn-hide-token").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const t=state.data.tokens?.[state.ui.selectedTokenId]; if(!t) return alert("Selecione um token.");
  await UP(P.token(state.roomId,t.id), {hidden:!t.hidden,updatedAt:Date.now()});
});
$("#btn-del-token").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const t=state.data.tokens?.[state.ui.selectedTokenId]; if(!t) return alert("Selecione um token.");
  if(!confirm("Apagar token?")) return;
  await DEL(P.token(state.roomId,t.id)); state.ui.selectedTokenId=null; renderAll();
});
$("#btn-group").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  if(state.ui.selectedForGroup.size<2) return alert("Ctrl+clique para selecionar 2+ tokens.");
  const gid=`grp_${Math.random().toString(36).slice(2,10)}`; const tokenIds={};
  for(const tid of state.ui.selectedForGroup) tokenIds[tid]=true;
  await SET(P.group(state.roomId,gid), {id:gid,tokenIds,createdAt:Date.now()});
  for(const tid of state.ui.selectedForGroup) await UP(P.token(state.roomId,tid), {groupId:gid,updatedAt:Date.now()});
  state.ui.selectedForGroup.clear(); renderAll();
});
$("#btn-ungroup").addEventListener("click", async ()=>{
  if(state.role!=="master") return;
  const t=state.data.tokens?.[state.ui.selectedTokenId]; if(!t?.groupId) return alert("Selecione token de um grupo.");
  const gid=t.groupId; const g=state.data.groups?.[gid];
  if(g) for(const tid of Object.keys(g.tokenIds||{})) await UP(P.token(state.roomId,tid), {groupId:null,updatedAt:Date.now()});
  await DEL(P.group(state.roomId,gid));
});

let lastRoll=null;
function getMySheet(){
  if(state.role==="player"){
    return Object.values(state.data.sheets||{}).find(s=>s.ownerUid===state.uid) || null;
  }
  const tok=state.data.tokens?.[state.ui.selectedTokenId];
  return tok?.sheetId ? state.data.sheets?.[tok.sheetId]||null : null;
}
function getMyMental(){
  const s=Object.values(state.data.sheets||{}).find(x=>x.ownerUid===state.uid);
  return Number(s?.mental??0)||0;
}
function askMode(){
  const v=(prompt("Modo: normal / adv / dis","normal")||"normal").trim().toLowerCase();
  return (v==="adv"||v==="dis"||v==="normal")?v:"normal";
}
function doRoll({label,mode,baseAttr=0,extraMods=[]}){
  const r=roll(mode);
  let addSum=Number(baseAttr)||0, mul=1;
  const used=[{label:"attr/base",add:addSum,mul:1}];
  for(const m of extraMods){
    if(!m) continue;
    if(Number.isFinite(m.add)&&m.add!==0){ addSum+=m.add; used.push({label:m.label,add:m.add,mul:1}); }
    if(Number.isFinite(m.mul)&&m.mul!==1){ mul*=m.mul; used.push({label:m.label,add:0,mul:m.mul}); }
  }
  const mental=getMyMental();
  if(mental>=4){ addSum+=5; used.push({label:"MENTAL +4/5",add:5,mul:1}); }
  else if(mental<=-8 && mental>=-11){ addSum+=-5; used.push({label:"MENTAL <= -8",add:-5,mul:1}); }
  else if(mental<=-12){ addSum+=-5; used.push({label:"MENTAL -12",add:-5,mul:1}); }
  const total=Math.trunc((r.base+addSum)*mul);
  const payload={ts:Date.now(),uid:state.uid,role:state.role,label,mode,rolls:r.rolls,base:r.base,add:addSum,mul,total,used};
  lastRoll=payload;
  PUSH(P.rolls(state.roomId), payload).catch(()=>{});
  renderAll();
}

function renderLastRoll(){
  if(!lastRoll) return `<div class="muted">Nenhuma.</div>`;
  return `<div class="card">
    <div class="row"><strong>${esc(lastRoll.label)}</strong><span class="muted small">${new Date(lastRoll.ts).toLocaleString()}</span></div>
    <div class="muted small">rolls: ${esc((lastRoll.rolls||[]).join(", "))} • base ${esc(lastRoll.base)}</div>
    <div class="row"><span class="muted small">add</span><span class="pill">${esc(lastRoll.add)}</span></div>
    <div class="row"><span class="muted small">mul</span><span class="pill">${esc(lastRoll.mul)}</span></div>
    <div class="row"><strong>Total</strong><span class="pill">${esc(lastRoll.total)}</span></div>
    <hr/><div class="muted small">Modificadores:</div>
    <div class="list">${(lastRoll.used||[]).map(u=>`<div class="row"><span class="muted small">${esc(u.label)}</span><span class="pill">${u.add?("add "+u.add):("mul "+u.mul)}</span></div>`).join("")}</div>
  </div>`;
}

function renderSheetPanel(){
  const s=getMySheet();
  if(state.role==="player" && !s){
    $("#panel-sheet").innerHTML=`<div class="card"><div class="row"><strong>Ficha</strong></div><div class="muted">Nenhuma ficha atribuída ao seu uid (${esc(state.uid||"-")}). Peça ao mestre para criar.</div></div>`;
    return;
  }
  if(state.role==="master"){
    const tok=state.data.tokens?.[state.ui.selectedTokenId];
    if(!tok?.sheetId){ $("#panel-sheet").innerHTML=`<div class="card"><div class="row"><strong>Ficha</strong></div><div class="muted">Selecione um token com sheetId para ver a ficha.</div></div>`; return; }
    if(!s){ $("#panel-sheet").innerHTML=`<div class="card"><div class="row"><strong>Ficha</strong></div><div class="muted">Sheet não encontrado.</div></div>`; return; }
  }
  const attrs=s.attrs||{QI:1,FOR:1,DEX:1,VIG:1};
  const dt=calcDT({VIG:attrs.VIG,FOR:attrs.FOR});
  const hp=calcHP(dt);
  const it=calcIntentions({VIG:attrs.VIG,DEX:attrs.DEX});
  const mv=calcMove({DEX:attrs.DEX});
  const invLimit=calcInvLimit({FOR:attrs.FOR,VIG:attrs.VIG});
  const usedKg=Number(s.inventory?.usedKg??0)||0;
  const mental=Number(s.mental??0)||0;
  const canRoll=(state.role==="player" && s.ownerUid===state.uid);

  const items=Object.values(s.inventory?.items||{});
  const advs=Object.values(s.inventory?.advantages||{});

  $("#panel-sheet").innerHTML=`<div class="card">
    <div class="row"><strong>Ficha</strong><span class="pill">${esc(s.name||s.id)}</span></div>
    <div class="row"><span class="muted small">Owner</span><span class="pill">${esc(s.ownerUid||"-")}</span></div>
    <div class="grid2">
      <div class="kv"><div class="muted small">Idade</div><div>${esc(s.idade??0)}</div></div>
      <div class="kv"><div class="muted small">Peso</div><div>${esc(s.peso??0)} kg</div></div>
    </div>
    <div class="kv"><div class="muted small">Altura</div><div>${esc(s.altura??0)} cm</div></div>
    <hr/>
    <div class="row"><strong>Atributos</strong><span class="muted small">${canRoll?"clique para rolar":"somente leitura"}</span></div>
    <div class="list">
      ${["QI","FOR","DEX","VIG"].map(k=>`<div class="card ${canRoll?"click":""}" data-roll-attr="${k}" style="background:rgba(255,255,255,.02)"><div class="row"><strong>${k}</strong><span class="pill">${esc(attrs[k]??0)}</span></div></div>`).join("")}
    </div>
    <hr/>
    <div class="row"><strong>Derivados</strong></div>
    <div class="list">
      <div class="card ${canRoll?"click":""}" data-roll-dt="head"><div class="row"><span>DT cabeça</span><span class="pill">${dt.head}</span></div></div>
      <div class="card ${canRoll?"click":""}" data-roll-dt="torso"><div class="row"><span>DT torso</span><span class="pill">${dt.torso}</span></div></div>
      <div class="card ${canRoll?"click":""}" data-roll-dt="arm"><div class="row"><span>DT braço</span><span class="pill">${dt.arm}</span></div></div>
      <div class="card ${canRoll?"click":""}" data-roll-dt="leg"><div class="row"><span>DT perna</span><span class="pill">${dt.leg}</span></div></div>
      <div class="card"><div class="row"><span>HP TOTAL</span><span class="pill">${hp}</span></div></div>
      <div class="card"><div class="row"><span>Intenções</span><span class="pill">${it}</span></div></div>
      <div class="card"><div class="row"><span>Movimento</span><span class="pill">${mv} m/int</span></div></div>
      <div class="card"><div class="row"><span>MENTAL</span><span class="pill">${mental}</span></div></div>
      <div class="card"><div class="row"><span>Limite inventário</span><span class="pill">${invLimit} kg</span></div></div>
      <div class="card"><div class="row"><span>Usado</span><span class="pill">${usedKg} kg</span></div></div>
    </div>

    <hr/>
    <div class="row"><strong>Itens</strong><span class="muted small">${items.length}</span></div>
    <div class="list">
      ${items.length?items.map(it=>`<div class="card ${canRoll?"click":""}" data-item-id="${esc(it.id)}" style="background:rgba(255,255,255,.02)">
        <div class="row"><strong>${esc(it.name)}</strong><span class="pill">${esc(it.mod||"-")}</span></div>
        <div class="muted small">${esc(it.desc||"-")}</div>
        <div class="row"><span class="muted small">attr</span><span class="pill">${esc(it.attr||"-")}</span></div>
      </div>`).join(""):`<div class="muted">Sem itens.</div>`}
    </div>

    <div class="row" style="margin-top:10px;"><strong>Vantagens</strong><span class="muted small">${advs.length}</span></div>
    <div class="list">
      ${advs.length?advs.map(a=>`<div class="card ${canRoll?"click":""}" data-adv-id="${esc(a.id)}" style="background:rgba(255,255,255,.02)">
        <div class="row"><strong>${esc(a.name)}</strong><span class="pill">${esc(a.mod||"-")}</span></div>
        <div class="muted small">${esc(a.desc||"-")}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span class="pill">DT ${esc(a.dt??"-")}</span><span class="pill">attr ${esc(a.attr||"-")}</span><span class="pill">notas ${esc(a.notes||"-")}</span>
        </div>
      </div>`).join(""):`<div class="muted">Sem vantagens.</div>`}
    </div>

    <hr/><div class="row"><strong>Última rolagem</strong></div>
    ${renderLastRoll()}
  </div>`;

  if(canRoll){
    $$("[data-roll-attr]", $("#panel-sheet")).forEach(el=>el.addEventListener("click", ()=>{
      const k=el.getAttribute("data-roll-attr"); const mode=askMode();
      doRoll({label:`Attr ${k}`,mode,baseAttr:Number(attrs[k]||0),extraMods:[]});
    }));
    $$("[data-roll-dt]", $("#panel-sheet")).forEach(el=>el.addEventListener("click", ()=>{
      const part=el.getAttribute("data-roll-dt"); const mode=askMode();
      doRoll({label:`DT ${part} (vs ${dt[part]||0})`,mode,baseAttr:0,extraMods:[]});
    }));
    $$("[data-item-id]", $("#panel-sheet")).forEach(el=>el.addEventListener("click", ()=>{
      const id=el.getAttribute("data-item-id"); const it=s.inventory?.items?.[id]; if(!it) return;
      const mode=askMode(); const pm=parseMod(it.mod); const extra=[];
      if(pm) extra.push({label:`Item ${it.name} ${pm.raw}`,add:pm.add,mul:pm.mul});
      const ak=(it.attr||"").toUpperCase(); const base=Number(attrs[ak]||0);
      doRoll({label:`Item ${it.name} (${ak||"sem"})`,mode,baseAttr:base,extraMods:extra});
    }));
    $$("[data-adv-id]", $("#panel-sheet")).forEach(el=>el.addEventListener("click", ()=>{
      const id=el.getAttribute("data-adv-id"); const a=s.inventory?.advantages?.[id]; if(!a) return;
      const mode=askMode(); const pm=parseMod(a.mod); const extra=[];
      if(pm) extra.push({label:`Vantagem ${a.name} ${pm.raw}`,add:pm.add,mul:pm.mul});
      const ak=(a.attr||"").toUpperCase(); const base=Number(attrs[ak]||0);
      doRoll({label:`Vantagem ${a.name} (${ak||"sem"})`,mode,baseAttr:base,extraMods:extra});
    }));
  }
}

function renderRolls(){
  const all=Object.entries(state.data.rolls||{}).map(([id,r])=>({id,...r})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const visible=(state.role==="master")?all:all.filter(r=>r.uid===state.uid);
  $("#panel-rolls").innerHTML=`<div class="card"><div class="row"><strong>Rolls</strong><span class="pill">${visible.length}</span></div>
    <div class="list">${visible.slice(0,80).map(r=>`<div class="card" style="background:rgba(255,255,255,.02)">
      <div class="row"><strong>${esc(r.label||"-")}</strong><span class="muted small">${new Date(r.ts||0).toLocaleString()}</span></div>
      <div class="muted small">${esc(r.uid)} • ${esc(r.mode)} • rolls: ${esc((r.rolls||[]).join(", "))}</div>
      <div class="row"><span class="muted small">total</span><span class="pill">${esc(r.total)}</span></div>
    </div>`).join("") || `<div class="muted">Sem rolls.</div>`}</div></div>`;
}

async function createSheet(ownerUid){
  const id=`sheet_${Math.random().toString(36).slice(2,10)}`;
  const sheet={id,ownerUid:ownerUid||null,name:ownerUid?`${ownerUid}`:"sem dono",idade:0,peso:0,altura:0,attrs:{QI:1,FOR:1,DEX:1,VIG:1},mental:0,inventory:{usedKg:0,items:{},advantages:{}},notes:"",updatedAt:Date.now()};
  await SET(P.sheet(state.roomId,id), sheet);
}
function renderMaster(){
  if(state.role!=="master"){ $("#panel-master").innerHTML=`<div class="muted">Somente mestre.</div>`; return; }
  const players=Object.keys(state.data.players||{});
  const sheets=Object.values(state.data.sheets||{}).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const tok=state.data.tokens?.[state.ui.selectedTokenId]||null;
  $("#panel-master").innerHTML=`<div class="card">
    <div class="row"><strong>Sala</strong><span class="pill">${esc(state.roomId||"-")}</span></div>
    <div class="row"><span class="muted small">Players</span><span class="pill">${players.length}</span></div>
    <div class="row"><span class="muted small">Tokens</span><span class="pill">${Object.keys(state.data.tokens||{}).length}</span></div>
    <div class="row"><span class="muted small">Fichas</span><span class="pill">${sheets.length}</span></div>
  </div>

  <div class="card">
    <div class="row"><strong>Players</strong></div>
    <div class="list">${players.map(uid=>`<div class="row"><span>${esc(uid)}</span><button data-mkSheet="${esc(uid)}">Criar ficha</button></div>`).join("") || `<div class="muted">Nenhum</div>`}</div>
  </div>

  <div class="card">
    <div class="row"><strong>Fichas (somente nomes)</strong></div>
    <div class="list">${sheets.map(s=>`<div class="row"><span class="pill">${esc(s.name||s.id)}</span><span class="muted small">${esc(s.id)}</span></div>`).join("") || `<div class="muted">Nenhuma</div>`}</div>
    <div class="muted small">Detalhes só na aba Ficha quando token selecionado tiver sheetId.</div>
  </div>

  <div class="card">
    <div class="row"><strong>Token selecionado</strong><span class="muted small">${esc(tok?.id||"-")}</span></div>
    <div class="kv"><div class="muted small">OwnerUid</div><input id="mTokOwner" value="${esc(tok?.ownerUid||"")}" ${tok?"":"disabled"} /></div>
    <div class="kv"><div class="muted small">SheetId</div><input id="mTokSheet" value="${esc(tok?.sheetId||"")}" ${tok?"":"disabled"} /></div>
    <div class="kv"><div class="muted small">Tamanho (px)</div><input id="mTokSize" type="number" min="1" step="1" value="${esc(String(tok?.size||64))}" ${tok?"":"disabled"} /></div>
    <div class="grid2"><button id="mTokApply" ${tok?"":"disabled"}>Aplicar</button><button id="mTokPickSheet" ${tok?"":"disabled"}>Escolher ficha…</button></div>
    <div id="sheetPicker" class="hidden" style="margin-top:10px;">
      <div class="muted small">Clique para setar token.sheetId:</div>
      <div class="list">${sheets.map(s=>`<div class="row"><span>${esc(s.name||s.id)}</span><button data-setSheet="${esc(s.id)}">Usar</button></div>`).join("") || `<div class="muted">Nenhuma</div>`}</div>
    </div>
  </div>`;

  $$("#panel-master [data-mkSheet]").forEach(b=>b.addEventListener("click", async ()=>createSheet(b.getAttribute("data-mkSheet"))));
  $("#mTokApply")?.addEventListener("click", async ()=>{
    if(!tok) return;
    const ownerUid=cleanName($("#mTokOwner").value)||null;
    const sheetId=($("#mTokSheet").value||"").trim()||null;
    const size=Math.max(1,Number($("#mTokSize").value)||64);
    await UP(P.token(state.roomId,tok.id), {ownerUid,sheetId,size,updatedAt:Date.now()});
  });
  $("#mTokPickSheet")?.addEventListener("click", ()=>$("#sheetPicker").classList.toggle("hidden"));
  $$("#panel-master [data-setSheet]").forEach(b=>b.addEventListener("click", async ()=>{
    if(!tok) return;
    await UP(P.token(state.roomId,tok.id), {sheetId:b.getAttribute("data-setSheet"),updatedAt:Date.now()});
    $("#sheetPicker").classList.add("hidden");
  }));
}

function renderAll(){
  $("#btn-lock").textContent = (state.data.map?.locked) ? "Mapa: BLOQ" : "Mapa: LIVRE";
  $("#btn-fog").textContent = (state.data.map?.fog?.enabled) ? "Fog: ON" : "Fog: OFF";
  if(state.role==="master"){
    $("#btn-clone-token").disabled=!state.ui.selectedTokenId;
    $("#btn-hide-token").disabled=!state.ui.selectedTokenId;
    $("#btn-del-token").disabled=!state.ui.selectedTokenId;
    $("#btn-ungroup").disabled=!(state.data.tokens?.[state.ui.selectedTokenId]?.groupId);
    $("#btn-group").disabled=state.ui.selectedForGroup.size<2;
  }
  renderSheetPanel();
  if(state.ui.tab==="rolls") renderRolls();
  if(state.ui.tab==="master") renderMaster();
  setSession();
}

function fileToDataURL(file){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onerror=()=>rej(new Error("fail")); fr.onload=()=>res(String(fr.result)); fr.readAsDataURL(file); });
}

(function init(){
  const rid=parseHashRoom(); if(rid){ state.roomId=rid; showLogin(true); }
  setTab("sheet");
  renderAll();
})();
