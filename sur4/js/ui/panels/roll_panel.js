// Roll panel renderer
import { setHtml } from "../dom.js";
import { on } from "../../core/events.js";

export function mountRollPanel() {
  on("roll:result", (r) => renderRoll(r));
}

export function renderRoll(r) {
  if (!r) return;
  const mods = (r.mods || []).map(m => {
    if (m.kind === "add") return `<li>${m.label}: <b>${m.raw}</b></li>`;
    if (m.kind === "mul") return `<li>${m.label}: <b>${m.raw}</b></li>`;
    return `<li>${m.label}: <i>inválido</i> (${m.raw})</li>`;
  }).join("");

  const html = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${r.label}</b>
        <span>d12: <b>${r.die}</b></span>
      </div>
      <div style="margin-top:6px">
        <div>Modificadores:</div>
        <ul>${mods || "<li><i>nenhum</i></li>"}</ul>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <span>Soma: <b>${r.addSum >= 0 ? "+"+r.addSum : r.addSum}</b></span>
        <span>Multiplicador: <b>x${r.mul}</b></span>
      </div>
      <div style="margin-top:8px;font-size:18px">Total: <b>${r.total}</b></div>
    </div>
  `;
  setHtml("rollOut", html);
}
