// Inventory editor + roll hooks (player owns only)
import { on, emit } from "../../core/events.js";
import { setHtml } from "../dom.js";
import { getMySheet, updateSheet } from "../../room/sheets.js";
import { rollD12WithMods } from "../../rules/roll.js";
import { invLimit } from "../../rules/sur4_math.js";
import { sumInventoryWeight, normalizeItem, normalizeAdv, modEntry } from "../../rules/inventory_math.js";

function uid() { return "id_" + Math.random().toString(36).slice(2, 10); }

function render(sheet) {
  if (!sheet) {
    setHtml("sheetView", "<p>Nenhuma ficha atribuída.</p>");
    return;
  }

  const items = Array.isArray(sheet.inventory) ? sheet.inventory : [];
  const advs = Array.isArray(sheet.advantages) ? sheet.advantages : [];

  const A = sheet.attrs || {};
  const FOR = A.FOR ?? 1;
  const VIG = A.VIG ?? 1;
  const limit = invLimit(FOR, VIG);
  const used = sumInventoryWeight(items);

  const itemsHtml = items.map((it) => `
    <li class="liCard" data-item-id="${it.id}">
      <div class="row" style="justify-content:space-between;align-items:center">
        <button type="button" class="linkBtn" data-roll-item="${it.id}">${it.name || "Item"}</button>
        <button type="button" class="danger" data-del-item="${it.id}">Apagar</button>
      </div>
      <div class="muted">${it.desc || ""}</div>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <span>mod: <b>${it.mod || "-"}</b></span>
        <span>atributo: <b>${it.attr || "-"}</b></span>
        <span>peso: <b>${Number(it.weight||0)}</b></span>
      </div>
    </li>
  `).join("");

  const advsHtml = advs.map((a) => `
    <li class="liCard" data-adv-id="${a.id}">
      <div class="row" style="justify-content:space-between;align-items:center">
        <button type="button" class="linkBtn" data-roll-adv="${a.id}">${a.name || "Vantagem"}</button>
        <button type="button" class="danger" data-del-adv="${a.id}">Apagar</button>
      </div>
      <div class="muted">${a.desc || ""}</div>
      <div class="row" style="justify-content:space-between;margin-top:6px;flex-wrap:wrap">
        <span>mod: <b>${a.mod || "-"}</b></span>
        <span>DT: <b>${a.dt ?? 0}</b></span>
        <span>atributo: <b>${a.attr || "-"}</b></span>
      </div>
      ${a.notes ? `<div class="muted" style="margin-top:6px"><i>notas:</i> ${a.notes}</div>` : ""}
    </li>
  `).join("");

  const html = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${sheet.name || "Ficha"}</b>
        <span>Inventário: <b>${used.toFixed(1)}</b> / <b>${limit}</b> kg</span>
      </div>

      <hr/>

      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Itens</b>
        <button type="button" id="btnAddItem">+ Item</button>
      </div>
      <ul class="list">${itemsHtml || "<li><i>vazio</i></li>"}</ul>

      <hr/>

      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Vantagens</b>
        <button type="button" id="btnAddAdv">+ Vantagem</button>
      </div>
      <ul class="list">${advsHtml || "<li><i>vazio</i></li>"}</ul>
    </div>
  `;
  setHtml("sheetView", html);

  // add item
  document.getElementById("btnAddItem")?.addEventListener("click", async () => {
    const name = prompt("Nome do item?") || "";
    if (!name.trim()) return;
    const desc = prompt("Descrição?") || "";
    const mod = prompt("Modificador? (+3, -2, *1.5) (opcional)") || "";
    const attr = prompt("Atributo usado? (QI/FOR/DEX/VIG) (opcional)") || "";
    const weight = prompt("Peso (kg)? (número)") || "0";

    const it = normalizeItem({ id: uid(), name, desc, mod, attr, weight });
    await updateSheet(sheet.id, { inventory: [...items, it] });
  });

  // add adv
  document.getElementById("btnAddAdv")?.addEventListener("click", async () => {
    const name = prompt("Nome da vantagem?") || "";
    if (!name.trim()) return;
    const desc = prompt("Descrição?") || "";
    const mod = prompt("Modificador? (+3, -2, *1.5) (opcional)") || "";
    const dt = prompt("DT (número) (opcional)") || "0";
    const attr = prompt("Atributo usado? (QI/FOR/DEX/VIG) (opcional)") || "";
    const notes = prompt("Notas (opcional)") || "";

    const a = normalizeAdv({ id: uid(), name, desc, mod, dt, attr, notes });
    await updateSheet(sheet.id, { advantages: [...advs, a] });
  });

  // delete item
  document.querySelectorAll("[data-del-item]").forEach(b => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del-item");
      const next = items.filter(it => it.id !== id);
      await updateSheet(sheet.id, { inventory: next });
    });
  });

  // delete adv
  document.querySelectorAll("[data-del-adv]").forEach(b => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del-adv");
      const next = advs.filter(a => a.id !== id);
      await updateSheet(sheet.id, { advantages: next });
    });
  });

  // roll item
  document.querySelectorAll("[data-roll-item]").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-roll-item");
      const it = items.find(x => x.id === id);
      if (!it) return;

      const mods = [];
      if (it.attr && sheet.attrs?.[it.attr] != null) mods.push(modEntry(it.attr, String(sheet.attrs[it.attr])));
      if (it.mod) mods.push(modEntry(it.name, it.mod));

      const r = rollD12WithMods({ label: `Item: ${it.name}`, mods });
      emit("roll:result", r);
    });
  });

  // roll adv
  document.querySelectorAll("[data-roll-adv]").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-roll-adv");
      const a = advs.find(x => x.id === id);
      if (!a) return;

      const mods = [];
      if (a.attr && sheet.attrs?.[a.attr] != null) mods.push(modEntry(a.attr, String(sheet.attrs[a.attr])));
      if (a.mod) mods.push(modEntry(a.name, a.mod));

      const r = rollD12WithMods({ label: `Vantagem: ${a.name} (DT ${a.dt ?? 0})`, mods });
      emit("roll:result", r);
    });
  });
}

export function mountInventoryPanel() {
  const tick = () => render(getMySheet());
  on("sheets:update", tick);
  tick();
}
