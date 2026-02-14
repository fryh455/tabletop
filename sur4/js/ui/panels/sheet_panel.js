// Sheet panel: show my sheet (player) or list (master minimal)
import { on, emit } from "../../core/events.js";
import { setHtml } from "../dom.js";
import { getMySheet, getSheets, updateSheet } from "../../room/sheets.js";
import { rollD12WithMods } from "../../rules/roll.js";
import { dtCabeca, dtTorso, dtBraco, dtPerna, hpTotal, intentions, movement, esquiva, invLimit } from "../../rules/sur4_math.js";

function btn(id, label, delta) {
  return `<button type="button" data-mental="${delta}">${label}</button>`;
}

function renderPlayer(sheet) {
  if (!sheet) {
    setHtml("sheetView", "<p>Nenhuma ficha atribuída.</p>");
    return;
  }
  const A = sheet.attrs || {};
  const QI = A.QI ?? 1, FOR = A.FOR ?? 1, DEX = A.DEX ?? 1, VIG = A.VIG ?? 1;
  const mental = sheet.mental ?? 0;

  const dtH = dtCabeca(VIG);
  const dtT = dtTorso(VIG, FOR);
  const dtB = dtBraco(VIG);
  const dtP = dtPerna(VIG);
  const hp = hpTotal(VIG, FOR);

  const invL = invLimit(FOR, VIG);

  const html = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${sheet.name || "Ficha"}</b>
        <span>Mental: <b id="mentalVal">${mental}</b></span>
      </div>

      <div class="row" style="gap:8px;margin-top:8px">
        ${btn("mdec","-1", -1)}
        ${btn("minc","+1", 1)}
        ${btn("mdec5","-5", -5)}
        ${btn("minc5","+5", 5)}
      </div>

      <hr/>

      <div><b>Atributos (clique para rolar d12)</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <button type="button" data-roll-attr="QI">QI: ${QI}</button>
        <button type="button" data-roll-attr="FOR">FOR: ${FOR}</button>
        <button type="button" data-roll-attr="DEX">DEX: ${DEX}</button>
        <button type="button" data-roll-attr="VIG">VIG: ${VIG}</button>
      </div>

      <hr/>

      <div><b>Derivados</b></div>
      <ul>
        <li>Intenções: <b>${intentions(VIG, DEX)}</b></li>
        <li>Movimento: <b>${movement(DEX)}</b></li>
        <li>Esquiva: <b>${esquiva(DEX)}</b></li>
        <li>DT cabeça: <button type="button" data-roll-dt="cabeça">DT ${dtH}</button></li>
        <li>DT torso: <button type="button" data-roll-dt="torso">DT ${dtT}</button></li>
        <li>DT braço: <button type="button" data-roll-dt="braço">DT ${dtB}</button></li>
        <li>DT perna: <button type="button" data-roll-dt="perna">DT ${dtP}</button></li>
        <li>HP total: <b>${hp}</b></li>
        <li>Inventário limite: <b>${invL} kg</b></li>
      </ul>

      <hr/>
      <div><b>Notas</b></div>
      <textarea id="playerNotes" rows="4" style="width:100%">${sheet.notes || ""}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:6px">
        <button type="button" id="btnSaveNotes">Salvar</button>
      </div>
    </div>
  `;
  setHtml("sheetView", html);

  // handlers
  document.querySelectorAll("[data-mental]").forEach(b => {
    b.addEventListener("click", async () => {
      const d = parseInt(b.getAttribute("data-mental"), 10) || 0;
      const next = (sheet.mental ?? 0) + d;
      await updateSheet(sheet.id, { mental: next });
    });
  });

  document.querySelectorAll("[data-roll-attr]").forEach(b => {
    b.addEventListener("click", () => {
      const attr = b.getAttribute("data-roll-attr");
      const val = sheet.attrs?.[attr] ?? 0;
      const r = rollD12WithMods({ label: `${attr} (valor ${val})`, mods: [{ label: attr, raw: String(val) }] });
      emit("roll:result", r);
    });
  });

  document.querySelectorAll("[data-roll-dt]").forEach(b => {
    b.addEventListener("click", () => {
      const part = b.getAttribute("data-roll-dt");
      const dtVal = parseInt(b.textContent.replace(/\D+/g, ""), 10) || 0;
      const r = rollD12WithMods({ label: `DT ${part}`, mods: [{ label: "DT", raw: String(dtVal) }] });
      emit("roll:result", r);
    });
  });

  document.getElementById("btnSaveNotes")?.addEventListener("click", async () => {
    const t = document.getElementById("playerNotes")?.value ?? "";
    await updateSheet(sheet.id, { notes: t });
  });
}

function renderMasterList(sheets) {
  const rows = Object.values(sheets || {}).map(s => `<li>${s.name || s.id}</li>`).join("");
  setHtml("sheetView", `<div class="card"><b>Fichas</b><ul>${rows || "<li><i>nenhuma</i></li>"}</ul></div>`);
}

export function mountSheetPanel() {
  on("sheets:update", () => {
    onTick();
  });
  on("room:role", () => onTick());
  onTick();
}

function onTick() {
  // role from session
  const role = (sessionStorage.getItem("sur4.role") || "player");
  if (role === "master") renderMasterList(getSheets());
  else renderPlayer(getMySheet());
}
