// Exports: criarToken, apagarToken, moverToken, salvarTokenEmMarco
import { getDatabase, ref, push, remove, update, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

function tokenPath(mesaId) { return `/mesas/${mesaId}/tokens`; }

export async function criarToken(mesaId, tokenData) {
  const usuarioId = auth().currentUser?.uid;
  if (!usuarioId) throw new Error("Autenticação requerida");
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode criar token");
  const novo = push(ref(db(), tokenPath(mesaId)));
  const tokenId = novo.key;
  const payload = {
    ...tokenData,
    criado_em: new Date().toISOString(),
    criado_por: usuarioId
  };
  await set(ref(db(), `${tokenPath(mesaId)}/${tokenId}`), payload);
  return { tokenId };
}

export async function apagarToken(mesaId, tokenId) {
  const usuarioId = auth().currentUser?.uid;
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode apagar token");
  await remove(ref(db(), `${tokenPath(mesaId)}/${tokenId}`));
  return { sucesso: true };
}

export async function moverToken(mesaId, tokenId, posicao) {
  const usuarioId = auth().currentUser?.uid;
  const tokenSnap = await get(ref(db(), `${tokenPath(mesaId)}/${tokenId}`));
  if (!tokenSnap.exists()) throw new Error("Token não existe");
  const token = tokenSnap.val();
  const mestreId = (await get(ref(db(), `/mesas/${mesaId}`))).val()?.mestre_id;
  if (mestreId !== usuarioId && token.vinculadoUsuarioId !== usuarioId) throw new Error("Permissão negada");
  await update(ref(db(), `${tokenPath(mesaId)}/${tokenId}`), { posicao, atualizado_em: new Date().toISOString() });
  return { sucesso: true };
}

export async function salvarTokenEmMarco(mesaId, tokenId, marcoId) {
  const usuarioId = auth().currentUser?.uid;
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode salvar em marco");
  const tokenSnap = await get(ref(db(), `${tokenPath(mesaId)}/${tokenId}`));
  if (!tokenSnap.exists()) throw new Error("Token ausente");
  const snapshot = tokenSnap.val();
  await update(ref(db(), `/mesas/${mesaId}/marcos/${marcoId}/tokens_salvos/${tokenId}`), snapshot);
  return { sucesso: true };
}