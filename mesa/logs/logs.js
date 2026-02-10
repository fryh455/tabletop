// Exports: adicionarLog, limparLogs, obterLogs
let logs = [];

export function adicionarLog(texto, nivel = "info") {
  const entry = { autorId: null, texto, nivel, timestamp: new Date().toISOString() };
  logs.push(entry);
  // update UI if exists
  const el = document.querySelector("#logs-output");
  if (el) {
    const p = document.createElement("div");
    p.textContent = `[${entry.timestamp}] ${entry.nivel}: ${entry.texto}`;
    el.appendChild(p);
  }
  return entry;
}

export function limparLogs() {
  logs = [];
  const el = document.querySelector("#logs-output");
  if (el) el.innerHTML = "";
  return { sucesso: true };
}

export function obterLogs() {
  return logs.slice();
}