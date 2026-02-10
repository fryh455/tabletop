// Exports: criarMarco, obterMarcos, aplicarMarco
import { getDatabase, ref, push, set, get, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function criarMarco(mesaId, marcoData) {
  const usuarioId = auth().currentUser?.uid;
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode criar marco");
  const novo = push(ref(db(), `/mesas/${mesaId}/marcos`));
  const marcoId = novo.key;
  const payload = {
    ...marcoData,
    tokens_salvos: marcoData.tokens_salvos || {},
    criado_em: new Date().toISOString(),
    criado_por: usuarioId
  };
  await set(ref(db(), `/mesas/${mesaId}/marcos/${marcoId}`), payload);
  return { marcoId };
}

export async function obterMarcos(mesaId) {
  const usuarioId = auth().currentUser?.uid;
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode obter marcos");
  const snap = await get(ref(db(), `/mesas/${mesaId}/marcos`));
  return snap.exists() ? snap.val() : {};
}

export async function aplicarMarco(mesaId, marcoId, modo = "mesclar") {
  // modo: "sobrescrever" ou "mesclar"
  const usuarioId = auth().currentUser?.uid;
  const mesaSnap = await get(ref(db(), `/mesas/${mesaId}`));
  const mestreId = mesaSnap.exists() ? mesaSnap.val().mestre_id : null;
  if (mestreId !== usuarioId) throw new Error("Somente mestre pode aplicar marco");
  const marcoSnap = await get(ref(db(), `/mesas/${mesaId}/marcos/${marcoId}`));
  if (!marcoSnap.exists()) throw new Error("Marco não existe");
  const tokens_salvos = marcoSnap.val().tokens_salvos || {};
  if (modo === "sobrescrever") {
    // sobrescreve todo /mesas/{mesaId}/tokens
    await set(ref(db(), `/mesas/${mesaId}/tokens`), tokens_salvos);
  } else {
    // mesclar: atualiza cada token
    const updates = {};
    Object.keys(tokens_salvos).forEach(tid => {
      updates[`/mesas/${mesaId}/tokens/${tid}`] = tokens_salvos[tid];
    });
    await update(ref(db()), updates);
  }
  return { sucesso: true };
}