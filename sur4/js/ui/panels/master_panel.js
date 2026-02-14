// Master panel: quick actions + assign + token grouping
import { on } from "../../core/events.js";
import { setHtml } from "../dom.js";
import { loadSession } from "../../core/state.js";
import { getTokens } from "../../room/tokens.js";
import { getSheets } from "../../room/sheets.js";
import { setMasterContext, masterCreateTokenQuick, masterCreateSheetQuick, assignTokenAndSheet } from "../../room/master.js";
import { toast } from "../toast.js";
import { setGroupsContext, getTokenGroups, createTokenGroup, addTokenToGroup, removeTokenFromGroup, deleteTokenGroup, renameTokenGroup } from "../../room/token_groups.js";

function render(role, roomId) {
  if (role !== "master") {
    setHtml("panelSettings", "<p>Somente mestre.</p>");
    return;
  }
  const tokens = getTokens();
  const sheets = getSheets();
  const groups = getTokenGroups();

  const tokenOpts = Object.values(tokens||{}).map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join("");
  const sheetOpts = Object.values(sheets||{}).map(s => `<option value="${s.id}">${s.name || s.id}</option>`).join("");
  const groupOpts = Object.values(groups||{}).map(g => `<option value="${g.id}">${g.name || g.id}</option>`).join("");

  const html = `
    <div class="card">
      <b>Ferramentas do Mestre</b>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <button type="button" id="btnMkToken">+ Token</button>
        <button type="button" id="btnMkSheet">+ Ficha</button>
      </div>

      <hr/>

      <div><b>Atribuir ficha a token</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <select id="selToken">${tokenOpts}</select>
        <select id="selSheet">${sheetOpts}</select>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <input id="inpOwnerUid" placeholder="ownerUid (auth.uid do player)"/>
        <button type="button" id="btnAssign">Atribuir</button>
      </div>

      <hr/>

      <div><b>Grupos de tokens (mover juntos)</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <select id="selGroup">${groupOpts}</select>
        <button type="button" id="btnNewGroup">+ Grupo</button>
        <button type="button" class="danger" id="btnDelGroup">Apagar</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <button type="button" id="btnAddToGroup">Adicionar token selecionado</button>
        <button type="button" id="btnRmFromGroup">Remover token selecionado</button>
        <button type="button" id="btnRenameGroup">Renomear</button>
      </div>

      <div class="muted" style="margin-top:8px">
        Regra: qualquer player dono de algum token do grupo pode arrastar o grupo inteiro.
      </div>
    </div>
  `;
  setHtml("panelSettings", html);

  document.getElementById("btnMkToken")?.addEventListener("click", async () => {
    try { await masterCreateTokenQuick(); toast("ok","Token criado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnMkSheet")?.addEventListener("click", async () => {
    try { await masterCreateSheetQuick(); toast("ok","Ficha criada"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnAssign")?.addEventListener("click", async () => {
    const tokenId = document.getElementById("selToken")?.value || "";
    const sheetId = document.getElementById("selSheet")?.value || "";
    const ownerUid = (document.getElementById("inpOwnerUid")?.value || "").trim();
    if (!tokenId || !sheetId) return;
    try {
      await assignTokenAndSheet(tokenId, sheetId, ownerUid || null);
      toast("ok","Atribuído");
    } catch(e) {
      toast("error", String(e?.message||e));
    }
  });

  document.getElementById("btnNewGroup")?.addEventListener("click", async () => {
    try {
      const name = prompt("Nome do grupo?") || "Grupo";
      const g = await createTokenGroup({ name, tokenIds: [] });
      toast("ok","Grupo criado");
      // auto-select: simple reload by render on update
    } catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnDelGroup")?.addEventListener("click", async () => {
    const gid = document.getElementById("selGroup")?.value || "";
    if (!gid) return;
    if (!confirm("Apagar grupo?")) return;
    try { await deleteTokenGroup(gid); toast("ok","Grupo apagado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnRenameGroup")?.addEventListener("click", async () => {
    const gid = document.getElementById("selGroup")?.value || "";
    if (!gid) return;
    try {
      const name = prompt("Novo nome do grupo?") || "Grupo";
      await renameTokenGroup(gid, name);
      toast("ok","Renomeado");
    } catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnAddToGroup")?.addEventListener("click", async () => {
    const gid = document.getElementById("selGroup")?.value || "";
    const tid = window.__SUR4_SELECTED_TOKEN_ID || "";
    if (!gid || !tid) { toast("error","Selecione grupo e token."); return; }
    try { await addTokenToGroup(gid, tid); toast("ok","Adicionado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnRmFromGroup")?.addEventListener("click", async () => {
    const gid = document.getElementById("selGroup")?.value || "";
    const tid = window.__SUR4_SELECTED_TOKEN_ID || "";
    if (!gid || !tid) { toast("error","Selecione grupo e token."); return; }
    try { await removeTokenFromGroup(gid, tid); toast("ok","Removido"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });
}

export function mountMasterPanel() {
  const s = loadSession();
  const role = s.role || "player";
  const roomId = s.roomId || "";

  setMasterContext({ roomId, role });
  setGroupsContext({ roomId, role });

  on("tokens:update", () => render(role, roomId));
  on("sheets:update", () => render(role, roomId));
  on("tokenGroups:update", () => render(role, roomId));
  render(role, roomId);
}
