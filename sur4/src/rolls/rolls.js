import { $ , escapeHtml } from "../utils/dom.js";
import { state, isMaster } from "../state.js";

export function mountRollsUI() {
  const list = $("#rolls-list");

  function render() {
    const rolls = Object.entries(state.room.rollsById || {}).map(([id, r]) => ({ id, ...r }));
    rolls.sort((a,b)=> (b.ts||0)-(a.ts||0));

    const visible = isMaster() ? rolls : rolls.filter(r => r.userUid === state.me?.uid);

    if (!visible.length) {
      list.innerHTML = `<div class="muted">Sem rolls.</div>`;
      return;
    }

    list.innerHTML = visible.slice(0, 60).map((r) => `
      <div class="roll-card">
        <div class="row">
          <strong>${escapeHtml(r.userName || r.userUid || "-")}</strong>
          <span class="muted small">${new Date(r.ts||0).toLocaleString()}</span>
        </div>
        <div class="muted small">${escapeHtml(r.sheetName||"-")} • ${escapeHtml(r.attr||"-")} • ${escapeHtml(r.mode||"normal")}</div>
        <div>rolls: <strong>${(r.rolls||[]).join(", ")}</strong> • base <strong>${r.base}</strong></div>
        <div>add <strong>${r.add}</strong> • mul <strong>${r.mul}</strong> • total <strong>${r.total}</strong></div>
        ${r.buffUsed ? `<div class="muted small">buff: ${escapeHtml(r.buffUsed)}</div>` : ``}
      </div>
    `).join("");
  }

  window.addEventListener("app:room:rolls", render);
  window.addEventListener("app:session:ready", render);
  render();
}
