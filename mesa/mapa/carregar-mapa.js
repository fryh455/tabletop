// Exports: carregarMapa, salvarEstadoMapa
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function carregarMapa(mapaId) {
  // [ASSUNÇÃO] mesaId lido de query string
  const params = new URLSearchParams(location.search);
  const mesaId = params.get("mid");
  if (!mesaId) throw new Error("mesaId ausente");
  const snap = await get(ref(db(), `/mesas/${mesaId}/mapa`));
  return snap.exists() ? snap.val() : null;
}

export async function salvarEstadoMapa(estadoMapa) {
  const params = new URLSearchParams(location.search);
  const mesaId = params.get("mid");
  if (!mesaId) throw new Error("mesaId ausente");
  const usuarioId = auth().currentUser?.uid;
  if (!usuarioId) throw new Error("Autenticação requerida");
  // permissões devem ser checadas fora; aqui grava diretamente
  await set(ref(db(), `/mesas/${mesaId}/mapa`), { ...estadoMapa, atualizado_em: new Date().toISOString() });
  return { sucesso: true };
}