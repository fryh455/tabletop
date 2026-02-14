// Fog panel: master creates types; draw polygons on canvas via events
import { setHtml } from "../dom.js";
import { loadSession } from "../../core/state.js";
import { toast } from "../toast.js";
import { on, emit } from "../../core/events.js";
import { setFogContext, getFogTypes, getFogAreas, createFogType, updateFogType, deleteFogType, deleteFogArea } from "../../room/fog.js";

let _selectedTypeId = null;

function render(role) {
  const types = getFogTypes();
  const areas = getFogAreas();

  if (role !== "master") {
    setHtml("fogTypeEditor", "<p>Fog é controlada pelo mestre.</p>");
    return;
  }

  const typeList = Object.values(types || {}).map(t => `
    <li class="liCard">
      <div class="row" style="justify-content:space-between;align-items:center">
        <button type="button" class="linkBtn" data-sel-type="${t.id}">${t.name}</button>
        <button type="button" class="danger" data-del-type="${t.id}">Apagar</button>
      </div>
      <div class="muted">opacity: ${t.opacity ?? 1} | players: ${(t.visibleTo||[]).join(", ") || "ALL"}</div>
    </li>
  `).join("");

  const selected = _selectedTypeId ? (types[_selectedTypeId] || null) : null;

  const areasList = Object.values(areas || {}).map(a => `
    <li class="liCard">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span>area ${a.id.slice(-5)} | type: ${(types[a.typeId]?.name)||a.typeId||"?"}</span>
        <button type="button" class="danger" data-del-area="${a.id}">Apagar</button>
      </div>
      <div class="muted">pts: ${(a.pts||[]).length}</div>
    </li>
  `).join("");

  const editor = selected ? `
    <div class="card" style="margin-top:10px">
      <b>Tipo selecionado: ${selected.name}</b>
      <div class="muted" style="margin-top:6px">visibleTo vazio = TODOS os players.</div>

      <div style="margin-top:8px">
        <div class="muted">Nome</div>
        <input id="fogName" value="${selected.name || ""}" style="width:100%"/>
      </div>

      <div style="margin-top:8px">
        <div class="muted">Sprite URL (opcional)</div>
        <input id="fogSprite" value="${selected.spriteUrl || ""}" style="width:100%"/>
      </div>

      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <div style="min-width:140px;flex:1">
          <div class="muted">Opacity (0..1)</div>
          <input id="fogOp" value="${selected.opacity ?? 1}"/>
        </div>
        <div style="min-width:220px;flex:2">
          <div class="muted">VisibleTo (uids separados por vírgula)</div>
          <input id="fogVis" value="${(selected.visibleTo||[]).join(",")}" style="width:100%"/>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
        <button type="button" id="btnSaveType">Salvar</button>
        <button type="button" id="btnDrawArea" class="primary">Desenhar Área</button>
      </div>
      <div class="muted" style="margin-top:8px">
        Desenho: clique para pontos, <b>duplo-clique</b> para fechar e salvar.
      </div>
    </div>
  ` : `<div class="muted" style="margin-top:10px">Selecione um tipo para editar/desenhar.</div>`;

  setHtml("fogTypeEditor", `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Fog (tipos)</b>
        <button type="button" id="btnNewType">+ Tipo</button>
      </div>
      <ul class="list" style="margin-top:8px">${typeList || "<li><i>nenhum</i></li>"}</ul>
    </div>
    ${editor}
    <div class="card" style="margin-top:10px">
      <b>Áreas</b>
      <ul class="list" style="margin-top:8px">${areasList || "<li><i>nenhuma</i></li>"}</ul>
    </div>
  `);

  document.getElementById("btnNewType")?.addEventListener("click", async () => {
    try {
      const name = prompt("Nome do tipo de fog?") || "Fog";
      const opacity = prompt("Opacity 0..1? (ex: 1)") || "1";
      const spriteUrl = prompt("Sprite URL? (opcional)") || "";
      const visibleTo = prompt("VisibleTo uids (separado por vírgula) (vazio = ALL)") || "";
      const list = visibleTo.split(",").map(s => s.trim()).filter(Boolean);
      const t = await createFogType({ name, opacity: Number(opacity)||1, spriteUrl, visibleTo: list });
      _selectedTypeId = t.id;
      toast("ok", "Tipo criado");
    } catch(e) {
      toast("error", String(e?.message||e));
    }
  });

  document.querySelectorAll("[data-sel-type]").forEach(b => b.addEventListener("click", () => {
    _selectedTypeId = b.getAttribute("data-sel-type");
    render(role);
  }));

  document.querySelectorAll("[data-del-type]").forEach(b => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del-type");
    if (!confirm("Apagar tipo?")) return;
    try { await deleteFogType(id); if (_selectedTypeId===id) _selectedTypeId=null; toast("ok","Apagado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  }));

  document.querySelectorAll("[data-del-area]").forEach(b => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del-area");
    if (!confirm("Apagar área?")) return;
    try { await deleteFogArea(id); toast("ok","Área apagada"); }
    catch(e){ toast("error", String(e?.message||e)); }
  }));

  document.getElementById("btnSaveType")?.addEventListener("click", async () => {
    try {
      const name = document.getElementById("fogName")?.value || "Fog";
      const spriteUrl = document.getElementById("fogSprite")?.value || "";
      const opacity = Number(document.getElementById("fogOp")?.value || 1) || 1;
      const vis = (document.getElementById("fogVis")?.value || "").split(",").map(s=>s.trim()).filter(Boolean);
      await updateFogType(_selectedTypeId, { name, spriteUrl, opacity, visibleTo: vis });
      toast("ok","Salvo");
    } catch(e) {
      toast("error", String(e?.message||e));
    }
  });

  document.getElementById("btnDrawArea")?.addEventListener("click", () => {
    if (!_selectedTypeId) return;
    emit("fog:draw:start", { typeId: _selectedTypeId });
    toast("info", "Desenho ativo: clique pontos, duplo clique fecha.");
  });
}

export function mountFogPanel() {
  const s = loadSession();
  setFogContext({ roomId: s.roomId || "", role: s.role || "player", uid: s.uid || "" });

  on("fog:types", () => render(s.role || "player"));
  on("fog:areas", () => render(s.role || "player"));
  render(s.role || "player");
}
