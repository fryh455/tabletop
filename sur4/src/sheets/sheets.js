import { $, safeText, setHidden } from "../utils/dom.js";
import { state } from "../state.js";
import { uid } from "../utils/id.js";
import { rollD12 } from "../dice/dice.js";

export function mountSheetsUI() {
  const list = $("#sheets-list");
  const view = $("#sheet-view");
  const btnCreate = $("#btn-create-sheet");

  // modal
  const modal = $("#modal-sheet");
  const nameEl = $("#sheet-name");
  const ownerEl = $("#sheet-owner");
  const qiEl = $("#attr-qi");
  const forEl = $("#attr-for");
  const dexEl = $("#attr-dex");
  const vigEl = $("#attr-vig");
  const notesEl = $("#sheet-notes");
  const btnModalCreate = $("#sheet-create");
  const btnModalCancel = $("#sheet-cancel");

  const rollModal = $("#modal-roll");
  const rollSummary = $("#roll-summary");
  const btnRollClose = $("#roll-close");

  btnRollClose.addEventListener("click", () => setHidden(rollModal, true));

  function openCreateModal() {
    if (!state.session) return;
    if (state.session.role !== "master") {
      alert("Somente o mestre cria fichas no MVP.");
      return;
    }
    nameEl.value = "";
    ownerEl.value = "";
    qiEl.value = "1";
    forEl.value = "1";
    dexEl.value = "1";
    vigEl.value = "1";
    notesEl.value = "";
    setHidden(modal, false);
    nameEl.focus();
  }

  function closeCreateModal() {
    setHidden(modal, true);
  }

  btnCreate.addEventListener("click", openCreateModal);
  btnModalCancel.addEventListener("click", closeCreateModal);

  btnModalCreate.addEventListener("click", () => {
    const name = safeText(nameEl.value, 32);
    const owner = safeText(ownerEl.value, 24);
    if (!name) {
      alert("Digite o nome do personagem.");
      return;
    }
    if (!owner) {
      alert("Digite o dono (nome do jogador).");
      return;
    }

    const sheet = {
      id: uid("sheet"),
      ownerDisplayName: owner,
      name,
      attributes: {
        QI: clampAttr(qiEl.value),
        FOR: clampAttr(forEl.value),
        DEX: clampAttr(dexEl.value),
        VIG: clampAttr(vigEl.value)
      },
      notes: safeText(notesEl.value, 800),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    state.room.sheets.push(sheet);
    state.ui.selectedSheetId = sheet.id;
    closeCreateModal();
    render();
  });

  window.addEventListener("app:room:imported", render);
  window.addEventListener("app:session:ready", render);

  function render() {
    renderList();
    renderView();
    renderPlayersTab();
  }

  function renderList() {
    const me = state.session?.displayName;
    const role = state.session?.role;

    let visibleSheets = state.room.sheets;
    if (role === "player") {
      visibleSheets = state.room.sheets.filter(s => s.ownerDisplayName === me);
    }

    list.innerHTML = "";
    for (const s of visibleSheets) {
      const card = document.createElement("div");
      card.className = "sheet-card";
      card.innerHTML = `
        <div class="row">
          <strong>${s.name}</strong>
          <span class="muted">${s.id}</span>
        </div>
        <div class="meta">Dono: ${s.ownerDisplayName}</div>
      `;
      card.addEventListener("click", () => {
        state.ui.selectedSheetId = s.id;
        renderView();
      });
      list.appendChild(card);
    }

    if (visibleSheets.length === 0) {
      list.innerHTML = `<div class="muted">Nenhuma ficha visível.</div>`;
    }
  }

  function renderView() {
    const me = state.session?.displayName;
    const role = state.session?.role;

    let sheet = state.room.sheets.find(s => s.id === state.ui.selectedSheetId);
    if (!sheet) {
      // auto-select first visible
      const candidates = role === "player"
        ? state.room.sheets.filter(s => s.ownerDisplayName === me)
        : state.room.sheets;
      sheet = candidates[0] || null;
      state.ui.selectedSheetId = sheet?.id || null;
    }

    if (!sheet) {
      view.innerHTML = `<div class="muted">Selecione ou crie uma ficha.</div>`;
      return;
    }

    // Player only sees own
    if (role === "player" && sheet.ownerDisplayName !== me) {
      view.innerHTML = `<div class="muted">Sem permissão para ver essa ficha.</div>`;
      return;
    }

    // safe render notes via escapeHtml
    const attrs = sheet.attributes;

    view.innerHTML = `
      <div class="row"><h3 style="margin:0;">${sheet.name}</h3><span class="muted">${sheet.ownerDisplayName}</span></div>
      <div class="attr-grid" style="margin-top:10px;">
        ${attrBox("QI", attrs.QI)}
        ${attrBox("FOR", attrs.FOR)}
        ${attrBox("DEX", attrs.DEX)}
        ${attrBox("VIG", attrs.VIG)}
      </div>

      <div style="margin-top:10px;">
        <div class="muted small">Notas</div>
        <div style="white-space:pre-wrap; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px; background:rgba(0,0,0,0.12);">
          ${escapeHtml(sheet.notes || "-")}
        </div>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        ${role === "master" ? `<button id="btn-delete-sheet" class="danger" type="button">Deletar ficha</button>` : ""}
      </div>
    `;

    // bind attr rolls
    view.querySelectorAll("[data-attr]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-attr");
        const mod = Number(sheet.attributes[key] || 0);

        // MVP: normal roll + modifier; user can choose adv/dis via prompt
        const mode = prompt("Modo: normal / advantage / disadvantage", "normal");
        const res = rollD12({ mode: (mode || "normal").trim(), modifier: mod });

        rollSummary.innerHTML = `
          <div><strong>${sheet.name}</strong> • <span class="muted">${key}</span></div>
          <div style="margin-top:6px;">Rolagens: <strong>${res.rolls.join(", ")}</strong></div>
          <div>Base: <strong>${res.base}</strong> • Mod: <strong>${res.modifier}</strong> • Total: <strong>${res.total}</strong></div>
        `;
        setHidden(rollModal, false);
      });
    });

    // delete sheet
    const del = view.querySelector("#btn-delete-sheet");
    del?.addEventListener("click", () => {
      if (!confirm("Deletar ficha?")) return;
      const idx = state.room.sheets.findIndex(s => s.id === sheet.id);
      if (idx >= 0) state.room.sheets.splice(idx, 1);
      if (state.ui.selectedSheetId === sheet.id) state.ui.selectedSheetId = null;

      // unlink from tokens
      for (const t of state.room.tokens) {
        if (t.linkedSheetId === sheet.id) t.linkedSheetId = null;
      }
      render();
    });
  }

  function renderPlayersTab() {
    const el = $("#players-list");
    const ps = state.room.players || [];
    if (!ps.length) {
      el.innerHTML = `<div class="muted">Nenhum player local registrado.</div>`;
      return;
    }
    el.innerHTML = ps.map(p => `<div class="sheet-card"><div class="row"><strong>${p.displayName}</strong><span class="muted">${p.role}</span></div></div>`).join("");
  }

  render();
}

function clampAttr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(-2, Math.min(6, Math.trunc(n)));
}

function attrBox(k, v) {
  return `
    <div class="attr" data-attr="${k}">
      <div class="k">${k}</div>
      <div class="v">${Number(v) || 0}</div>
      <div class="muted small">clique p/ rolar</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
