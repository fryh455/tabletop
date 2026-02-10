// Exports: criarItem, removerItem
import { getDatabase, ref, update, push, remove, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function criarItem(usuarioId, itemData) {
  const usuarioAtivo = auth().currentUser?.uid;
  // somente mestre cria (spec)
  // [ASSUNÇÃO] verifica mestre externamente
  const novo = push(ref(db(), `/fichas/${usuarioId}/itens`));
  const itemId = novo.key;
  await set(ref(db(), `/fichas/${usuarioId}/itens/${itemId}`), { id: itemId, ...itemData });
  return { itemId };
}

export async function removerItem(usuarioId, itemId) {
  const usuarioAtivo = auth().currentUser?.uid;
  // somente mestre (spec)
  await remove(ref(db(), `/fichas/${usuarioId}/itens/${itemId}`));
  return { sucesso: true };
}