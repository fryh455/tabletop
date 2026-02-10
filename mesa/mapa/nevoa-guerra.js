// Exports: atualizarFog, obterFogVisivelPara
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const db = () => getDatabase();

export async function atualizarFog(mesaId, mask) {
  // mestre grava máscara (mask: any serializável)
  await set(ref(db(), `/mesas/${mesaId}/mapa/nevoa`), { mask, atualizado_em: new Date().toISOString() });
  return { sucesso: true };
}

export async function obterFogVisivelPara(mesaId, usuarioId) {
  const snap = await get(ref(db(), `/mesas/${mesaId}/mapa/nevoa`));
  if (!snap.exists()) return null;
  const fog = snap.val();
  // client-side filtering: retorna máscara filtrada conforme permissões
  // [ASSUNÇÃO] política de visibilidade simples: se usuário é mestre, retorna tudo
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId === usuarioId) return fog;
  // caso jogador, aplicar filtro (exemplo: apenas mask.visiveis[usuarioId])
  if (fog && fog.visiveis && fog.visiveis[usuarioId]) {
    return { mask: fog.visiveis[usuarioId] };
  }
  return null;
}