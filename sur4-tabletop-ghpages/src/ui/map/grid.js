export function drawGrid(ctx, w, h, size=48, zoom=1){
  const step = size * zoom;
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let x=0; x<=w; x+=step){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
  }
  for (let y=0; y<=h; y+=step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.restore();
}
