// Master Clipboard Panel: token copy/cut/paste/clone/hide/delete
import { setHtml } from "../dom.js";
import { on } from "../../core/events.js";
import { loadSession } from "../../core/state.js";
import { toast } from "../toast.js";
import { copyToken, cutToken, pasteToken, cloneToken, hideToken, destroyToken, getClipboard, setClipboardCursor } from "../../room/clipboard.js";

let _selTokenId = "";

function render() {
  const s = loadSession();
  if (s.role !== "master") {
    setHtml("masterClipboard", "<p>Somente mestre.</p>");
    return;
  }
  const clip = getClipboard();
  const clipTxt = clip ? `${clip.kind} @ ${new Date(clip.at).toLocaleString()}` : "vazio";

  setHtml("masterClipboard", `
    <div class="card">
      <b>Clipboard do Mestre (tokens)</b>
      <div class="muted" style="margin-top:6px">Token selecionado: <b>${_selTokenId || "(nenhum)"}</b></div>
      <div class="muted">Clipboard: ${clipTxt}</div>

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" id="btnCopyTok">Copiar</button>
        <button type="button" id="btnCutTok" class="danger">Recortar</button>
        <button type="button" id="btnPasteTok">Colar no cursor</button>
        <button type="button" id="btnCloneTok">Clonar</button>
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" id="btnHideTok">Esconder</button>
        <button type="button" id="btnShowTok">Mostrar</button>
        <button type="button" id="btnDelTok" class="danger">Apagar</button>
      </div>

      <div class="muted" style="margin-top:10px">
        Dica: mova o mouse no mapa e clique “Colar no cursor”.
      </div>
    </div>
  `);

  const tokReq = () => { if (!_selTokenId) throw new Error("select_token"); };

  document.getElementById("btnCopyTok")?.addEventListener("click", () => {
    try { tokReq(); copyToken(_selTokenId); toast("ok","Copiado"); render(); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnCutTok")?.addEventListener("click", async () => {
    try { tokReq(); if(!confirm("Recortar token (apagar original)?")) return; await cutToken(_selTokenId); toast("ok","Recortado"); _selTokenId=""; render(); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnPasteTok")?.addEventListener("click", async () => {
    try { await pasteToken(); toast("ok","Colado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnCloneTok")?.addEventListener("click", async () => {
    try { tokReq(); await cloneToken(_selTokenId); toast("ok","Clonado"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnHideTok")?.addEventListener("click", async () => {
    try { tokReq(); await hideToken(_selTokenId, true); toast("ok","Escondido"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnShowTok")?.addEventListener("click", async () => {
    try { tokReq(); await hideToken(_selTokenId, false); toast("ok","Visível"); }
    catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnDelTok")?.addEventListener("click", async () => {
    try { tokReq(); if(!confirm("Apagar token?")) return; await destroyToken(_selTokenId); toast("ok","Apagado"); _selTokenId=""; render(); }
    catch(e){ toast("error", String(e?.message||e)); }
  });
}

export function mountMasterClipboardPanel() {
  const s = loadSession();
  if (s.role !== "master") { setHtml("masterClipboard", "<p>Somente mestre.</p>"); return; }

  on("token:select", ({ tokenId }) => { _selTokenId = tokenId || ""; render(); });
  on("map:cursor", (w) => { setClipboardCursor(w); });
  render();
}
