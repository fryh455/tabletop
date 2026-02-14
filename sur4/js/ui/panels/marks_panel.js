// Marks panel: master create/edit marks; stash selected token/sheet; notes per mark
import { setHtml } from "../dom.js";
import { loadSession } from "../../core/state.js";
import { toast } from "../toast.js";
import { on, emit } from "../../core/events.js";
import { setMarksContext, getMarks, createMark, updateMark, deleteMark, pushToMarkStash, removeFromMarkStash } from "../../room/marks.js";
import { getTokens } from "../../room/tokens.js";
import { getSheets } from "../../room/sheets.js";

let _sel = null;

function render(role) {
  if (role !== "master") {
    setHtml("markEditor", "<p>Marcos são privados do mestre.</p>");
    return;
  }

  const marks = getMarks();
  const list = Object.values(marks || {}).map(m => `
    <li class="liCard">
      <div class="row" style="justify-content:space-between;align-items:center">
        <button type="button" class="linkBtn" data-sel-mark="${m.id}">${m.name}</button>
        <button type="button" class="danger" data-del-mark="${m.id}">Apagar</button>
      </div>
      <div class="muted">(${Math.round(m.x)}, ${Math.round(m.y)}) | stash: ${(m.stash?.tokens?.length||0)} tokens</div>
    </li>
  `).join("");

  const m = _sel ? (marks[_sel] || null) : null;

  const editor = m ? `
    <div class="card" style="margin-top:10px">
      <b>Marco: ${m.name}</b>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <div style="min-width:220px;flex:2">
          <div class="muted">Nome</div>
          <input id="mkName" value="${m.name || ""}" style="width:100%"/>
        </div>
        <div style="min-width:140px;flex:1">
          <div class="muted">X</div>
          <input id="mkX" value="${m.x ?? 0}"/>
        </div>
        <div style="min-width:140px;flex:1">
          <div class="muted">Y</div>
          <input id="mkY" value="${m.y ?? 0}"/>
        </div>
      </div>

      <div style="margin-top:8px">
        <div class="muted">Notas</div>
        <textarea id="mkNotes" rows="6" style="width:100%">${m.notes || ""}</textarea>
      </div>

      <div class="row" style="justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
        <button type="button" id="btnSaveMk">Salvar</button>
      </div>

      <hr/>

      <div><b>Stash</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <button type="button" id="btnStashToken">Guardar Token selecionado</button>
        <button type="button" id="btnStashSheet">Guardar Ficha (por id)</button>
      </div>

      <div class="muted" style="margin-top:8px">Tokens guardados:</div>
      <ul class="list" style="margin-top:6px">
        ${(m.stash?.tokens || []).map((t, idx) => `
          <li class="liCard">
            <div class="row" style="justify-content:space-between;align-items:center">
              <span>${t.name || t.id || "token"} (${t.id || "?"})</span>
              <button type="button" class="danger" data-rm-stash="tokens" data-idx="${idx}">Remover</button>
            </div>
          </li>
        `).join("") || "<li><i>vazio</i></li>"}
      </ul>

      <div class="muted" style="margin-top:8px">Fichas guardadas:</div>
      <ul class="list" style="margin-top:6px">
        ${(m.stash?.sheets || []).map((s, idx) => `
          <li class="liCard">
            <div class="row" style="justify-content:space-between;align-items:center">
              <span>${s.name || s.id || "ficha"} (${s.id || "?"})</span>
              <button type="button" class="danger" data-rm-stash="sheets" data-idx="${idx}">Remover</button>
            </div>
          </li>
        `).join("") || "<li><i>vazio</i></li>"}
      </ul>

    </div>
  ` : `<div class="muted" style="margin-top:10px">Selecione um marco.</div>`;

  setHtml("markEditor", `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Marcos (privado do mestre)</b>
        <button type="button" id="btnNewMk">+ Marco</button>
      </div>
      <ul class="list" style="margin-top:8px">${list || "<li><i>nenhum</i></li>"}</ul>
    </div>
    ${editor}
  `);

  document.getElementById("btnNewMk")?.addEventListener("click", async () => {
    try {
      const name = prompt("Nome do marco?") || "Marco";
      const x = Number(prompt("X?") || "0") || 0;
      const y = Number(prompt("Y?") || "0") || 0;
      const mk = await createMark({ name, x, y, notes:"" });
      _sel = mk.id;
      toast("ok","Marco criado");
    } catch(e) { toast("error", String(e?.message||e)); }
  });

  document.querySelectorAll("[data-sel-mark]").forEach(b => b.addEventListener("click", () => {
    _sel = b.getAttribute("data-sel-mark");
    render(role);
  }));

  document.querySelectorAll("[data-del-mark]").forEach(b => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del-mark");
    if (!confirm("Apagar marco?")) return;
    try { await deleteMark(id); if (_sel===id) _sel=null; toast("ok","Apagado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  }));

  document.getElementById("btnSaveMk")?.addEventListener("click", async () => {
    try {
      const name = document.getElementById("mkName")?.value || "Marco";
      const x = Number(document.getElementById("mkX")?.value || 0) || 0;
      const y = Number(document.getElementById("mkY")?.value || 0) || 0;
      const notes = document.getElementById("mkNotes")?.value || "";
      await updateMark(_sel, { name, x, y, notes });
      toast("ok","Salvo");
    } catch(e) { toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnStashToken")?.addEventListener("click", async () => {
    try {
      const sel = window.__SUR4_SELECTED_TOKEN_ID || "";
      if (!sel) { toast("error","Selecione um token primeiro."); return; }
      const t = getTokens()?.[sel];
      if (!t) { toast("error","Token não encontrado."); return; }
      await pushToMarkStash(_sel, "tokens", { id: sel, name: t.name || "", ownerUid: t.ownerUid || null, sheetId: t.sheetId || null });
      toast("ok","Token guardado");
    } catch(e) { toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnStashSheet")?.addEventListener("click", async () => {
    try {
      const sid = prompt("SheetId para guardar?") || "";
      const s = getSheets()?.[sid];
      if (!s) { toast("error","Ficha não encontrada no cache. Crie/importe ou carregue."); return; }
      await pushToMarkStash(_sel, "sheets", { id: sid, name: s.name || "" });
      toast("ok","Ficha guardada");
    } catch(e) { toast("error", String(e?.message||e)); }
  });

  document.querySelectorAll("[data-rm-stash]").forEach(b => b.addEventListener("click", async () => {
    const kind = b.getAttribute("data-rm-stash");
    const idx = Number(b.getAttribute("data-idx"));
    try { await removeFromMarkStash(_sel, kind, idx); toast("ok","Removido"); }
    catch(e){ toast("error", String(e?.message||e)); }
  }));
}

export function mountMarksPanel() {
  const s = loadSession();
  setMarksContext({ roomId: s.roomId || "", role: s.role || "player" });

  on("marks:update", () => render(s.role || "player"));
  render(s.role || "player");
}
