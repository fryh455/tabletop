import { updateToken } from "../../db/tokens.js";
import { state } from "../../core/state.js";

export function makeDragController({ canvas, toWorld, fromWorld, onSelect }){
  let dragging=null;

  canvas.addEventListener("mousedown", (e)=>{
    const pos = toWorld(e.offsetX, e.offsetY);
    const hit = hitToken(pos.x, pos.y);
    if (hit){
      dragging = { tokenId: hit.id, dx: pos.x-hit.x, dy: pos.y-hit.y };
      onSelect?.(hit);
    }
  });

  window.addEventListener("mouseup", ()=> dragging=null);
  canvas.addEventListener("mousemove", async (e)=>{
    if (!dragging) return;
    const pos = toWorld(e.offsetX, e.offsetY);
    const x = pos.x - dragging.dx;
    const y = pos.y - dragging.dy;
    // atualiza no firestore (throttle simples)
    if (!canvas.__lastDrag || Date.now()-canvas.__lastDrag>60){
      canvas.__lastDrag=Date.now();
      await updateToken(state.roomId, dragging.tokenId, { x, y });
    }
  });

  function hitToken(x,y){
    for (const t of state.tokens){
      const r = (t.r || 24);
      if (Math.hypot((t.x||0)-x, (t.y||0)-y) <= r) return t;
    }
    return null;
  }

  return { hitToken };
}
