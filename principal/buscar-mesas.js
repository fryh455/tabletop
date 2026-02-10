// Exports: criarMesa, buscarMesasPorCodigo, entrarEmMesa
import { getDatabase, ref, set, push, update, get, child, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const db = () => getDatabase();
const auth = () => getAuth();

function gerarCodigoCurto() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function criarMesa(nomeMesa) {
  const usuarioId = auth().currentUser?.uid;
  if (!usuarioId) throw new Error("Autenticação requerida");
  const dbRef = ref(db(), `/mesas`);
  const novo = push(dbRef);
  const mesaId = novo.key;
  const codigo = gerarCodigoCurto();
  const payload = {
    nome: nomeMesa,
    codigo,
    mestre_id: usuarioId,
    criado_em: new Date().toISOString()
  };
  await set(ref(db(), `/mesas/${mesaId}`), payload);
  // adicionar jogador inicial
  await set(ref(db(), `/mesas/${mesaId}/jogadores_ids/${usuarioId}`), true);
  return { mesaId };
}

export async function buscarMesasPorCodigo(codigo) {
  const dbRef = ref(db(), `/mesas`);
  const snap = await get(dbRef);
  const list = [];
  if (!snap.exists()) return list;
  snap.forEach(childSnap => {
    const val = childSnap.val();
    if (val && val.codigo && val.codigo.toString().toUpperCase() === codigo.toString().toUpperCase()) {
      list.push({ mesaId: childSnap.key, ...val });
    }
  });
  return list;
}

export async function entrarEmMesa(mesaId) {
  const usuarioId = auth().currentUser?.uid;
  if (!usuarioId) throw new Error("Autenticação requerida");
  const jogadoresRef = ref(db(), `/mesas/${mesaId}/jogadores_ids`);
  await runTransaction(jogadoresRef, current => {
    if (!current) current = {};
    current[usuarioId] = true;
    return current;
  });
  return { sucesso: true };
}

// Auto-bind minimal UI
if (typeof window !== "undefined") {
  document.getElementById("btn-criar-mesa")?.addEventListener("click", async () => {
    const nome = document.getElementById("nome-mesa").value;
    try {
      const res = await criarMesa(nome);
      window.location.href = `/mesa/mesa.html?mid=${res.mesaId}`;
    } catch (e) {
      alert(e.message);
    }
  });
  document.getElementById("btn-buscar")?.addEventListener("click", async () => {
    const codigo = document.getElementById("codigo-mesa").value;
    const result = await buscarMesasPorCodigo(codigo);
    const ul = document.getElementById("lista-mesas");
    ul.innerHTML = "";
    result.forEach(m => {
      const li = document.createElement("li");
      li.textContent = `${m.nome} (${m.codigo})`;
      const btn = document.createElement("button");
      btn.textContent = "Entrar";
      btn.addEventListener("click", async () => {
        await entrarEmMesa(m.mesaId);
        window.location.href = `/mesa/mesa.html?mid=${m.mesaId}`;
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
  });
}