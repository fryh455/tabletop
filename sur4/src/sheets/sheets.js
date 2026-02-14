import { $, setHidden, safeText, escapeHtml } from "../utils/dom.js";
import { state, isMaster } from "../state.js";
import { uid } from "../utils/id.js";
import { rollD12 } from "../dice/dice.js";
import { setv, upv, del, pushv } from "../db/api.js";
import { paths } from "../db/paths.js";

let pendingBuff = { add: 0, mul: 1, label: null };

export function mountSheetsUI() {
  const list = $("#sheets-list");
  const view = $("#sheet-view");

  const btnCreate = $("#btn-create-sheet");
  const modal = $("#modal-sheet");
  const nameEl = $("#sheet-name");
  const ownerUidEl = $("#sheet-owner-uid");
  const qiEl = $("#attr-qi");
  const forEl = $("#attr-for");
  const dexEl = $("#attr-dex");
  const vigEl = $("#attr-vig");
  const btnModalCreate = $("#sheet-create");
  const btnModalCancel = $("#sheet-cancel");

  const rollModal = $("#modal-roll");
  const rollSummary = $("#roll-summary");
  const btnRollClose = $("#roll-close");
  btnRollClose.addEventListener("click", () => setHidden(rollModal, true));

  // show create button only for master
  function renderCreateBtn() { btnCreate.classList.toggle("hidden", !isMaster()); }
  window.addEventListener("app:room:meta", renderCreateBtn);
  renderCreateBtn();

  btnCreate.addEventListener("click", () => {
    if (!isMaster()) return alert("Somente mestre cria fichas.");
    nameEl.value = "";
    ownerUidEl.value = "";
    qiEl.value = "1"; forEl.value = "1"; dexEl.value = "1"; vigEl.value = "1";
    setHidden(modal, false);
    nameEl.focus();
  });
  btnModalCancel.addEventListener("click", () => setHidden(modal, true));

  btnModalCreate.addEventListener("click", async () => {
    if (!isMaster()) return;
    const name = safeText(nameEl.value, 32);
    const ownerUid = safeText(ownerUidEl.value, 80);
    if (!name) return alert("Nome obrigatório.");
    if (!ownerUid) return alert("Owner UID obrigatório (cole o uid do player).");

    const sheetId = uid("sheet");
    const sheet = {
      id: sheetId,
      ownerUid,
      name,
      attributes: {
        QI: clampAttr(qiEl.value),
        FOR: clampAttr(forEl.value),
        DEX: clampAttr(dexEl.value),
        VIG: clampAttr(vigEl.value)
      },
      inventory: { items: {}, advantages: {} },
      playerNotes: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await setv(paths.roomSheet(state.roomId, sheetId), sheet);
    setHidden(modal, true);
    state.ui.selectedSheetId = sheetId;
    pendingBuff = { add: 0, mul: 1, label: null };
  });

  function visibleSheets() {
    const all = Object.values(state.room.sheetsById || {});
    if (isMaster()) return all.sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0));
    return all.filter(s => s.ownerUid === state.me?.uid).sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0));
  }

  function renderList() {
    const sheets = visibleSheets();
    list.innerHTML = "";
    for (const s of sheets) {
      const card = document.createElement("div");
      card.className = "sheet-card";
      card.innerHTML = `
        <div class="row">
          <strong>${escapeHtml(s.name)}</strong>
          <span class="muted">${escapeHtml(s.id)}</span>
        </div>
        <div class="meta">OwnerUid: ${escapeHtml(s.ownerUid)}</div>
      `;
      card.addEventListener("click", () => {
        state.ui.selectedSheetId = s.id;
        pendingBuff = { add: 0, mul: 1, label: null };
        renderView();
      });
      list.appendChild(card);
    }
    if (!sheets.length) list.innerHTML = `<div class="muted">Nenhuma ficha visível.</div>`;
  }

  function getSelectedSheet() {
    const sheets = visibleSheets();
    let s = state.room.sheetsById?.[state.ui.selectedSheetId] || null;
    if (!s || (!isMaster() && s.ownerUid !== state.me?.uid)) {
      s = sheets[0] || null;
      state.ui.selectedSheetId = s?.id || null;
    }
    return s;
  }

  function renderView() {
    const sheet = getSelectedSheet();
    if (!sheet) { view.innerHTML = `<div class="muted">Selecione ou crie uma ficha.</div>`; return; }

    const canEditInventory = isMaster() || (sheet.ownerUid === state.me?.uid);
    const canRoll = sheet.ownerUid === state.me?.uid; // player only own sheet
    const a = sheet.attributes || {};

    const buffPill = pendingBuff.label ? `<span class="pill">buff: ${escapeHtml(pendingBuff.label)} (add ${pendingBuff.add}, mul ${pendingBuff.mul})</span>` : `<span class="pill">buff: none</span>`;

    view.innerHTML = `
      <div class="row">
        <h3 style="margin:0;">${escapeHtml(sheet.name)}</h3>
        <span class="muted small">${escapeHtml(sheet.ownerUid)}</span>
      </div>

      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${buffPill}
        ${isMaster() ? `<span class="pill">MESTRE</span>` : `<span class="pill">JOGADOR</span>`}
      </div>

      <div class="attr-grid" style="margin-top:10px;">
        ${attrBox("QI", a.QI, canRoll)}
        ${attrBox("FOR", a.FOR, canRoll)}
        ${attrBox("DEX", a.DEX, canRoll)}
        ${attrBox("VIG", a.VIG, canRoll)}
      </div>

      <hr />

      <div class="section-title">Inventário</div>
      <div class="muted small">Itens: nome, descrição, modificador (+N ou *N), atributo usado</div>
      <div id="items-list" class="tablelike"></div>

      ${canEditInventory ? `
      <div class="sheet-card" style="margin-top:8px;">
        <div class="section-title">Adicionar item</div>
        <div class="form-row"><label>Nome</label><input id="item-name" maxlength="32" /></div>
        <div class="form-row"><label>Descrição</label><textarea id="item-desc" rows="2" maxlength="240"></textarea></div>
        <div class="grid-2">
          <div class="form-row"><label>Modificador</label><input id="item-mod" maxlength="12" placeholder="+3 ou *1.2" /></div>
          <div class="form-row"><label>Atributo</label><input id="item-attr" maxlength="8" placeholder="QI/FOR/DEX/VIG" /></div>
        </div>
        <button id="item-add" type="button">Adicionar</button>
      </div>` : ``}

      <hr />

      <div class="section-title">Vantagens</div>
      <div class="muted small">Modificador aplica SOMENTE quando clicar no nome (vira buff pendente pro próximo roll).</div>
      <div id="adv-list" class="tablelike"></div>

      ${canEditInventory ? `
      <div class="sheet-card" style="margin-top:8px;">
        <div class="section-title">Adicionar vantagem</div>
        <div class="form-row"><label>Nome</label><input id="adv-name" maxlength="32" /></div>
        <div class="form-row"><label>Descrição</label><textarea id="adv-desc" rows="2" maxlength="240"></textarea></div>
        <div class="grid-2">
          <div class="form-row"><label>Modificador</label><input id="adv-mod" maxlength="12" placeholder="+3 ou *1.2" /></div>
          <div class="form-row"><label>DT</label><input id="adv-dt" type="number" min="0" max="99" value="9" /></div>
        </div>
        <div class="grid-2">
          <div class="form-row"><label>Atributo</label><input id="adv-attr" maxlength="8" placeholder="QI/FOR/DEX/VIG" /></div>
          <div class="form-row"><label>Notas</label><input id="adv-notes" maxlength="120" placeholder="curtas" /></div>
        </div>
        <button id="adv-add" type="button">Adicionar</button>
      </div>` : ``}

      <hr />

      <div class="section-title">Notas do player</div>
      <div class="muted small">Somente o dono edita. Mestre visualiza.</div>
      <textarea id="player-notes" rows="5" ${sheet.ownerUid===state.me?.uid ? "" : "disabled"} placeholder="Notas...">${escapeHtml(sheet.playerNotes || "")}</textarea>
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${sheet.ownerUid===state.me?.uid ? `<button id="notes-save" type="button">Salvar notas</button>` : ``}
        ${isMaster() ? `<button id="btn-delete-sheet" class="danger" type="button">Deletar ficha</button>` : ``}
      </div>
    `;

    // roll handlers
    view.querySelectorAll("[data-attr]").forEach((el) => {
      el.addEventListener("click", async () => {
        if (!canRoll) return;
        const key = el.getAttribute("data-attr");
        const mod = Number(a[key] || 0);

        const mode = (prompt("Modo: normal / advantage / disadvantage", "normal") || "normal").trim();
        const res = rollD12({ mode, modifier: mod + (pendingBuff.add || 0), multiplier: pendingBuff.mul || 1 });

        const buffUsed = pendingBuff.label;
        pendingBuff = { add: 0, mul: 1, label: null };
        renderView();

        // push roll entry
        const rollId = await pushv(paths.roomRolls(state.roomId), {
          sheetId: sheet.id,
          sheetName: sheet.name,
          userUid: state.me.uid,
          userName: state.me.name,
          attr: key,
          mode,
          base: res.base,
          rolls: res.rolls,
          add: res.add,
          mul: res.mul,
          total: res.total,
          buffUsed: buffUsed || null,
          ts: Date.now()
        });

        rollSummary.innerHTML = `
          <div class="row"><strong>${escapeHtml(sheet.name)}</strong><span class="muted">${escapeHtml(key)}</span></div>
          <div style="margin-top:6px;">Rolagens: <strong>${res.rolls.join(", ")}</strong></div>
          <div>Base: <strong>${res.base}</strong> • Add: <strong>${res.add}</strong> • Mul: <strong>${res.mul}</strong> • Total: <strong>${res.total}</strong></div>
          ${buffUsed ? `<div class="muted small">Buff usado: ${escapeHtml(buffUsed)}</div>` : ``}
        `;
        setHidden(rollModal, false);
      });
    });

    // inventory render + handlers
    renderItems(sheet);
    renderAdvantages(sheet);

    // add item
    view.querySelector("#item-add")?.addEventListener("click", async () => {
      const n = safeText(view.querySelector("#item-name").value, 32);
      if (!n) return alert("Nome do item obrigatório.");
      const desc = safeText(view.querySelector("#item-desc").value, 240);
      const mod = safeText(view.querySelector("#item-mod").value, 12);
      const attr = safeText(view.querySelector("#item-attr").value, 8);
      const id = uid("item");
      const item = { id, name: n, desc, mod, attr };
      await setv(`${paths.roomSheet(state.roomId, sheet.id)}/inventory/items/${id}`, item);
      await upv(paths.roomSheet(state.roomId, sheet.id), { updatedAt: Date.now() });
    });

    // add advantage
    view.querySelector("#adv-add")?.addEventListener("click", async () => {
      const n = safeText(view.querySelector("#adv-name").value, 32);
      if (!n) return alert("Nome da vantagem obrigatório.");
      const desc = safeText(view.querySelector("#adv-desc").value, 240);
      const mod = safeText(view.querySelector("#adv-mod").value, 12);
      const dt = Number(view.querySelector("#adv-dt").value) || 9;
      const attr = safeText(view.querySelector("#adv-attr").value, 8);
      const notes = safeText(view.querySelector("#adv-notes").value, 120);
      const id = uid("adv");
      const adv = { id, name: n, desc, mod, dt, attr, notes };
      await setv(`${paths.roomSheet(state.roomId, sheet.id)}/inventory/advantages/${id}`, adv);
      await upv(paths.roomSheet(state.roomId, sheet.id), { updatedAt: Date.now() });
    });

    // save notes
    view.querySelector("#notes-save")?.addEventListener("click", async () => {
      const txt = safeText(view.querySelector("#player-notes").value, 1200);
      await upv(paths.roomSheet(state.roomId, sheet.id), { playerNotes: txt, updatedAt: Date.now() });
      alert("Notas salvas.");
    });

    // delete sheet
    view.querySelector("#btn-delete-sheet")?.addEventListener("click", async () => {
      if (!confirm("Deletar ficha?")) return;
      await del(paths.roomSheet(state.roomId, sheet.id));
      state.ui.selectedSheetId = null;
      pendingBuff = { add: 0, mul: 1, label: null };
    });
  }

  function renderItems(sheet) {
    const el = view.querySelector("#items-list");
    if (!el) return;
    const items = Object.values(sheet.inventory?.items || {});
    if (!items.length) { el.innerHTML = `<div class="muted">Nenhum item.</div>`; return; }
    el.innerHTML = items.map((it) => `
      <div class="sheet-card">
        <div class="row"><strong>${escapeHtml(it.name)}</strong><span class="muted">${escapeHtml(it.id)}</span></div>
        <div class="muted small">${escapeHtml(it.desc || "-")}</div>
        <div class="row"><span class="pill">mod ${escapeHtml(it.mod||"-")}</span><span class="pill">attr ${escapeHtml(it.attr||"-")}</span></div>
        ${isMaster() || sheet.ownerUid===state.me?.uid ? `<button data-del-item="${escapeHtml(it.id)}" class="danger" type="button">Remover</button>` : ``}
      </div>
    `).join("");

    el.querySelectorAll("[data-del-item]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del-item");
        await del(`${paths.roomSheet(state.roomId, sheet.id)}/inventory/items/${id}`);
        await upv(paths.roomSheet(state.roomId, sheet.id), { updatedAt: Date.now() });
      });
    });
  }

  function renderAdvantages(sheet) {
    const el = view.querySelector("#adv-list");
    if (!el) return;
    const advs = Object.values(sheet.inventory?.advantages || {});
    if (!advs.length) { el.innerHTML = `<div class="muted">Nenhuma vantagem.</div>`; return; }

    el.innerHTML = advs.map((a) => `
      <div class="sheet-card">
        <div class="row">
          <button data-apply-adv="${escapeHtml(a.id)}" type="button" style="justify-self:start;">${escapeHtml(a.name)}</button>
          <span class="muted">${escapeHtml(a.id)}</span>
        </div>
        <div class="muted small">${escapeHtml(a.desc || "-")}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span class="pill">mod ${escapeHtml(a.mod||"-")}</span>
          <span class="pill">DT ${escapeHtml(a.dt ?? "-")}</span>
          <span class="pill">attr ${escapeHtml(a.attr||"-")}</span>
          <span class="pill">notas ${escapeHtml(a.notes||"-")}</span>
        </div>
        ${isMaster() || sheet.ownerUid===state.me?.uid ? `<button data-del-adv="${escapeHtml(a.id)}" class="danger" type="button">Remover</button>` : ``}
      </div>
    `).join("");

    // apply buff
    el.querySelectorAll("[data-apply-adv]").forEach((b) => {
      b.addEventListener("click", () => {
        if (sheet.ownerUid !== state.me?.uid) return alert("Só o dono pode usar vantagens para rolar.");
        const id = b.getAttribute("data-apply-adv");
        const adv = sheet.inventory?.advantages?.[id];
        if (!adv) return;

        const parsed = parseMod(adv.mod || "");
        if (!parsed) return alert("Modificador inválido. Use +N ou *N (ex: +3, *1.2).");

        pendingBuff = { add: parsed.add, mul: parsed.mul, label: adv.name };
        renderView();
      });
    });

    el.querySelectorAll("[data-del-adv]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del-adv");
        await del(`${paths.roomSheet(state.roomId, sheet.id)}/inventory/advantages/${id}`);
        await upv(paths.roomSheet(state.roomId, sheet.id), { updatedAt: Date.now() });
      });
    });
  }

  function parseMod(s) {
    const v = String(s||"").trim();
    if (!v) return null;
    if (v.startsWith("+") || v.startsWith("-")) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return { add: n, mul: 1 };
    }
    if (v.startsWith("*")) {
      const n = Number(v.slice(1));
      if (!Number.isFinite(n)) return null;
      return { add: 0, mul: n };
    }
    return null;
  }

  function attrBox(k, v, enabled) {
    return `
      <div class="attr" data-attr="${k}" style="${enabled ? "" : "opacity:.55;cursor:not-allowed;"}">
        <div class="k">${k}</div>
        <div class="v">${Number(v) || 0}</div>
        <div class="muted small">${enabled ? "clique p/ rolar" : "bloqueado"}</div>
      </div>
    `;
  }

  function clampAttr(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;
    return Math.max(-2, Math.min(6, Math.trunc(n)));
  }

  function rerender() {
    renderList();
    renderView();
  }

  window.addEventListener("app:room:sheets", rerender);
  window.addEventListener("app:room:meta", rerender);
  window.addEventListener("app:session:ready", rerender);
  rerender();
}
