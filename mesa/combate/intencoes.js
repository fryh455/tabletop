// Exports: iniciarDistribuidorIntencoes, enviarIntencoes, consumirIntencao
import { getDatabase, ref, set, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

export function iniciarDistribuidorIntencoes() {
  // [ASSUNÇÃO] UI init done externally
  return { iniciado: true };
}

export async function enviarIntencoes(mesaId, jogadorId, listaIntencoes) {
  const payload = {
    jogadorId,
    listaIntencoes,
    intencoesDisponiveis: listaIntencoes.reduce((s, i) => s + (i.quantidade || 0), 0),
    ultimoUpdate: new Date().toISOString()
  };
  await set(ref(db(), `/mesas/${mesaId}/intencoes/${jogadorId}`), payload);
  return { sucesso: true };
}

export async function consumirIntencao(mesaId, jogadorId) {
  const nodeRef = ref(db(), `/mesas/${mesaId}/intencoes/${jogadorId}`);
  await runTransaction(nodeRef, current => {
    if (!current) return current;
    if (typeof current.intencoesDisponiveis === "number" && current.intencoesDisponiveis > 0) {
      current.intencoesDisponiveis -= 1;
      current.ultimoUpdate = new Date().toISOString();
    }
    return current;
  });
  return { sucesso: true };
}