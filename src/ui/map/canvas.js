import { el, toast } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { drawGrid } from "./grid.js";
import { clear } from "./layers.js";
import { drawFog, toggleFog, revealRect, clearFog } from "./fog.js";
import { makeDragController } from "./drag.js";

export function renderMapPanel(root){
  const card=el("div",{class:"card stack gap-8"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Mapa"]),
      el("div",{class:"row gap-8"},[
        el("button",{class:"btn secondary small", onclick: async ()=>{
          try { await toggleFog(); toast("Fog alterado."); } catch(e){ toast(e.message,"error"); }
        }},["Fog ON/OFF (master)"]),
        el("button",{class:"btn secondary small", onclick: async ()=>{
          try { await clearFog(); toast("Fog limpo."); } catch(e){ toast(e.message,"error"); }
        }},["Limpar revelações (master)"]),
      ])
    ]),
    el("p",{class:"muted"},["Arraste tokens no canvas. Grid ativo. Fog controlado pelo master."])
  ]);

  const wrap=el("div",{class:"map-wrap"},[]);
  const canvas=el("canvas",{class:"map-canvas", width:"1200", height:"720"});
  wrap.appendChild(canvas);
  card.appendChild(wrap);
  root.appendChild(card);

  const ctx=canvas.getContext("2d");
  ctx.strokeStyle="#fff";
  ctx.fillStyle="#fff";

  // camera/zoom simples
  let zoom=1;
  const toWorld=(sx,sy)=>({ x: sx/zoom, y: sy/zoom });
  const fromWorld=(wx,wy)=>({ x: wx*zoom, y: wy*zoom });

  const drag = makeDragController({ canvas, toWorld, fromWorld, onSelect:(t)=> {
    toast(`Token: ${t.name||t.id}`);
  }});

  canvas.addEventListener("wheel",(e)=>{
    e.preventDefault();
    zoom = Math.max(0.5, Math.min(2.0, zoom + (e.deltaY>0?-0.05:0.05)));
    render();
  }, {passive:false});

  canvas.addEventListener("dblclick", async (e)=>{
    // master: revela um retângulo de 2x2 células ao duplo clique
    if (state.player?.role !== "master") return;
    const p = toWorld(e.offsetX,e.offsetY);
    const size = (state.room?.map?.gridSize||48);
    const rect = { x: Math.floor(p.x/size)*size, y: Math.floor(p.y/size)*size, w: size*2, h: size*2 };
    try { await revealRect(rect); toast("Área revelada."); } catch(err){ toast(err.message,"error"); }
  });

  function render(){
    const w=canvas.width, h=canvas.height;
    ctx.save();
    ctx.setTransform(zoom,0,0,zoom,0,0);
    clear(ctx, w/zoom, h/zoom);

    drawGrid(ctx, w/zoom, h/zoom, state.room?.map?.gridSize||48, 1);

    // tokens
    for (const t of state.tokens){
      const x=t.x||100, y=t.y||100, r=t.r||24;
      ctx.save();
      if (t.spriteUrl){
        const img = t.__img || new Image();
        if (!t.__img){ img.src=t.spriteUrl; t.__img=img; img.onload=()=>render(); }
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.closePath();
        ctx.save(); ctx.clip(); ctx.drawImage(img, x-r, y-r, r*2, r*2); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=0.9;
      ctx.fillText(t.name||"token", x-r, y+r+14);
      ctx.restore();
    }

    drawFog(ctx, w/zoom, h/zoom, state.room?.fog);

    ctx.restore();
  }

  render();
  window.addEventListener("sur4:tokens", render);
  window.addEventListener("sur4:room", render);
}
