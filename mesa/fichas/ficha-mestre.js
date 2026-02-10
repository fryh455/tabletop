import { getDatabase, ref, onValue, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { obterFicha, atualizarFicha } from "./fichas.js";
import { calcularAtributosDerivados } from "./ficha-calculos.js";
import { ehMestre } from "../papel-usuario.js";

const db = getDatabase();

export async function inicializarFichaMestre(mesaId, usuarioId, containerId) {
  if (!ehMestre()) return;

  const container = document.getElementById(containerId);
  const fichaRef = ref(db, `/fichas/${usuarioId}`);

  onValue(fichaRef, snap => {
    if (!snap.exists()) return;
    const ficha = snap.val();
    const derivados = calcularAtributosDerivados(ficha);
    renderizarFichaMestre(container, ficha, derivados, mesaId, usuarioId);
  });
}

function renderizarFichaMestre(container, ficha, derivados, mesaId, usuarioId) {
  container.innerHTML = `
    <h2>${ficha.nome}</h2>
    <div>Atributos: ${JSON.stringify(ficha.atributos)}</div>
    <div>Derivados: ${JSON.stringify(derivados)}</div>
    <button id="btn-salvar-ficha">Salvar Alterações</button>
  `;

  document.getElementById("btn-salvar-ficha").onclick = async () => {
    await atualizarFicha(usuarioId, {
      atualizado_em: new Date().toISOString()
    });
  };
}
