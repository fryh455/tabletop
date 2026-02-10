// Exports: inicializarMesa, destruirMesa, emitirEventoLocal
import { getDatabase, ref, onValue, off } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as logs from "./logs/logs.js";

let listeners = [];
let mesaIdActive = null;
const db = () => getDatabase();
const auth = () => getAuth();

export function emitirEventoLocal(tipo, payload) {
  const texto = `[${tipo}] ${JSON.stringify(payload)}`;
  logs.adicionarLog(texto, "info");
}

export function inicializarMesa(mesaId) {
  mesaIdActive = mesaId;
  const paths = [
    `/mesas/${mesaId}/tokens`,
    `/mesas/${mesaId}/marcos`,
    `/mesas/${mesaId}/fichas`,
    `/mesas/${mesaId}/rolagens`,
    `/mesas/${mesaId}/intencoes`,
    `/mesas/${mesaId}/mapa`
  ];
  paths.forEach(path => {
    const r = ref(db(), path);
    const cb = snapshot => {
      emitirEventoLocal("rtdb_update", { path, exists: snapshot.exists() });
      // no-op: consumers import modules that also set listeners if needed
    };
    onValue(r, cb);
    listeners.push({ ref: r, cb });
  });
  logs.adicionarLog(`Mesa ${mesaId} inicializada`, "info");
  return { sucesso: true };
}

export function destruirMesa() {
  listeners.forEach(l => {
    off(l.ref, l.cb);
  });
  listeners = [];
  mesaIdActive = null;
  logs.limparLogs();
  return { sucesso: true };
}