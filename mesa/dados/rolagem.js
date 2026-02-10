// Exports: solicitarRolagem, ouvirRolagens
import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as rng from "./randomizacao.js";

const db = () => getDatabase();
const auth = () => getAuth();

export async function solicitarRolagem(mesaId, contexto) {
  // contexto: { tipo, dados, vantagem, desvantagem, modificadores }
  const usuarioId = auth().currentUser?.uid;
  const seed = rng.gerarSeed();
  const resultadoDetalhado = rng.rolarComSeed(seed, contexto.dados);
  // apply vantagem/desvantagem logic: exemplo simples soma
  let resultadoFinal = resultadoDetalhado.reduce((a,b)=>a+b,0);
  if (contexto.vantagem) resultadoFinal += 0;
  if (contexto.desvantagem) resultadoFinal -= 0;
  const rollRef = push(ref(db(), `/mesas/${mesaId}/rolagens`));
  const rollId = rollRef.key;
  const payload = {
    autorId: usuarioId,
    tipo: contexto.tipo || "atributo",
    dados: contexto.dados || "1d20",
    vantagem: !!contexto.vantagem,
    desvantagem: !!contexto.desvantagem,
    modificadores: contexto.modificadores || {},
    seed,
    resultadoDetalhado,
    resultadoFinal,
    timestamp: new Date().toISOString()
  };
  await set(ref(db(), `/mesas/${mesaId}/rolagens/${rollId}`), payload);
  return { rollId, payload };
}

export function ouvirRolagens(mesaId, callback) {
  const node = ref(db(), `/mesas/${mesaId}/rolagens`);
  return onChildAdded(node, snap => {
    callback(snap.key, snap.val());
  });
}