import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { obterFicha } from "./fichas.js";
import { calcularAtributosDerivados } from "./ficha-calculos.js";

const db = getDatabase();

export async function inicializarFichaPlayer(usuarioId, containerId) {
  const container = document.getElementById(containerId);
  const fichaRef = ref(db, `/fichas/${usuarioId}`);

  onValue(fichaRef, snap => {
    if (!snap.exists()) return;
    const ficha = snap.val();
    const derivados = calcularAtributosDerivados(ficha);
    renderizarFichaPlayer(container, ficha, derivados);
  });
}

function renderizarFichaPlayer(container, ficha, derivados) {
  container.innerHTML = `
    <h2>${ficha.nome}</h2>
    <div>Atributos: ${JSON.stringify(ficha.atributos)}</div>
    <div>Derivados: ${JSON.stringify(derivados)}</div>
    <div>Vida: ${ficha.vida}</div>
    <div>Inventário: ${Object.keys(ficha.itens || {}).length} itens</div>
  `;
}
