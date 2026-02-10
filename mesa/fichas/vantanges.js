// Exports: criarVantagem, removerVantagem
import { getDatabase, ref, push, set, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function criarVantagem(usuarioId, vantagemData) {
  const novo = push(ref(db(), `/fichas/${usuarioId}/vantagens`));
  const vid = novo.key;
  await set(ref(db(), `/fichas/${usuarioId}/vantagens/${vid}`), { id: vid, ...vantagemData });
  return { vantagemId: vid };
}

export async function removerVantagem(usuarioId, vantagemId) {
  await remove(ref(db(), `/fichas/${usuarioId}/vantagens/${vantagemId}`));
  return { sucesso: true };
}