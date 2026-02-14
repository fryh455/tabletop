import { $ } from "../utils/dom.js";
import { state } from "../state.js";
import { renderTokens, hitTestToken, moveKnowinglyAllowed } from "./tokens.js";

export function mountTabletop(){
  const canvas=$("#tabletop-canvas");
  const ctx=canvas.getContext("2d");
  const btnSnap=$("#btn-snap");
  const btnZoomReset=$("#btn-zoom-reset");

  let zoom=1, panX=0, panY=0;
  let isPanning=false;
  let draggingTokenId=null;
  let dragOffset={x:0,y:0};

  function resizeToCSS(){
    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const w=Math.max(600,Math.floor(rect.width*dpr));
    const h=Math.max(400,Math.floor(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
    ctx.imageSmoothingEnabled=true;
  }

  function worldToScreen(wx,wy){ return {x:(wx+panX)*zoom, y:(wy+panY)*zoom}; }
  function screenToWorld(sx,sy){ return {x:(sx/zoom)-panX, y:(sy/zoom)-panY}; }

  function drawGrid(){
    const grid=state.ui.gridSize;
    const step=grid*zoom;
    if(step<18) return;

    ctx.save();
    ctx.strokeStyle="rgba(255,255,255,0.05)";
    ctx.lineWidth=1;

    const W=canvas.width, H=canvas.height;
    const start=screenToWorld(0,0);
    const end=screenToWorld(W,H);

    const x0=Math.floor(start.x/grid)*grid;
    const y0=Math.floor(start.y/grid)*grid;

    for(let x=x0;x<end.x+grid;x+=grid){
      const s=worldToScreen(x,start.y);
      ctx.beginPath(); ctx.moveTo(s.x,0); ctx.lineTo(s.x,H); ctx.stroke();
    }
    for(let y=y0;y<end.y+grid;y+=grid){
      const s=worldToScreen(start.x,y);
      ctx.beginPath(); ctx.moveTo(0,s.y); ctx.lineTo(W,s.y); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(){
    resizeToCSS();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawGrid();
    renderTokens(ctx,{worldToScreen,zoom});
    requestAnimationFrame(draw);
  }

  function clampZoom(z){ return Math.min(2.5,Math.max(0.35,z)); }
  function setSnap(on){ state.ui.snapToGrid=!!on; btnSnap.dataset.on=on?"1":"0"; btnSnap.textContent=on?"Snap: ON":"Snap: OFF"; }

  btnSnap.addEventListener("click",()=>setSnap(!state.ui.snapToGrid));
  btnZoomReset.addEventListener("click",()=>{ zoom=1; panX=0; panY=0; });

  canvas.addEventListener("wheel",(e)=>{
    e.preventDefault();
    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const sx=(e.clientX-rect.left)*dpr;
    const sy=(e.clientY-rect.top)*dpr;

    const before=screenToWorld(sx,sy);
    const delta=Math.sign(e.deltaY);
    const factor=delta>0?0.9:1.1;
    zoom=clampZoom(zoom*factor);
    const after=screenToWorld(sx,sy);

    panX += (after.x - before.x);
    panY += (after.y - before.y);
  },{passive:false});

  canvas.addEventListener("mousedown",(e)=>{
    if(!state.session) return;

    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const sx=(e.clientX-rect.left)*dpr;
    const sy=(e.clientY-rect.top)*dpr;

    if(e.button===0 && e.shiftKey){ isPanning=true; canvas.style.cursor="grabbing"; return; }

    const w=screenToWorld(sx,sy);
    const hit=hitTestToken(w.x,w.y);
    if(hit){
      state.ui.selectedTokenId=hit.id;
      window.dispatchEvent(new CustomEvent("app:token:selected",{detail:hit.id}));
      if(moveKnowinglyAllowed(hit)){
        draggingTokenId=hit.id;
        dragOffset.x=w.x-hit.x;
        dragOffset.y=w.y-hit.y;
      }
    } else {
      state.ui.selectedTokenId=null;
      window.dispatchEvent(new CustomEvent("app:token:selected",{detail:null}));
    }
  });

  window.addEventListener("mouseup",()=>{ isPanning=false; draggingTokenId=null; canvas.style.cursor="default"; });

  window.addEventListener("mousemove",(e)=>{
    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const sx=(e.clientX-rect.left)*dpr;
    const sy=(e.clientY-rect.top)*dpr;

    if(isPanning){
      const mx=(e.movementX||0)*dpr;
      const my=(e.movementY||0)*dpr;
      panX += mx/zoom;
      panY += my/zoom;
      return;
    }

    if(draggingTokenId){
      const w=screenToWorld(sx,sy);
      const token=state.room.tokens.find(t=>t.id===draggingTokenId);
      if(!token) return;

      let nx=w.x-dragOffset.x, ny=w.y-dragOffset.y;
      if(state.ui.snapToGrid){
        const g=state.ui.gridSize;
        nx=Math.round(nx/g)*g;
        ny=Math.round(ny/g)*g;
      }
      token.x=nx; token.y=ny; token.updatedAt=Date.now();
    }
  });

  draw();
}
