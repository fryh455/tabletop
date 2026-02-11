import { ref, onValue, update } from '../../db/firebase.js';

let canvasEl=null, ctx=null, roomId=null, tokensCache={};
let dragging=null, dragOffset={x:0,y:0};

export function initMapCanvas(canvasElement, rId){
  canvasEl = canvasElement;
  roomId = rId;
  if(!canvasEl) return;
  ctx = canvasEl.getContext('2d');
  canvasEl.addEventListener('mousedown', onMouseDown);
  canvasEl.addEventListener('mousemove', onMouseMove);
  canvasEl.addEventListener('mouseup', onMouseUp);
  canvasEl.addEventListener('touchstart', onTouchStart, {passive:false});
  listenTokens();
}

function listenTokens(){
  if(!roomId) return;
  const tokensRef = ref(window.firebaseDatabase, `/rooms/${roomId}/tokens`);
  onValue(tokensRef, snap => {
    const tokens = snap.val()||{};
    tokensCache = tokens;
    drawTokens(Object.values(tokens));
  });
}

export function drawTokens(tokens){
  if(!ctx || !canvasEl) return;
  ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
  tokens.forEach(t=>{
    const x = t.x||100, y=t.y||100, size=48;
    if(t.spriteUrl){
      const img = new Image();
      img.crossOrigin='anonymous';
      img.onload = ()=> ctx.drawImage(img, x-size/2, y-size/2, size, size);
      img.src = t.spriteUrl;
    } else {
      ctx.fillStyle='#7a7'; ctx.fillRect(x-24,y-24,48,48);
      ctx.fillStyle='#000'; ctx.fillText(t.tokenId||'T', x-6, y+4);
    }
  });
}

function getMousePos(e){
  const rect = canvasEl.getBoundingClientRect();
  const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
  const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function onMouseDown(e){
  const pos = getMousePos(e);
  for(const k in tokensCache){
    const t = tokensCache[k];
    const dx = pos.x - (t.x||0), dy = pos.y - (t.y||0);
    if(Math.abs(dx) < 24 && Math.abs(dy) < 24){
      dragging = t; dragOffset.x = dx; dragOffset.y = dy; break;
    }
  }
}

function onMouseMove(e){
  if(!dragging) return;
  const pos = getMousePos(e);
  const nx = pos.x - dragOffset.x, ny = pos.y - dragOffset.y;
  // preview
  drawTokens([Object.assign({}, dragging, {x:nx,y:ny}), ...Object.values(tokensCache).filter(t=>t.tokenId!==dragging.tokenId)]);
}

function onMouseUp(e){
  if(!dragging) return;
  const pos = getMousePos(e);
  const nx = pos.x - dragOffset.x, ny = pos.y - dragOffset.y;
  const tokenId = dragging.tokenId;
  if(roomId && tokenId){
    const tokenRef = ref(window.firebaseDatabase, `/rooms/${roomId}/tokens/${tokenId}`);
    update(tokenRef, { x: nx, y: ny });
  }
  dragging = null;
}

function onTouchStart(e){ e.preventDefault(); onMouseDown(e); }
