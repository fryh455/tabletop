// Exports: converterCoordenadasTelaParaGrid, calcularMovimento, colisaoValida
export function converterCoordenadasTelaParaGrid(x, y, tileSize = 32) {
  const gx = Math.floor(x / tileSize);
  const gy = Math.floor(y / tileSize);
  return { gx, gy };
}

export function calcularMovimento(token, destino, tileSize = 32) {
  // Simple straight-line grid steps (Manhattan)
  const steps = [];
  const sx = Math.floor(token.posicao.x);
  const sy = Math.floor(token.posicao.y);
  const dx = Math.floor(destino.x);
  const dy = Math.floor(destino.y);
  let cx = sx;
  let cy = sy;
  while (cx !== dx || cy !== dy) {
    if (cx < dx) cx++;
    else if (cx > dx) cx--;
    else if (cy < dy) cy++;
    else if (cy > dy) cy--;
    steps.push({ x: cx, y: cy });
    if (steps.length > 1000) break;
  }
  return steps;
}

export function colisaoValida(token, destino, mapaColisao = null) {
  // [ASSUNÇÃO] mapaColisao opcional grid booleano
  if (!mapaColisao) return true;
  const x = Math.floor(destino.x);
  const y = Math.floor(destino.y);
  if (!mapaColisao[y]) return true;
  return !mapaColisao[y][x];
}