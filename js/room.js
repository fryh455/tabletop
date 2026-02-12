/* SUR4 ROOM BUILD 61 */
/* SUR4 ROOM BUILD 61 */
const BUILD_ID = 63;
import { $, $$, bindModal, openModal, closeModal, toast, goHome, esc, clampLen, num, uidShort } from "./app.js";
import { initFirebase, onAuth, logout, dbGet, dbSet, dbUpdate, dbPush, dbOn } from "./firebase.js";
import { roll as rollDice } from "./sur4.js";
initFirebase();
bindModal();

const roomId = new URL(location.href).searchParams.get("room");
// --- Token clipboard / ghosts (GM-only helpers) ---
let tokenClipboard = null;       // { mode: "copy"|"cut", baseId, tokenData }
let lastPointerWorld = {x:0,y:0};

function cloneTokenData(t){
  return JSON.parse(JSON.stringify(t||{}));
}

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
  $("#me").textContent = me ? `${meNick || me.email}` : "";
  $("#role").textContent = role.toUpperCase();
}

async function ensureJoin(){
  const r = await dbGet(`rooms/${roomId}`);
  if(!r) throw new Error("Sala não existe.");
  room = r;

  // Load my profile (nickname)
  const prof = (await dbGet(`users/${me.uid}`)) || {};
  meNick = String(prof.nickname||"").trim();
  if(!meNick || meNick.length<2){
    // Ask once when entering a room
    meNick = await new Promise((resolve)=>{
      const closeBtn = $("#modalClose");
      const back = $("#modalBack");
      const prevDisp = closeBtn ? closeBtn.style.display : "";
      // IMPORTANT: don't block clicks inside the modal content.
      // Only block attempts to close by clicking the backdrop / close button.
      const blockCloseBtn = (e)=>{ e.preventDefault(); e.stopImmediatePropagation(); };
      const blockBackdropOnly = (e)=>{
        if(e?.target && e.target.id === "modalBack"){
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };

      // Prevent closing while choosing nickname
      closeBtn && closeBtn.addEventListener("click", blockCloseBtn, true);
      back && back.addEventListener("click", blockBackdropOnly, true);
      if(closeBtn) closeBtn.style.display = "none";

      openModal("Seu nome", `
        <p style="margin:0 0 8px 0; color:var(--muted)">Como você quer aparecer nesta mesa?</p>
        <label class="label">Nome de usuário</label>
        <input id="nick" placeholder="ex: Ana" maxlength="24" />
        <div class="actions" style="margin-top:12px">
          <button id="ok">Salvar</button>
        </div>
      `);

      const body = $("#modalBody");
      const inp = body ? body.querySelector("#nick") : null;
      const ok = body ? body.querySelector("#ok") : null;
      setTimeout(()=>inp && inp.focus(), 0);

      if(!ok){
        // Fallback: restore and resolve with empty (should not happen)
        closeBtn && closeBtn.removeEventListener("click", blockCloseBtn, true);
        back && back.removeEventListener("click", blockBackdropOnly, true);
        if(closeBtn) closeBtn.style.display = prevDisp;
        closeModal();
        resolve("");
        return;
      }

      ok.onclick = async ()=>{
        const nick = clampLen(((inp && inp.value) || "").trim(), 24);
        if(nick.length<2){ toast("Nome muito curto.","error"); return; }
        await dbUpdate(`users/${me.uid}`, { nickname: nick, updatedAt: Date.now() });

        // Restore modal closers
        closeBtn && closeBtn.removeEventListener("click", blockCloseBtn, true);
        back && back.removeEventListener("click", blockBackdropOnly, true);
        if(closeBtn) closeBtn.style.display = prevDisp;
        closeModal();
        resolve(nick);
      };
    });
  }


  role = (room.masterUid===me.uid) ? "master" : (room.players?.[me.uid]?.role || "player");

  const prev = room.players?.[me.uid] || {};
  await dbSet(`rooms/${roomId}/players/${me.uid}`, {
    uid: me.uid,
    nickname: meNick || prev.nickname || "",
    role,
    connected: true,
    joinedAt: prev.joinedAt || Date.now(),
    lastSeenAt: Date.now(),
    characterId: prev.characterId || null,
    tokenId: prev.tokenId || null
  });
  await dbUpdate(`users/${me.uid}/rooms`, { [roomId]: true });
}

function subAll(){
  clearSubs();
  unsub.push(dbOn(`rooms/${roomId}`, (v)=>{ if(v){ room=v; setHeader(); mapRender(); syncToolsUI(); } }));
  unsub.push(dbOn(`rooms/${roomId}/players`, (v)=>{ players=v||{}; if(me) role = (room?.masterUid===me.uid) ? "master" : (players?.[me.uid]?.role || "player"); syncToolsUI(); }));
  unsub.push(dbOn(`rooms/${roomId}/tokens`, (v)=>{ tokens=v||{}; mapRender(); syncToolsUI(); }));
  unsub.push(dbOn(`rooms/${roomId}/characters`, (v)=>{ characters=v||{}; syncToolsUI(); refreshOpenSheets(); }));
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
const _blobUrlCache = new Map(); // original dataURL -> blob URL

function _dataUrlToBlobUrl(dataUrl){
  if(_blobUrlCache.has(dataUrl)) return _blobUrlCache.get(dataUrl);
  // data:[<mime>][;base64],<data>
  const comma = dataUrl.indexOf(",");
  if(comma < 0) return "";
  const header = dataUrl.slice(5, comma); // after 'data:'
  const payloadRaw = dataUrl.slice(comma+1);
  const isB64 = /;base64/i.test(header);
  const mime = (header.split(";")[0] || "application/octet-stream").trim() || "application/octet-stream";

  try{
    let bytes;
    if(isB64){
      let payload = payloadRaw.replace(/\s+/g, "");
      // If base64 length not multiple of 4, pad it
      const mod = payload.length % 4;
      if(mod) payload += "=".repeat(4-mod);
      // Guard against absurdly large payloads that can freeze UI
      if(payload.length > 20_000_000) return "";
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    }else{
      // percent-decoded data section
      const str = decodeURIComponent(payloadRaw);
      bytes = new TextEncoder().encode(str);
    }
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    _blobUrlCache.set(dataUrl, url);
    return url;
  }catch(e){
    return "";
  }
}

window.addEventListener("beforeunload", ()=>{
  try{
    for(const u of _blobUrlCache.values()) URL.revokeObjectURL(u);
    _blobUrlCache.clear();
  }catch(e){}
});

function _normalizeImageUrl(url){
  if(!url) return "";
  url = String(url).trim();

  // Remove whitespace/newlines that often break DataURLs
  url = url.replace(/\s+/g, "");

  if(!url) return "";

  // Guard huge DataURLs (can produce ERR_INVALID_URL / freeze)
  if(url.startsWith("data:") && url.length > 2_500_000) return "";

  // Allow relative paths and http(s) urls as-is
  const isHttp = /^https?:\/\//i.test(url);
  const isRel  = /^\.{0,2}\//.test(url) || url.startsWith("/");
  const isData = url.startsWith("data:");

  if(isData){
    // Only images
    if(!/^data:image\//i.test(url)) return "";

    // Heuristics for common broken base64 separators
    // 1) "data:image/png;base64/AAAA" -> comma
    url = url.replace(/;base64\//i, ";base64,");
    // 2) missing comma after ;base64
    if(/;base64/i.test(url) && !/;base64,/.test(url)){
      url = url.replace(/;base64/i, ";base64,");
    }
    // 3) rare truncations like ";bas..." -> treat as base64 marker
    if(/;bas/i.test(url) && !/;base64,/.test(url) && !url.includes(",")){
      url = url.replace(/;bas[^,]*/i, ";base64,");
    }

    // Must have comma separator and payload
    const comma = url.indexOf(",");
    if(comma<0) return "";
    const payload = url.slice(comma+1);
    if(!payload || payload.length<8) return "";

    // If declared base64, validate characters loosely (avoid ERR_INVALID_URL)
    if(/;base64,/i.test(url)){
      if(!/^[A-Za-z0-9+/=]+$/.test(payload)) return "";
    }

    return url;
  }

  if(isHttp || isRel){
    return url;
  }

  return "";
}

function _safeSetImgSrc(img, raw){
  const norm = _normalizeImageUrl(raw);
  if(!norm){
    try{ img.removeAttribute("src"); }catch(e){}
    return false;
  }
  // Use blob URLs for base64 DataURLs to avoid ERR_INVALID_URL and reduce memory pressure
  let srcToUse = norm;
  if(norm.startsWith("data:image/") && /;base64,/i.test(norm)){
    const blobUrl = _dataUrlToBlobUrl(norm);
    // If we cannot create a Blob URL, do NOT fall back to the raw DataURL (avoids ERR_INVALID_URL)
    if(!blobUrl) return false;
    srcToUse = blobUrl;
  }
  img.onerror = ()=>{ try{ img.remove(); }catch(e){} };
  try{ img.src = srcToUse; }catch(e){ return false; }
  return true;
}

function sanitizeImageUrlInput(raw){
  const u = String(raw||"").trim();
  if(!u) return "";
  const norm = _normalizeImageUrl(u);
  if(!norm) throw new Error("Imagem inválida. Use URL (https://...) ou DataURL (data:image/...;base64,...)");
  return norm;
}

// Base64 DataURLs can be very long. Truncating them makes the URL invalid and breaks token/sheet images.
// For normal URLs, we keep them reasonably short. For DataURLs, we keep the full value (with a hard safety cap).
function clampImageUrl(raw, normalMax=420, dataUrlMax=4_500_000){
  const norm = sanitizeImageUrlInput(raw);
  if(!norm) return "";
  if(norm.startsWith("data:image/")){
    if(norm.length > dataUrlMax) throw new Error("Imagem Base64 muito grande. Use uma imagem menor (ou URL https://...).");
    return norm;
  }
  return clampLen(norm, normalMax);
}

function hydrateInlineImages(root){
  root.querySelectorAll("img[data-src]").forEach(img=>{
    const raw = img.getAttribute("data-src")||"";
    if(!_safeSetImgSrc(img, raw)){ try{ img.remove(); }catch(e){} }
  });
}

function getImg(url){
  url=_normalizeImageUrl(url);
  if(!url) return null;

  // Use blob URLs for base64 DataURLs
  let cacheKey = url;
  let srcToUse = url;
  if(url.startsWith("data:image/") && /;base64,/i.test(url)){
    const blobUrl = _dataUrlToBlobUrl(url);
    // Do not fall back to raw DataURL if conversion fails (avoids ERR_INVALID_URL)
    if(!blobUrl) return null;
    cacheKey = blobUrl;
    srcToUse = blobUrl;
  }

  if(!_imgCache.has(cacheKey)){
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload = ()=>{ try{ if(typeof mapRender==="function") mapRender(); }catch(e){} };
    img.onerror = ()=>{ /* broken image */ };
    try{ img.src=srcToUse; }catch(e){ return null; }
    _imgCache.set(cacheKey,img);
  }
  return _imgCache.get(cacheKey);
}

function drawBackground(){
  const bgUrl = room?.settings?.map?.bgUrl || "";
  if(!bgUrl) return;
  const img=getImg(bgUrl);
  if(!img || !img.complete || !img.naturalWidth) return;
  ctx.save();
  const p=worldToScreen(0,0);
  const w = img.naturalWidth * zoom * dpr;
  const h = img.naturalHeight * zoom * dpr;
  ctx.globalAlpha = 0.92;
  try{ ctx.drawImage(img, p.x, p.y, w, h); }catch(e){ /* ignore broken */ }
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

function drawFog(){
  const fog = room?.settings?.fog;
  if(!fog?.enabled) return;
  const blocks = fog.blocks || {};
  ctx.save();
  // Players should not see hidden content: draw near-opaque black.
  // Master sees a lighter overlay.
  ctx.fillStyle = isMaster() ? "rgba(0,0,0,.35)" : "rgba(0,0,0,.92)";
  for(const b of Object.values(blocks)){
    if(!b) continue;
    const wx=num(b.x,0), wy=num(b.y,0);
    const ww=num(b.w,0), hh=num(b.h,0);
    const p=worldToScreen(wx,wy);
    ctx.fillRect(p.x, p.y, ww*zoom*dpr, hh*zoom*dpr);
  }
  ctx.restore();
}

function drawMarkers(){
  for(const [id,m] of Object.entries(markers||{})){
    if(!m) continue;
    const wx=num(m.x,0), wy=num(m.y,0);
    const p=worldToScreen(wx,wy);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(255,214,102,.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10*dpr, 0, Math.PI*2);
    ctx.fill();
    const title=(m.title||"Marco").trim();
    if(title){
      ctx.font = `${12*dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign="center";
      ctx.textBaseline="bottom";
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.fillText(title, p.x+1*dpr, p.y-12*dpr+1*dpr);
      ctx.fillStyle="rgba(255,255,255,.95)";
      ctx.fillText(title, p.x, p.y-12*dpr);
    }
    ctx.restore();
  }
}

// Main renderer. Named function (hoisted) so DB callbacks can call it safely.
function mapRender(){
  try{
    if(!ctx) return;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    drawBackground();
    drawGrid();
    drawMarkers();
    drawTokens();
    // Fog must render on top to hide content from players.
    drawFog();
  }catch(e){
    // Never throw in render loop.
  }
}

function drawTokens(){
  const entries = Object.entries(tokens||{})
    .filter(([id,t])=> !(t && t.visible===false) && !(t && t.inMarkerId))
    .sort((a,b)=> (Number(a[1]?.z)||0) - (Number(b[1]?.z)||0));

  for(const [id,t] of entries){
    const wx=num(t.x,0), wy=num(t.y,0);
    const r=24*(Number(t.scale)||1);
    const s=worldToScreen(wx,wy);
    const rr=r*zoom*dpr;
    const box=rr*2;

    ctx.save();
    const isSelected = (id===selectedTokenId);

    // Draw sprite (no clip, no border). If selected, add a glow that follows the sprite silhouette.
    if(t.spriteUrl){
      const img=getImg(t.spriteUrl);
      if(img && img.complete && img.naturalWidth && img.naturalHeight){
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const k = Math.min(box/iw, box/ih);
        const dw = iw*k, dh = ih*k;
        const dx = s.x - dw/2;
        const dy = s.y - dh/2;

        if(isSelected){
          ctx.save();
          ctx.shadowBlur = 22*dpr;
          ctx.shadowColor = "rgba(255,255,255,.75)";
          try{ ctx.drawImage(img, dx, dy, dw, dh); }catch(e){}
          ctx.restore();
        }

        try{ ctx.drawImage(img, dx, dy, dw, dh); }catch(e){ /* ignore broken */ }
      }else{
        // placeholder while loading
        if(isSelected){
          ctx.save();
          ctx.shadowBlur = 18*dpr;
          ctx.shadowColor = "rgba(255,255,255,.55)";
          ctx.fillStyle="rgba(74,163,255,.12)";
          ctx.fillRect(s.x-rr, s.y-rr, box, box);
          ctx.restore();
        }else{
          ctx.fillStyle="rgba(74,163,255,.10)";
          ctx.fillRect(s.x-rr, s.y-rr, box, box);
        }
      }
    }else{
      if(isSelected){
        ctx.save();
        ctx.shadowBlur = 18*dpr;
        ctx.shadowColor = "rgba(255,255,255,.55)";
        ctx.fillStyle="rgba(74,163,255,.12)";
        ctx.fillRect(s.x-rr, s.y-rr, box, box);
        ctx.restore();
      }else{
        ctx.fillStyle="rgba(74,163,255,.10)";
        ctx.fillRect(s.x-rr, s.y-rr, box, box);
      }
    }

    // if player cannot edit, dim slightly (keep behavior without border)
    const editable = canEditToken(id, t);
    if(!editable){
      ctx.globalAlpha = 0.7;
    }

    // optional tiny label
    const rawName=(t.name||"").trim();
    const ownerName = (t.ownerUid && players?.[t.ownerUid]?.nickname) ? String(players[t.ownerUid].nickname||"").trim() : "";
    // If the saved token name looks like a UID (long random) use the player's nickname instead.
    const looksLikeUid = rawName && rawName.length >= 16 && !/\s/.test(rawName);
    const name = (looksLikeUid && ownerName) ? ownerName : (rawName || ownerName);
    if(name){
      ctx.globalAlpha = 1;
      ctx.font = `${12*dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign="center";
      ctx.textBaseline="top";
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.fillText(name, s.x+1*dpr, s.y+rr+3*dpr);
      ctx.fillStyle="rgba(255,255,255,.92)";
      ctx.fillText(name, s.x, s.y+rr+2*dpr);
    }

    ctx.restore();
  }
  function hitToken(wx, wy){
  let best=null;
  const entries = Object.entries(tokens||{})
    .filter(([id,t])=> !(t && t.visible===false) && !(t && t.inMarkerId))
    .sort((a,b)=> (Number(a[1]?.z)||0) - (Number(b[1]?.z)||0));
  for(const [id,t] of entries){
    const dx=wx-num(t.x,0), dy=wy-num(t.y,0);
    const r=24*(Number(t.scale)||1);
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
let keyMDown=false;
let placingMarker=false;
async function applyFogAt(wx, wy){
  if(!isMaster() || !room?.settings?.fog?.enabled) return;
  const size = Math.max(20, Math.min(800, fogBrush));
  const sx = Math.floor(wx/size)*size;
  const sy = Math.floor(wy/size)*size;
  const key = `b_${sx}_${sy}_${size}`;
  const path = `rooms/${roomId}/settings/fog/blocks/${key}`;
  if(fogMode==="paint") await dbSet(path, { x:sx, y:sy, w:size, h:size });
  else {
    await dbSet(path, null);
  }
}

async function createMarkerAt(wx, wy){
  if(!isMaster()) return;
  const obj = {
    title: "Marco",
    x: num(wx, 0),
    y: num(wy, 0),
    tokenIds: [],
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const markerId = await dbPush(`rooms/${roomId}/markers`, obj);
  await dbUpdate(`rooms/${roomId}/markers/${markerId}`, { markerId });
  await addLog("marker","Marco criado",{markerId});
  toast("Marco criado. Clique nele para editar.","ok");
}


/* =================== MAP INTERACTION =================== */
let down=false, dragging=null, pan=true;
let resizing=null; // token resize state (master only)
let startPt={sx:0,sy:0};
let last={sx:0,sy:0};
let lastClickWorld={x:0,y:0};
let lastClickScreen={x:0,y:0};
let lastTap={time:0, tokenId:null}; // double-click to open sheet

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

  if(isMaster() && keyMDown && hit && canEditToken(hit.id, hit.t)){
    // Resize mode: hold M and drag to scale token proportionally
    const cx=num(hit.t.x,0), cy=num(hit.t.y,0);
    const dx=w.x-cx, dy=w.y-cy;
    const dist=Math.max(0.01, Math.sqrt(dx*dx+dy*dy));
    resizing={ id:hit.id, cx, cy, startDist:dist, startScale:(Number(hit.t.scale)||1) };
    dragging=null;
    pan=false;
    return;
  }

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
  lastPointerWorld = {x:w.x, y:w.y};

  if(paintingFog){ applyFogAt(w.x,w.y).catch(()=>{}); return; }

  if(resizing){
    const t=tokens[resizing.id];
    if(t){
      const dx=w.x-resizing.cx, dy=w.y-resizing.cy;
      const dist=Math.max(0.01, Math.sqrt(dx*dx+dy*dy));
      const ratio=dist/resizing.startDist;
      let sc=resizing.startScale*ratio;
      sc=Math.max(0.25, Math.min(4, sc));
      t.scale=sc;
      mapRender();
    }
    return;
  }

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

  if(resizing){
    const id=resizing.id;
    const t=tokens[id];
    const sc=Number(t?.scale)||1;
    resizing=null;
    try{
      await dbUpdate(`rooms/${roomId}/tokens/${id}`, { scale: sc, updatedAt: Date.now() });
      await addLog("token","Token redimensionado",{tokenId:id,scale:sc});
    }catch(err){ toast(String(err?.message||err),"error"); }
    return;
  }

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
  // - Single click selects token (no sheet)
  // - Sheet opens only on double-click/double-tap
  if(dist <= 20){
    const w=screenToWorld(sx,sy);
    const hit=hitToken(w.x,w.y);

    if(hit){
      // Selection is allowed for GM; for players only if they can edit or open the sheet.
      if(isMaster() || canEditToken(hit.id, hit.t) || canOpenSheet(hit.id, hit.t)){
        selectedTokenId = hit.id;
        mapRender();
      }

      if(canOpenSheet(hit.id, hit.t)){
        const now=Date.now();
        if(lastTap.tokenId===hit.id && (now-lastTap.time) <= 350){
          lastTap.time=0; lastTap.tokenId=null;
          openSheetWindow(hit.id, sx, sy).catch(()=>{});
        }else{
          lastTap.time=now; lastTap.tokenId=hit.id;
        }
      }else{
        // Non-openable token cancels any pending double click
        lastTap.time=0; lastTap.tokenId=null;
      }
    }else{
      // Clicking empty space clears selection
      selectedTokenId=null;
      mapRender();
      lastTap.time=0; lastTap.tokenId=null;
    }
  }else{
  // drag cancels any pending double click
  lastTap.time=0; lastTap.tokenId=null;
}

}


/* Pointer Events (works for mouse + touch) */
canvas.style.touchAction = "none";

canvas.addEventListener("pointerdown",(ev)=>{
  ev.preventDefault();
  try{
    canvas.setPointerCapture?.(ev.pointerId);
    const {sx,sy}=getScreenXY(ev);
    beginPointerAt(sx,sy);
  }catch(e){ /* ignore */ }
},{passive:false});

canvas.addEventListener("pointermove",(ev)=>{
  ev.preventDefault();
  try{
    if(!down) return;
    const {sx,sy}=getScreenXY(ev);
    movePointerAt(sx,sy);
  }catch(e){ /* ignore */ }
},{passive:false});

canvas.addEventListener("pointerup",(ev)=>{
  ev.preventDefault();
  try{
    canvas.releasePointerCapture?.(ev.pointerId);
    const {sx,sy}=getScreenXY(ev);
    endPointerAt(sx,sy);
  }catch(e){ /* ignore */ }
},{passive:false});

canvas.addEventListener("pointercancel",()=>{
  down=false; dragging=null; pan=true; paintingFog=false;
},{passive:true});

/* Fallback click: always try open sheet (desktop browsers that skip pointerup) */
canvas.addEventListener("dblclick",(ev)=>{
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
  }catch(e){ /* ignore */ }
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

// Right-click (master): create a marker at cursor
canvas.addEventListener("contextmenu",(ev)=>{
  if(!isMaster()) return;
  ev.preventDefault();
  try{
    const {sx,sy}=getScreenXY(ev);
    const w=screenToWorld(sx,sy);
    createMarkerAt(w.x,w.y).catch(err=>toast(String(err?.message||err),"error"));
  }catch(e){ /* ignore */ }
});


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
  beginPointerAt(sx,sy);
},{passive:true});
canvas.addEventListener("touchmove",(e)=>{
  const t0=e.touches[0]; if(!t0) return;
  const rect=canvas.getBoundingClientRect();
  const sx=(t0.clientX-rect.left)*dpr, sy=(t0.clientY-rect.top)*dpr;
  movePointerAt(sx,sy);
},{passive:true});
canvas.addEventListener("touchend",()=>{
  endPointerAt(last.sx,last.sy);
},{passive:true});

/* =================== Rolls helpers =================== */





function applyModOp(total, m, op){
  const mod = Number(m)||0;
  const o = (op||"add");
  if(o==="mul") return Math.floor(total * mod);
  return total + mod;
}

function mentalMods(mental){
  // Positive stack: +1..+3 -> note for rest (not applied to rolls)
  // +4 -> +5 in all dice totals
  // +5 -> +3 in DT-type tests (stacks with +4)
  const m = num(mental,0);
  return {
    diceBonus: (m>=4?5:0),
    dtTestBonus: (m>=5?3:0),
    restHpBonus: (m>=1 && m<=3)?1:0,
  };
}
function mentalPenalty(mental){ return (mental<=-8) ? -5 : 0; }
function advantagesDisabled(mental){ return mental<=-11; }

function fmtSigned(n){ const v=Number(n)||0; return (v>=0?`+${v}`:`${v}`); }
function fmtPart(label, v){ const n=Number(v)||0; return `${label} (${fmtSigned(n)})`; }
function joinParts(parts){
  // parts: [{label,value}]
  const kept = (parts||[]).filter(p=>Number.isFinite(Number(p.value)) && Number(p.value)!==0);
  if(!kept.length) return "sem modificadores";
  return kept.map(p=>fmtPart(p.label,p.value)).join(" + ");
}
function calcParts(parts){
  return (parts||[]).reduce((acc,p)=>acc + (Number(p.value)||0), 0);
}


async function pushRoll(payload){
  const clean = JSON.parse(JSON.stringify(payload||{}));
  await dbPush(`rooms/${roomId}/rolls`, clean);
  await dbPush(`logs/${roomId}`, { type:"roll", actorUid: me.uid, message: clampLen(clean?.context?.label||"Rolagem",200), payload: clean.context||{}, ts: Date.now() });
}

async function rollAttrInline(char, attr){
  const mental=num(char.mental,0);
  const mm=mentalMods(mental);
  const base=num(char.attrs?.[attr],1);
  const pen=mentalPenalty(mental);
  const die=rollDice("normal").dice[0];

  const parts = [
    { label: attr, value: base },
    { label: "Mental", value: pen },
    { label: "Bônus mental", value: mm.diceBonus }
  ];
  const modsTotal = calcParts(parts);
  const total = die + modsTotal;

  const breakdown = joinParts(parts);
  await pushRoll({
    userUid: me.uid,
    expression:`1d12(${die}) + ${breakdown} = ${total}`,
    mode:"normal",
    dice:[die],
    picked:die,
    total,
    context:{ roomId, charId:char.charId, kind:"attr", attr, label:`${attr}: 1d12(${die}) + ${breakdown} = ${total}`, mods: parts, mental },
    visibility:"public",
    timestamp:Date.now()
  });
  toast(`Rolagem ${attr}: 1d12(${die}) + ${breakdown} = ${total}`, "ok");
}
async function rollItemInline(char, item){
  const mental=num(char.mental,0);
  const mm=mentalMods(mental);
  const a=(item.attrUsed||"FOR").toUpperCase();
  const base=num(char.attrs?.[a],1);
  const modVal=num(item.mod,0);
  const pen=mentalPenalty(mental);
  const die=rollDice("normal").dice[0];

  // soma de modificadores (antes da operação do item)
  const addParts = [
    { label: a, value: base },
    { label: "Mental", value: pen },
    { label: "Bônus mental", value: mm.diceBonus }
  ];
  const preTotal = die + calcParts(addParts);

  // aplica operação do item sem alterar dados da ficha
  let total = preTotal;
  if((item.op||"add")==="mul"){
    total = Math.floor(total * (Number(modVal)||0));
  } else {
    total = total + (Number(modVal)||0);
  }

  const breakdown = joinParts(addParts);
  const opLabel = (item.op==="mul") ? `×${Number(modVal)||0}` : fmtSigned(Number(modVal)||0);

  const cleanName = item.name || item.nome || "Item";
  await pushRoll({
    userUid: me.uid,
    expression:`1d12(${die}) + ${breakdown} ${item.op==="mul" ? ` ${opLabel}` : ` + Item ${cleanName} (${opLabel})`} = ${total}`,
    mode:"normal",
    dice:[die],
    picked:die,
    total,
    context:{ roomId, charId:char.charId, kind:"item", itemId:item.id, name:cleanName, attrUsed:a, mod:modVal, op:(item.op||"add"),
      label:`Item ${cleanName}: 1d12(${die}) + ${breakdown} ${item.op==="mul" ? ` ${opLabel}` : ` + Item ${cleanName} (${opLabel})`} = ${total}`,
      mods: addParts, itemMod: modVal, mental
    },
    visibility:"public",
    timestamp:Date.now()
  });

  // reflexo mental -12 (somente loga; não altera ficha automaticamente)
  if(mental<=-12){
    const recoil = Math.max(0, total*2);
    await addLog("mental","REFLEXO (-12): dano de volta", { amount: recoil, source: "mental-12", kind: "recoil" });
    toast(`Mental -12: reflexo registrado (${recoil}).`,"error");
  }

  toast(`Rolagem item ${cleanName}: 1d12(${die}) + ${breakdown} ${item.op==="mul" ? ` ${opLabel}` : ` + Item (${opLabel})`} = ${total}`, "ok");
}
async function rollAdvInline(char, adv){
  const mental=num(char.mental,0);
  const mm=mentalMods(mental);

  if(!isMaster() && (adv.kind!=="Desvantagem") && advantagesDisabled(mental)){
    toast("Vantagens desativadas (mental <= -11).", "error");
    return;
  }

  const a=(adv.attrUsed||"QI").toUpperCase();
  const base=num(char.attrs?.[a],1);
  const dtBase=Math.max(0, num(adv.dt, 9));
  const dt = dtBase + (mm.dtTestBonus||0);

  const pen=mentalPenalty(mental);
  const die=rollDice("normal").dice[0];
  const modRaw = num(adv.mod,0);

  const addParts = [
    { label: a, value: base },
    { label: "Mental", value: pen },
    { label: "Bônus mental", value: mm.diceBonus }
  ];
  const preTotal = die + calcParts(addParts);

  let total = preTotal;
  let opLabel = "";
  if(modRaw!==0){
    if((adv.op||"add")==="mul"){
      total = Math.floor(total * (Number(modRaw)||0));
      opLabel = `×${Number(modRaw)||0}`;
    } else {
      total = total + (Number(modRaw)||0);
      opLabel = fmtSigned(Number(modRaw)||0);
    }
  }

  const success=total>=dt;
  const breakdown = joinParts(addParts);
  const advName = adv.name || adv.nome || "Vantagem";
  const kind = adv.kind || "Vantagem";

  const expr = `1d12(${die}) + ${breakdown}${opLabel?` ${((adv.op||"add")==="mul")?opLabel:` + ${kind} ${advName} (${opLabel})`}`:""} vs DT ${dt}`;
  await pushRoll({
    userUid: me.uid,
    expression: expr,
    mode:"normal",
    dice:[die],
    picked:die,
    total,
    context:{
      roomId, charId:char.charId, kind:kind, advId:adv.id, name:advName,
      type:(adv.type||adv.kind||""), attrUsed:a, dt, mod:modRaw, op:(adv.op||"add"),
      success,
      label:`${kind} ${advName}: ${success?"SUCESSO":"FALHA"} | ${expr} | total ${total}`,
      mods:addParts, mental
    },
    visibility:"public",
    timestamp:Date.now()
  });

  toast(`${kind} ${advName}: ${success?"SUCESSO":"FALHA"} | ${expr} | total ${total}`, success?"ok":"error");
}
async function rollAdvDTInline(adv){
  const die=rollDice("normal").dice[0];
  const name = adv?.name || adv?.nome || "DT";
  await pushRoll({
    userUid: me.uid,
    expression:`DT 1d12(${die})`,
    mode:"normal",
    dice:[die],
    picked:die,
    total:die,
    context:{ roomId, kind:"dt", advId:adv.id, name, label:`DT ${name}: 1d12(${die}) = ${die}` },
    visibility:"public",
    timestamp:Date.now()
  });
  toast(`DT ${name}: 1d12(${die}) = ${die}`, "ok");
}
function getCharByToken(tokenId){
  const t=tokens?.[tokenId];
  if(!t?.linkedCharId) return null;
  return characters?.[t.linkedCharId] || null;
}

/* =================== Sheet floating window =================== */
let sheetWindows = []; // [{el, tokenId}]

function _makeSheetWindowEl(){
  const el=document.createElement("div");
  el.className="sheetWin";
  el.style.cssText = `position:fixed; left:22px; top:92px; width:380px; max-width:92vw; z-index:55;
    background:rgba(15,20,32,.92); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,.45); display:none; overflow:hidden;`;
  el.innerHTML = `
    <div class="swBar" style="cursor:move; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(255,255,255,.04);">
      <strong class="swTitle" style="font-size:14px">Ficha</strong>
      <div class="actions" style="gap:8px">
        <button class="secondary swEditBase" style="padding:6px 10px; display:none">Editar ficha</button>
        <button class="danger swDel" style="padding:6px 10px; display:none">Apagar</button>
        <button class="secondary swClose" style="padding:6px 10px">Fechar</button>
      </div>
    </div>
    <div class="swBody" style="padding:12px; max-height:74vh; overflow:auto"></div>
  `;
  document.body.appendChild(el);

  // drag
  const bar=el.querySelector(".swBar");
  let drag=false, ox=0, oy=0;
  bar.addEventListener("mousedown",(e)=>{ drag=true; const r=el.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; el.style.left=Math.max(6,e.clientX-ox)+"px"; el.style.top=Math.max(6,e.clientY-oy)+"px"; });
  window.addEventListener("mouseup",()=> drag=false);

  bar.addEventListener("touchstart",(e)=>{ const t=e.touches[0]; if(!t) return; drag=true; const r=el.getBoundingClientRect(); ox=t.clientX-r.left; oy=t.clientY-r.top; },{passive:true});
  window.addEventListener("touchmove",(e)=>{ if(!drag) return; const t=e.touches[0]; if(!t) return; el.style.left=Math.max(6,t.clientX-ox)+"px"; el.style.top=Math.max(6,t.clientY-oy)+"px"; },{passive:true});
  window.addEventListener("touchend",()=> drag=false,{passive:true});

  return el;
}

function openSheetWindow(tokenId, sx=null, sy=null){
  const t=tokens?.[tokenId];
  if(!t) return;
  const char=getCharByToken(tokenId);
  if(!char){ toast("Token sem ficha.", "error"); return; }

  const el=_makeSheetWindowEl();
  el.dataset.tokenId = tokenId;
  el.style.display="block";
  el.style.zIndex = String(55 + sheetWindows.length);

  if(sx!=null && sy!=null){
    const px = sx/(dpr) + 14;
    const py = sy/(dpr) + 14;
    el.style.left = Math.min(window.innerWidth-40, Math.max(6, px)) + 'px';
    el.style.top  = Math.min(window.innerHeight-40, Math.max(6, py)) + 'px';
  }

  el.querySelector(".swTitle").textContent = char.name || "Ficha";
  const btnDel = el.querySelector(".swDel");
  if(btnDel) btnDel.style.display = isMaster() ? "inline-flex" : "none";
  const btnEdit = el.querySelector(".swEditBase");
  if(btnEdit){
    btnEdit.style.display = isMaster() ? "inline-flex" : "none";
    btnEdit.onclick = ()=>{ const ch=getCharByToken(tokenId); if(ch) openCharBaseEditor(ch); };
  }
  if(btnDel){
    btnDel.onclick = async ()=>{
      const ch=getCharByToken(tokenId);
      if(!ch) return;
      if(confirm("Apagar esta ficha?")){
        await deleteCharacter(ch.charId);
        // close this window
        const idx = sheetWindows.findIndex(w=>w.el===el);
        if(idx>=0) sheetWindows.splice(idx,1);
        el.remove();
      }
    };
  }
  el.querySelector(".swClose").onclick = ()=>{
    const idx = sheetWindows.findIndex(w=>w.el===el);
    if(idx>=0) sheetWindows.splice(idx,1);
    el.remove();
  };

  sheetWindows.push({el, tokenId});

  renderSheetInto(el.querySelector(".swBody"), t, char);
}

function refreshOpenSheets(){
  if(!sheetWindows.length) return;
  for(const w of [...sheetWindows]){
    const tokenId = w.tokenId;
    const t=tokens?.[tokenId];
    const char=getCharByToken(tokenId);
    if(!t || !char){
      w.el?.remove();
      sheetWindows = sheetWindows.filter(x=>x!==w);
      continue;
    }
    w.el.querySelector(".swTitle").textContent = char.name || "Ficha";
    renderSheetInto(w.el.querySelector(".swBody"), t, char);
  }
}

function renderSheetInto(root, token, char){
  const inv=char.inventory||[];
  const advs=char.advantages||[];
  const disads=char.disadvantages||[];
  const isOwner = token?.ownerUid && me && token.ownerUid===me.uid;
  const allowEdit = isMaster(); // master edits; players read-only

const a=char.attrs||{FOR:1,DEX:1,VIG:1,QI:1};
// Derived SUR4 stats (auto)
const FOR=num(a.FOR,1), DEX=num(a.DEX,1), VIG=num(a.VIG,1), QI=num(a.QI,1);
const intentions = Math.floor((VIG + DEX + 1)/2);
const move = DEX + 3;
const dodge = DEX * 2;
const dtHead = (VIG + 3) * 4;
const dtTorso = (VIG + FOR + 3) * 4;
const dtArm = (VIG + 3) * 3;
const dtLeg = (VIG + 3) * 3;
const hpTotal = (dtHead + dtTorso + dtArm*2 + dtLeg*2) * 4;
// IMPORTANT: HP atual é por TOKEN (instância), para permitir vários NPCs compartilharem a mesma ficha-base.
// Fallback: se o token não tiver hpCurrent, usa o HP total calculado (HP é por TOKEN).
const hpCurrent = Math.min(hpTotal, Math.max(0, num(token?.hpCurrent, hpTotal)));
if(!Number.isFinite(Number(token?.hpCurrent))){
  // Inicializa HP atual por token (não compartilhar pela ficha base)
  dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { hpCurrent, updatedAt: Date.now() }).catch(()=>{});
}
const invLimit = (FOR + VIG) * 4;
const invUsed = (char.inventory||[]).reduce((s,it)=>s+num(it.kg,0),0);
const invLeft = Math.max(0, invLimit - invUsed);

  root.innerHTML = `
    <div class="item">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:46px;height:46px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center">
          ${token.spriteUrl?`<img data-src="${esc(token.spriteUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" />`:`<span class="mono">SUR4</span>`}
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
  <strong>Derivados (SUR4)</strong>
  <div class="grid2" style="margin-top:8px">
    <div class="item"><small>Intenções</small><div class="mono">${intentions}</div></div>
    <div class="item"><small>Movimento</small><div class="mono">${move} m/inten.</div></div>
    <div class="item"><small>Esquiva</small><div class="mono">${dodge}</div></div>
    <div class="item"><small>HP</small><div class="mono"><span id="hpNow">${hpCurrent}</span>/<span id="hpTot">${hpTotal}</span></div></div>

<div class="actions" style="margin-top:10px; gap:8px; align-items:flex-end">
  <div style="flex:1">
    <small style="color:var(--muted)">Diminuir HP (dano)</small>
    <input id="hpDmg" type="number" placeholder="ex: 12" />
  </div>
  <button id="hpApply" class="secondary">Aplicar</button>
</div>
  </div>
  <div class="grid2" style="margin-top:10px">
    <div class="item"><small>DT Cabeça</small><div class="mono">${dtHead}</div></div>
    <div class="item"><small>DT Torso</small><div class="mono">${dtTorso}</div></div>
    <div class="item"><small>DT Braço (cada)</small><div class="mono">${dtArm}</div></div>
    <div class="item"><small>DT Perna (cada)</small><div class="mono">${dtLeg}</div></div>
  </div>
</div>

<div class="card pad" style="margin-top:10px">
  <strong>Inventário</strong>
  <div class="grid2" style="margin-top:8px">
    <div class="item"><small>Limite</small><div class="mono">${invLimit} kg</div></div>
    <div class="item"><small>Usado</small><div class="mono">${invUsed.toFixed(1)} kg</div></div>
    <div class="item"><small>Restante</small><div class="mono">${invLeft.toFixed(1)} kg</div></div>
    <div class="item"><small>Espaços</small><div class="mono">${Math.max(0, Math.floor(invLeft))} (≈kg)</div></div>
  </div>
  <small style="color:var(--muted)">“Espaços” aqui é uma visualização simples baseada no peso restante (kg). Itens continuam por peso.</small>
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

  hydrateInlineImages(root);

  root.querySelectorAll("[data-attr]").forEach(el=> el.onclick = ()=> rollAttrInline(char, el.dataset.attr));

  const hpBtn = root.querySelector("#hpApply");
  if(hpBtn){
    const canHp = isMaster() || isOwner;
    hpBtn.style.display = canHp ? "inline-flex" : "none";
    const hpInp = root.querySelector("#hpDmg");
    if(!canHp && hpInp) hpInp.style.display="none";
    hpBtn.onclick = async ()=>{
      try{
        const dmg = num(hpInp?.value,0);
        if(dmg===0) return toast("Digite um valor diferente de 0.","error");
        const cur = Math.min(hpTotal, Math.max(0, num(token?.hpCurrent, hpTotal)));
        const next = (dmg>0) ? Math.max(0, cur - dmg) : Math.min(hpTotal, cur + Math.abs(dmg));
        // salva no token (instância), não na ficha-base
        await dbUpdate(`rooms/${roomId}/tokens/${sheetTokenId||token?.tokenId}`, { hpCurrent: next, updatedAt: Date.now() });
        toast(`HP: ${next}/${hpTotal}`, "ok");
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
  }

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
          <small>${esc((a.attrUsed||"QI").toUpperCase())} ${a.op==="mul"?"×":"+"} ${num(a.mod,0)}</small><br/>
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
        <small>${esc((a.attrUsed||"QI").toUpperCase())} ${a.op==="mul"?"×":"+"} ${num(a.mod,0)}</small><br/>
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
    <div class="actions" style="margin-top:12px; justify-content:space-between">
      <button class="danger" id="delItem" style="${(idx==null || idx<0)?"display:none":""}">Apagar item</button>
      <div class="actions" style="gap:8px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  const delBtn = modal.querySelector("#delItem");
  if(delBtn) delBtn.onclick = async ()=>{
    if(idx==null || idx<0) return;
    if(!confirm(`Apagar o item "${(it.name||"Item")}"?`)) return;
    try{
      items.splice(idx,1);
      await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, { inventory: items, updatedAt: Date.now() });
      toast("Item apagado.","ok");
      modal.remove();
    }catch(err){ toast(String(err?.message||err),"error"); }
  };
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
        <label class="label">Operação</label>
        <select id="op">
          <option value="add">Somar</option>
          <option value="mul">Multiplicar</option>
        </select>
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
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
        <label class="label">Operação</label>
        <select id="op">
          <option value="add">Somar</option>
          <option value="mul">Multiplicar</option>
        </select>
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
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



function openCharBaseEditor(char){
  if(!isMaster() || !char) return;
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:95; background:rgba(15,20,32,.98); border:1px solid rgba(255,255,255,.12); padding:14px; border-radius:16px; width:420px; max-width:92vw";
  const at=char.attrs||{FOR:1,DEX:1,VIG:1,QI:1};
  modal.innerHTML=`
    <strong>Editar ficha (base)</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" value="${esc(char.name||"Ficha")}" />
    <label class="label" style="margin-top:10px">Atributos</label>
    <div class="grid2">
      <div><small class="mono">FOR (Força)</small><input id="aFOR" type="number" value="${num(at.FOR,1)}" /></div>
      <div><small class="mono">DEX (Destreza)</small><input id="aDEX" type="number" value="${num(at.DEX,1)}" /></div>
      <div><small class="mono">VIG (Vigor)</small><input id="aVIG" type="number" value="${num(at.VIG,1)}" /></div>
      <div><small class="mono">QI (Inteligência)</small><input id="aQI" type="number" value="${num(at.QI,1)}" /></div>
    </div>
    <label class="label" style="margin-top:10px">Mental</label>
    <input id="mn" type="number" value="${num(char.mental,0)}" />
    <small style="color:var(--muted)">Mental+: +1..+3 =&gt; +1 dado de HP ao descansar (nota). +4 =&gt; +5 em todos os dados. +5 =&gt; +3 em testes de DT (acumula). | Mental-: -8/-9 =&gt; -5 em todos dados/mods. -11 =&gt; vantagens desativadas pro player. -12 =&gt; penalidades + reflexo: a cada ataque sofre 2× o dano de volta.</small>
    <div class="actions" style="margin-top:12px">
      <button id="save">Salvar</button>
      <button class="secondary" id="cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  modal.querySelector("#save").onclick=async ()=>{
    const next={
      name: clampLen(modal.querySelector("#nm").value||"Ficha", 80),
      attrs:{
        FOR:num(modal.querySelector("#aFOR").value,1),
        DEX:num(modal.querySelector("#aDEX").value,1),
        VIG:num(modal.querySelector("#aVIG").value,1),
        QI:num(modal.querySelector("#aQI").value,1),
      },
      mental:num(modal.querySelector("#mn").value,0),
      updatedAt: Date.now()
    };
    await dbUpdate(`rooms/${roomId}/characters/${char.charId}`, next);
    toast("Ficha atualizada.","ok");
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
      <button class="secondary" data-tab="map">Mapa</button>
      <button class="secondary" data-tab="fog">Fog</button>
      <button class="secondary" data-tab="room">Mesa</button>
      <button class="secondary" data-tab="rolls">Rolagens</button>
      <button class="secondary" data-tab="logs">Logs</button>
      <button class="secondary" data-tab="data">Outros Dados</button>
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
window.addEventListener("keydown",(e)=>{
  // global keys
  if(e.key==="m"||e.key==="M") keyMDown=true;
  if(e.key==='`'){ dbgOn=!dbgOn; dbg.style.display=dbgOn?'block':'none'; }

  // GM-only clipboard / visibility controls
  const gm = isMaster();

  // delete/backspace: soft-hide token (keeps saved) OR remove ghost (visual)
  if(gm && (e.key==="Delete" || e.key==="Backspace")){
    if(!selectedTokenId) return;
    const t = tokens?.[selectedTokenId];
    if(t){
      // soft-hide by marking visible=false (keeps on DB)
      if(t.visible===false){
        toast("Token já está oculto. Use a lista do mestre para restaurar.");
      }else{
        dbUpdate(`rooms/${roomId}/tokens/${selectedTokenId}`, { visible:false }).catch(()=>{});
        toast("Token ocultado (não foi apagado).");
      }
      e.preventDefault();
    }
    return;
  }

  // Ctrl/Cmd combos (GM-only)
  const combo = (e.ctrlKey || e.metaKey);
  if(gm && combo){
    const k = (e.key||"").toLowerCase();

    // copy: visual duplicate source
    if(k==="c"){
      if(selectedTokenId && tokens?.[selectedTokenId]){
        tokenClipboard = { mode:"copy", baseId:selectedTokenId, tokenData: cloneTokenData(tokens[selectedTokenId]) };
        toast("Token copiado (visual).");
        e.preventDefault();
      }
      return;
    }
    // cut: move real token
    if(k==="x"){
      if(selectedTokenId && tokens?.[selectedTokenId]){
        tokenClipboard = { mode:"cut", baseId:selectedTokenId, tokenData: cloneTokenData(tokens[selectedTokenId]) };
        toast("Token recortado (mover).");
        e.preventDefault();
      }
      return;
    }
    // paste
    if(k==="v"){
      if(!tokenClipboard) return;

      const w = lastPointerWorld || {x:0,y:0};

            if(tokenClipboard.mode==="copy"){
        const src = tokenClipboard.tokenData;
        if(src){
          const n = cloneTokenData(src);
          // new token instance
          delete n.id;
          n.x = w.x; n.y = w.y;
          n.visible = (n.visible!==false);
          // push as real token in DB
          dbPush(`rooms/${roomId}/tokens`, n).then((newId)=>{
            if(newId){
              selectedTokenId = newId;
              toast("Token duplicado.");
            }
            mapRender();
          }).catch(()=>{ toast("Falha ao duplicar token.","error"); });
        }
        e.preventDefault();
        return;
      }

      if(tokenClipboard.mode==="cut"){
        const id = tokenClipboard.baseId;
        if(id && tokens?.[id]){
          dbUpdate(`rooms/${roomId}/tokens/${id}`, { x:w.x, y:w.y }).catch(()=>{});
          selectedTokenId = id;
          mapRender();
          toast("Token movido.");
        }
        tokenClipboard = null;
        e.preventDefault();
        return;
      }
    }
  }

  // C: center view on selected token (GM or player)
  if(e.key==="c" || e.key==="C"){
    let id = selectedTokenId;
    if(id && id.startsWith("ghost_")) id = null;
    if(!id){
      // try player's controlled token
      const my = (Object.entries(tokens||{}).find(([tid,t])=> (t?.ownerUid||"")===(auth?.currentUser?.uid||"")) || [null,null])[0];
      id = my;
    }
    if(id && tokens?.[id]){
      view.x = num(tokens[id].x,0);
      view.y = num(tokens[id].y,0);
    }else{
      view.x = 0; view.y = 0;
    }
    mapRender();
    e.preventDefault();
    return;
  }

  // T: cycle tokens (GM: all visible; player: only controlled)
  if(e.key==="t" || e.key==="T"){
    const uid = auth?.currentUser?.uid || "";
    const list = Object.entries(tokens||{})
      .filter(([id,t])=> !(t && t.visible===false) && !(t && t.inMarkerId))
      .filter(([id,t])=> gm ? true : (t?.ownerUid||"")===uid)
      .sort((a,b)=> (Number(a[1]?.z)||0) - (Number(b[1]?.z)||0))
      .map(([id])=>id);

    if(list.length){
      const curIdx = selectedTokenId ? list.indexOf(selectedTokenId) : -1;
      const next = list[(curIdx+1) % list.length];
      selectedTokenId = next;
      view.x = num(tokens[next].x,0);
      view.y = num(tokens[next].y,0);
      mapRender();
    }
    e.preventDefault();
    return;
  }
});
window.addEventListener("keyup",(e)=>{ if(e.key==="m"||e.key==="M") keyMDown=false; });
function setDbg(txt){ if(!dbgOn) return; dbg.textContent=txt; }

fab.onclick=()=>{ toolsState.open=!toolsState.open; syncToolsUI(); };

function tokenOptionsForSheets(selectedId){
  const opts = Object.values(characters||{}).map(c=>`<option value="${c.charId}" ${c.charId===selectedId?"selected":""}>${esc(c.name||c.charId)}</option>`).join("");
  return `<option value="">(nenhuma)</option>` + opts;
}
function playerOptions(selectedUid){
  const opts = Object.values(players||{}).map(p=>{
    const label = (p.nickname||p.name||"").trim() || p.uid;
    return `<option value="${p.uid}" ${p.uid===selectedUid?"selected":""}>${esc(label)}</option>`;
  }).join("");
  return `<option value="">(mestre)</option>` + opts;
}

async function deleteToken(tokenId){
  if(!isMaster()) return;
  const t=tokens?.[tokenId];
  const name=t?.name||"Token";
  if(!confirm(`Apagar token "${name}"? Isso remove do mapa e não pode ser desfeito.`)) return;
  try{
    await dbSet(`rooms/${roomId}/tokens/${tokenId}`, null);
    await addLog("token","Token apagado",{tokenId});
    toast("Token apagado.","ok");
  }catch(err){ toast(String(err?.message||err),"error"); }
}

async function createToken(){
  const tokenId = await dbPush(`rooms/${roomId}/tokens`, { tokenId:null, name:"Token", x:view.x+220, y:view.y+220, ownerUid:null, linkedCharId:null, spriteUrl:"", updatedAt: Date.now() });
  await dbUpdate(`rooms/${roomId}/tokens/${tokenId}`, { tokenId });
  toast("Token criado.", "ok");
}

async function openTokenEditor(tokenId){
  const t=tokens?.[tokenId];
  if(!t) return;
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

    <div style="display:flex; gap:10px; margin-top:10px">
      <div style="flex:1">
        <label class="label">Tamanho (scale)</label>
        <input id="tScale" type="number" step="0.05" min="0.1" value="${num(t.scale,1)}" />
      </div>
      <div style="flex:1">
        <label class="label">Camada (z)</label>
        <input id="tZ" type="number" step="1" value="${num(t.z,0)}" />
      </div>
    </div>

    <div class="actions" style="margin-top:10px">
      <input id="tFile" type="file" accept="image/*" />
      <button class="secondary" id="btnUp">Usar arquivo</button>
    </div>

    <div class="actions" style="margin-top:12px; justify-content:space-between">
      <button class="danger" id="delToken">Apagar token</button>
      <div class="actions" style="gap:8px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#cancel").onclick=()=>modal.remove();
  const delBtn = modal.querySelector("#delToken");
  if(delBtn) delBtn.onclick = async ()=>{ try{ await deleteToken(tokenId); modal.remove(); }catch(e){} };
  modal.querySelector("#btnUp").onclick = async ()=>{
  try{
    const file = modal.querySelector("#tFile")?.files?.[0];
    if(!file) throw new Error("Escolha um arquivo.");
    const dataUrl = await readFileAsDataURL(file);
    // Store directly (DataURL/base64) to keep GitHub Pages static & avoid external upload services.
    modal.querySelector("#tSprite").value = dataUrl;
    toast("Imagem carregada (Base64).","ok");
  }catch(err){ toast(String(err?.message||err),"error"); }
};
modal.querySelector("#tFile").onchange = ()=>{ modal.querySelector("#btnUp").click(); };
  modal.querySelector("#save").onclick = async ()=>{
    try{
      const owner = modal.querySelector("#tOwner").value || null;
      const sheet = modal.querySelector("#tSheet").value || null;
      if(!sheet) throw new Error("Escolha uma ficha.");
      const patch = {
        ownerUid: owner,
        linkedCharId: sheet,
        name: clampLen(modal.querySelector("#tName").value, 60),
        // IMPORTANT: do not truncate Base64 DataURLs; it breaks token images (ERR_INVALID_URL).
        spriteUrl: clampImageUrl(modal.querySelector("#tSprite").value, 420),
        scale: Math.max(0.1, num(modal.querySelector("#tScale").value, 1)),
        z: Math.trunc(num(modal.querySelector("#tZ").value, 0)),
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




async function deleteRoomWithSafeguard(){
  if(!isMaster()) return;
  const phrase = prompt("Para apagar a mesa, digite DELETE e confirme o RoomID:");
  if(phrase!=="DELETE") return toast("Cancelado.","info");
  const rid = prompt("Digite o RoomID para confirmar (exatamente):");
  if(rid!==roomId) return toast("RoomID incorreto.","error");
  if(!confirm("ÚLTIMA CONFIRMAÇÃO: apagar a mesa inteira? Isso é irreversível.")) return;
  await dbSet(`rooms/${roomId}`, null);
  await dbSet(`logs/${roomId}`, null);
  toast("Mesa apagada.","ok");
  location.href="index.html";
}
async function deleteCharacter(charId){
  if(!isMaster()) return;
  if(!charId) return;
  for(const [tid,t] of Object.entries(tokens||{})){
    if(t?.linkedCharId===charId){
      await dbUpdate(`rooms/${roomId}/tokens/${tid}`, { linkedCharId:null, updatedAt: Date.now() });
    }
  }
  for(const [uid,p] of Object.entries(players||{})){
    if(p?.characterId===charId){
      await dbUpdate(`rooms/${roomId}/players/${uid}`, { characterId:null });
    }
  }
  await dbSet(`rooms/${roomId}/characters/${charId}`, null);
  toast("Ficha apagada.","ok");
}
async function openCreateSheet(){
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:80; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:460px; max-width:92vw; max-height:82vh; overflow:auto";
  modal.innerHTML = `
    <strong>Criar ficha</strong>
    <label class="label" style="margin-top:10px">Nome</label>
    <input id="nm" placeholder="ex: NPC / Player" />

    <label class="label" style="margin-top:10px">Atributos</label>
    <div class="grid2">
      <div><small class="mono">FOR (Força)</small><input id="aFOR" type="number" value="1" /></div>
      <div><small class="mono">DEX (Destreza)</small><input id="aDEX" type="number" value="1" /></div>
      <div><small class="mono">VIG (Vigor)</small><input id="aVIG" type="number" value="1" /></div>
      <div><small class="mono">QI (Inteligência)</small><input id="aQI" type="number" value="1" /></div>
    </div>
    <small style="color:var(--muted)">Dica: Intenções=(VIG+DEX+1)/2, Movimento=DEX+3, Esquiva=DEX*2.</small>

    <label class="label" style="margin-top:10px">Mental</label>
    <input id="mn" type="number" value="0" />
    <small style="color:var(--muted)">Mental+: +1..+3 =&gt; +1 dado HP ao descansar. +4 =&gt; +5 em todos os dados. +5 =&gt; +3 em testes de DT (acumula). | Mental-: -8/-9 =&gt; -5 em tudo. -11 =&gt; desliga vantagens. -12 =&gt; penalidades + reflexo 2× dano.</small>

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
      <label class="label" style="margin-top:10px">Operação do modificador</label>
      <select id="op">
        <option value="add">Somar (padrão)</option>
        <option value="mul">Multiplicar (ex: 2 dobra)</option>
      </select>
      <label class="label" style="margin-top:10px">Atributo (soma no dano)</label>
      ${attrSelectHtml("at", (obj.attrUsed||"FOR").toUpperCase())}
      <div class="actions" style="margin-top:12px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector("#cancel").onclick=()=>box.remove();
    box.querySelector("#op").value = (obj.op||"add");
    box.querySelector("#save").onclick=()=>{
      obj.name = clampLen(box.querySelector("#nm").value||"Item", 60);
      obj.desc = clampLen(box.querySelector("#ds").value||"", 220);
      obj.kg   = num(box.querySelector("#kg").value, 0);
      obj.mod  = num(box.querySelector("#md").value, 0);
      obj.op = (box.querySelector("#op").value||"add");
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
      <label class="label" style="margin-top:10px">Operação do modificador</label>
      <select id="op">
        <option value="add">Somar (padrão)</option>
        <option value="mul">Multiplicar (ex: 2 dobra)</option>
      </select>
      <label class="label" style="margin-top:10px">Atributo (soma se mod &gt; 0)</label>
      ${attrSelectHtml("at", (obj.attrUsed||"QI").toUpperCase())}
      <div class="actions" style="margin-top:12px">
        <button id="save">Salvar</button>
        <button class="secondary" id="cancel">Cancelar</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector("#cancel").onclick=()=>box.remove();
    box.querySelector("#op").value = (obj.op||"add");
    box.querySelector("#save").onclick=()=>{
      obj.name = clampLen(box.querySelector("#nm").value||title, 60);
      obj.desc = clampLen(box.querySelector("#ds").value||"", 240);
      obj.mod  = num(box.querySelector("#md").value, 0);
      obj.dt   = num(box.querySelector("#dt").value, 9);
      obj.op = (box.querySelector("#op").value||"add");
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
        <div><strong>${esc(it.name)}</strong><br/><small>${esc(it.attrUsed)} ${it.op==="mul"?"×":"+"} ${num(it.mod,0)} | ${num(it.kg,0)}kg</small><br/><small style="color:var(--muted)">${esc(it.desc||"")}</small></div>
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



function getCharById(charId){
  if(!charId) return null;
  return (characters && characters[charId]) ? characters[charId] : null;
}

function syncToolsUI(){
  fab.style.display = isMaster() ? "block" : "none";
  const tools = ensureToolsPopup();
  if(!isMaster()){ tools.style.display="none"; return; }
  tools.style.display = toolsState.open ? "block" : "none";
  if(!toolsState.open) return;

  const body = tools.querySelector("#mtBody");
  const tab = toolsState.tab || "tokens";

  // ---------- TOKENS ----------
  if(tab==="tokens"){
    body.innerHTML = `
      <div class="card pad">
        <div class="actions" style="justify-content:space-between; align-items:center">
          <strong>Tokens</strong>
          <button class="secondary" id="mkToken">Criar token</button>
        </div>
        <div id="tokList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list = body.querySelector("#tokList");
    const entries = Object.entries(tokens||{});
    if(entries.length===0){
      list.innerHTML = `<small style="color:var(--muted)">Nenhum token ainda.</small>`;
    }else{
      entries.forEach(([id,t])=>{
        const row=document.createElement("div");
        row.style.cssText="display:flex; gap:8px; align-items:center; justify-content:space-between; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        row.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0">
            <strong style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(t?.name||"Token")}</strong>
            <small style="color:var(--muted)">Ficha: ${esc(getCharById(t?.linkedCharId||"")?.name||"—")} • Player: ${esc(players?.[t?.ownerUid]?.nickname||"—")}</small>
          </div>
          <div class="actions" style="gap:6px; flex-wrap:wrap; justify-content:flex-end">
            <button class="secondary" data-open="${id}">Editar</button>
            <button class="secondary" data-sheet="${id}">Abrir ficha</button>
            <button class="danger" data-del="${id}">Apagar</button>
          </div>
        `;
        // click row: restore if hidden, otherwise select
        row.addEventListener("click",(ev)=>{
          if(ev.target && ev.target.closest && ev.target.closest("button")) return;
          if(t && t.visible===false){
            dbUpdate(`rooms/${roomId}/tokens/${id}`, { visible:true }).catch(()=>{});
            toast("Token restaurado.");
          }else{
            selectedTokenId = id;
            mapRender();
          }
        });
        if(t && t.visible===false){
          row.style.opacity = "0.55";
          const st = row.querySelector("strong");
          if(st) st.textContent = (st.textContent||"Token") + " (oculto)";
          // replace delete button label to "Apagar" still (hard delete), but add a restore hint
        }
        list.appendChild(row);
      });
      list.querySelectorAll("[data-open]").forEach(b=> b.onclick=()=>openTokenEditor(b.dataset.open));
      list.querySelectorAll("[data-sheet]").forEach(b=> b.onclick=()=>openSheetWindow(b.dataset.sheet));
      list.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>deleteToken(b.dataset.del));
    }
    const btn = body.querySelector("#mkToken");
    if(btn) btn.onclick=createToken;
    return;
  }

  // ---------- FICHAS ----------
  if(tab==="sheets"){
    body.innerHTML = `
      <div class="card pad">
        <div class="actions" style="justify-content:space-between; align-items:center">
          <strong>Fichas</strong>
          <button class="secondary" id="mkSheet">Criar ficha</button>
        </div>
        <div id="shList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list = body.querySelector("#shList");
    const entries = Object.entries(characters||{});
    if(entries.length===0){
      list.innerHTML = `<small style="color:var(--muted)">Nenhuma ficha ainda.</small>`;
    }else{
      entries.forEach(([cid,c])=>{
        const row=document.createElement("div");
        row.style.cssText="display:flex; gap:8px; align-items:center; justify-content:space-between; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        row.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0">
            <strong style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(c?.name||"Ficha")}</strong>
            <small style="color:var(--muted)">ID: ${esc(cid)}</small>
          </div>
          <div class="actions" style="gap:6px; flex-wrap:wrap; justify-content:flex-end">
            <button class="secondary" data-del="${cid}">Apagar</button>
          </div>
        `;
        list.appendChild(row);
      });
      list.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>deleteCharacter(b.dataset.del));
    }
    const btn = body.querySelector("#mkSheet");
    if(btn) btn.onclick=openCreateSheet;
    return;
  }

  // ---------- PLAYERS ----------
  if(tab==="players"){
    body.innerHTML = `
      <div class="card pad">
        <strong>Players</strong>
        <div id="plList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list = body.querySelector("#plList");
    const entries = Object.entries(players||{});
    if(entries.length===0){
      list.innerHTML = `<small style="color:var(--muted)">Ninguém entrou ainda.</small>`;
    }else{
      entries.forEach(([uid,p])=>{
        const row=document.createElement("div");
        row.style.cssText="display:flex; gap:8px; align-items:center; justify-content:space-between; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        row.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px">
            <strong style="font-size:13px">${esc(p?.nickname||p?.email||uid)}</strong>
            <small style="color:var(--muted)">Role: ${esc(p?.role||"player")} • conectado: ${p?.connected? "sim":"não"}</small>
          </div>
        `;
        list.appendChild(row);
      });
    }
    return;
  }

  // ---------- MARCOS ----------
  if(tab==="markers"){
    body.innerHTML = `
      <div class="card pad">
        <div class="actions" style="justify-content:space-between; align-items:center">
          <strong>Marcos</strong>
          <small style="color:var(--muted)">Crie no mapa: clique direito (mestre)</small>
        </div>
        <div id="mkList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list = body.querySelector("#mkList");
    const entries = Object.entries(markers||{});
    if(entries.length===0){
      list.innerHTML = `<small style="color:var(--muted)">Nenhum marco ainda.</small>`;
    }else{
      entries.forEach(([id,m])=>{
        const row=document.createElement("div");
        row.style.cssText="display:flex; gap:8px; align-items:center; justify-content:space-between; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        row.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px">
            <strong style="font-size:13px">${esc(m?.title||"Marco")}</strong>
            <small style="color:var(--muted)">Itens: ${(m?.items||[]).length} • Tokens presos: ${(m?.tokenIds||[]).length}</small>
          </div>
          <div class="actions" style="gap:6px">
            <button class="secondary" data-open="${id}">Abrir</button>
          </div>
        `;
        list.appendChild(row);
      });
      list.querySelectorAll("[data-open]").forEach(b=> b.onclick=()=>openMarkerPopup(b.dataset.open));
    }
    return;
  }

  // ---------- MAPA ----------
  if(tab==="map"){
    const bgUrl = room?.settings?.map?.bgUrl || "";
    body.innerHTML = `
      <div class="card pad">
        <strong>Mapa</strong>
        <p style="margin:8px 0; color:var(--muted)">Imagem de fundo para todos.</p>

        <label class="label" style="margin-top:10px">URL (opcional)</label>
        <div class="actions" style="gap:8px">
          <input id="bgUrl" style="flex:1" placeholder="https://..." value="${esc(bgUrl.startsWith("data:") ? "" : bgUrl)}" />
          <button class="secondary" id="bgSave">Salvar</button>
        </div>

        <div class="actions" style="margin-top:10px">
          <input id="bgFile" type="file" accept="image/*" />
          <button class="secondary" id="bgUpload">Upload (Base64)</button>
        </div>

        <small style="color:var(--muted)">Dica: prefira imagens leves (Base64 pesa mais).</small>
      </div>
    `;
    const bgSave = body.querySelector("#bgSave");
    const bgUpload = body.querySelector("#bgUpload");
    if(bgSave) bgSave.onclick = async ()=>{
      try{
        const u = sanitizeImageUrlInput((body.querySelector("#bgUrl")?.value||""));
        await dbUpdate(`rooms/${roomId}/settings/map`, { bgUrl: u });
        toast("Mapa atualizado.","ok");
      }catch(e){ toast(String(e?.message||e),"error"); }
    };
    if(bgUpload) bgUpload.onclick = async ()=>{
      const f = body.querySelector("#bgFile")?.files?.[0];
      if(!f) return toast("Escolha um arquivo.","error");
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
    body.innerHTML = `
      <div class="card pad">
        <strong>Mesa</strong>
        <p style="margin:8px 0; color:var(--muted)">Ferramentas gerais.</p>

        <div class="actions" style="margin-top:12px">
          <button class="secondary" id="btnClearRolls">Limpar rolagens</button>
          <button class="secondary" id="btnClearLogs">Limpar logs</button>
        </div>
      </div>

      <div class="card pad" style="margin-top:10px">
        <strong>Perigo</strong>
        <p style="margin:8px 0; color:var(--muted)">Apagar a mesa remove tudo.</p>
        <button class="danger" id="btnDeleteRoom">Apagar mesa</button>
      </div>
    `;
    const del = body.querySelector("#btnDeleteRoom");
    if(del) del.onclick=deleteRoomWithSafeguard;
    const cr = body.querySelector("#btnClearRolls");
    if(cr) cr.onclick=async ()=>{
      if(!confirm("Limpar rolagens?")) return;
      await dbSet(`rooms/${roomId}/rolls`, null);
      toast("Rolagens limpas.","ok");
    };
    const cl = body.querySelector("#btnClearLogs");
    if(cl) cl.onclick=async ()=>{
      if(!confirm("Limpar logs?")) return;
      await dbSet(`logs/${roomId}`, null);
      toast("Logs limpos.","ok");
    };
    return;
  }

  // ---------- ROLAGENS ----------
  if(tab==="rolls"){
    body.innerHTML = `
      <div class="card pad">
        <strong>Rolagens</strong>
        <div id="rl" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list=body.querySelector("#rl");
    const entries = Object.values(rolls||{}).sort((a,b)=>(b.ts||b.timestamp||0)-(a.ts||a.timestamp||0)).slice(0,80);
    if(entries.length===0) list.innerHTML = `<small style="color:var(--muted)">Sem rolagens.</small>`;
    else{
      entries.forEach(r=>{
        const div=document.createElement("div");
        div.style.cssText="padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        div.innerHTML = `<strong style="font-size:13px">${esc(r.label||r.expr||"Roll")}</strong>
          <div class="mono" style="margin-top:6px; color:var(--muted)">${esc(String(r.total ?? (r.results?JSON.stringify(r.results):"")))}</div>`;
        list.appendChild(div);
      });
    }
    return;
  }

  // ---------- LOGS ----------
  if(tab==="logs"){
    body.innerHTML = `
      <div class="card pad">
        <strong>Logs</strong>
        <div id="lg" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
      </div>
    `;
    const list=body.querySelector("#lg");
    const entries = Object.values(logs||{}).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,120);
    if(entries.length===0) list.innerHTML = `<small style="color:var(--muted)">Sem logs.</small>`;
    else{
      entries.forEach(e=>{
        const div=document.createElement("div");
        div.style.cssText="padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.03)";
        div.innerHTML = `<strong style="font-size:13px">${esc(e.type||"log")}</strong>
          <div style="margin-top:4px">${esc(e.message||"")}</div>`;
        list.appendChild(div);
      });
    }
    return;
  }


  // ---------- OUTROS DADOS ----------
  if(tab==="data"){
    const summary = {
      roomId,
      roomName: room?.roomMeta?.name || "",
      masterUid: room?.masterUid || "",
      players: Object.keys(players||{}).length,
      tokens: Object.keys(tokens||{}).length,
      fichas: Object.keys(characters||{}).length,
      marcos: Object.keys(markers||{}).length,
      rolls: Object.keys(rolls||{}).length,
      logs: Object.keys(logs||{}).length
    };
    body.innerHTML = `
      <div class="card pad">
        <strong>Outros dados</strong>
        <p style="margin:8px 0; color:var(--muted)">Resumo e diagnóstico (somente leitura).</p>
        <pre style="white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.08); padding:10px; border-radius:12px;">${esc(JSON.stringify(summary, null, 2))}</pre>
      </div>
    `;
    return;
  }

  body.innerHTML = `<small style="color:var(--muted)">Selecione uma aba.</small>`;
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
      div.innerHTML = `<div class="actions" style="justify-content:space-between; gap:10px">
        <div style="flex:1; min-width:0; cursor:pointer" data-edit="${idx}">
          <strong>${esc(it.name||"Item")}</strong><br/>
          <small>${esc((it.attrUsed||"FOR").toUpperCase())} + ${num(it.mod,0)} | ${num(it.kg,0)}kg</small>
        </div>
        <div class="actions" style="gap:8px">
          <button class="secondary" data-editbtn="${idx}">Editar</button>
          <button class="danger" data-del="${idx}">Del</button>
        </div>
      </div>`;
      const open = ()=>openMarkerItemEditor(idx);
      div.querySelector("[data-edit]").onclick = open;
      div.querySelector("[data-editbtn]").onclick = open;
      div.querySelector("[data-del]").onclick=()=>{ items.splice(idx,1); renderItemList(); };
      root.appendChild(div);
    });
  };


  function openMarkerItemEditor(idx){
    const base = (idx==null || idx<0) ? { id:`mk_it_${Date.now()}`, name:"Item", desc:"", kg:1, mod:0, attrUsed:"FOR" } : { ...(items[idx]||{}) };
    const modal=document.createElement("div");
    modal.style.cssText="position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:90; background:rgba(15,20,32,.97); border:1px solid rgba(255,255,255,.10); padding:14px; border-radius:16px; width:380px; max-width:92vw";
    modal.innerHTML = `
      <strong>${(idx==null || idx<0)?"Novo item do marco":"Editar item do marco"}</strong>
      <label class="label" style="margin-top:10px">Nome</label>
      <input id="nm" value="${esc(base.name||"")}" />
      <label class="label" style="margin-top:10px">Descrição</label>
      <input id="ds" value="${esc(base.desc||"")}" />
      <div class="grid2" style="margin-top:10px">
        <div>
          <label class="label">Peso (kg)</label>
          <input id="kg" type="number" value="${num(base.kg,0)}" />
        </div>
        <div>
          <label class="label">Mod. dano</label>
          <input id="md" type="number" value="${num(base.mod,0)}" />
        </div>
      </div>
      <label class="label" style="margin-top:10px">Atributo usado</label>
      ${attrSelectHtml("at", (base.attrUsed||"FOR").toUpperCase())}
      <div class="actions" style="margin-top:12px; justify-content:space-between">
        <button class="danger" id="delItem" style="${(idx==null || idx<0)?"display:none":""}">Apagar item</button>
        <div class="actions" style="gap:8px">
          <button id="saveIt">Salvar</button>
          <button class="secondary" id="cancelIt">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#cancelIt").onclick=()=>modal.remove();
    const delBtn=modal.querySelector("#delItem");
    if(delBtn) delBtn.onclick=()=>{
      if(idx==null || idx<0) return;
      if(!confirm(`Apagar o item "${(base.name||"Item")}" do marco?`)) return;
      items.splice(idx,1);
      renderItemList();
      modal.remove();
    };
    modal.querySelector("#saveIt").onclick=()=>{
      base.name = clampLen(modal.querySelector("#nm").value, 60);
      base.desc = clampLen(modal.querySelector("#ds").value, 140);
      base.kg = num(modal.querySelector("#kg").value, 0);
      base.mod = num(modal.querySelector("#md").value, 0);
      base.attrUsed = (modal.querySelector("#at").value||"FOR").toUpperCase();
      if(idx==null || idx<0) items.push(base);
      else items[idx]=base;
      renderItemList();
      modal.remove();
    };
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

  box.querySelector("#addItem").onclick=()=>{ openMarkerItemEditor(-1); };

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
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result||""));
    r.onerror=()=>reject(new Error("Falha ao ler arquivo."));
    r.readAsDataURL(file);
  });
}

// === EOF marker: BUILD_ID 63 ===
