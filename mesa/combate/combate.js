// Exports: ativarModoCombate, desativarModoCombate
import { getDatabase, ref, update, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function ativarModoCombate(mesaId) {
  const usuarioId = auth().currentUser?.uid;
  const mestreId = (await get(ref(db(), `/mesas/${mesaId}`))).val()?.mestre_id;
  if (mestreId !== usuarioId) throw new Error("Somente mestre");
  await update(ref(db(), `/mesas/${mesaId}/estado`), { combate: true });
  return { sucesso: true };
}

export async function desativarModoCombate(mesaId) {
  const usuarioId = auth().currentUser?.uid;
  const mestreId = (await get(ref(db(), `/mesas/${mesaId}`))).val()?.mestre_id;
  if (mestreId !== usuarioId) throw new Error("Somente mestre");
  await update(ref(db(), `/mesas/${mesaId}/estado`), { combate: false });
  return { sucesso: true };
}