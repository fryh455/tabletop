import { updateRoom } from "../../db/rooms.js";
import { state } from "../../core/state.js";

export function drawFog(ctx, w, h, fog){
  if (!fog?.enabled) return;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0,0,w,h);
  // reveal cells in fog.mask (array of rects)
  ctx.globalCompositeOperation="destination-out";
  for (const r of (fog.mask||[])){
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

export async function toggleFog(){
  const roomId=state.roomId;
  const enabled = !state.room?.fog?.enabled;
  await updateRoom(roomId, { "fog.enabled": enabled });
}

export async function revealRect(rect){
  const roomId=state.roomId;
  const fog = state.room?.fog || { enabled:false, mask:[] };
  const mask = [...(fog.mask||[]), rect];
  await updateRoom(roomId, { "fog.mask": mask });
}

export async function clearFog(){
  const roomId=state.roomId;
  await updateRoom(roomId, { "fog.mask": [] });
}
