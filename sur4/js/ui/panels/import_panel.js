// Import panel (master) - paste JSON -> validate -> import
import { setHtml } from "../dom.js";
import { loadSession } from "../../core/state.js";
import { toast } from "../toast.js";
import { setImporterContext, parseSheetsJson, importSheetsBulk } from "../../room/importer.js";

let _lastParsed = null;

function render(role) {
  if (role !== "master") {
    setHtml("importEditor", "<p>Apenas o mestre importa fichas.</p>");
    return;
  }
  const html = `
    <div class="card">
      <b>Importar fichas (JSON)</b>
      <div class="muted" style="margin-top:6px">
        Aceita: <code>[{name, age, attrs{QI,FOR,DEX,VIG}, items[], advantages[], disadvantages[]}]</code> ou <code>{sheets:[...]}</code>
      </div>
      <textarea id="taJson" rows="10" style="width:100%;margin-top:10px" placeholder='[{"name":"A","age":20,"attrs":{"QI":1,"FOR":2,"DEX":1,"VIG":2}}]'></textarea>
      <div class="row" style="justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
        <button type="button" id="btnValidate">Validar</button>
        <button type="button" id="btnImport" class="primary">Importar</button>
      </div>
      <div id="importPreview" style="margin-top:10px"></div>
    </div>
  `;
  setHtml("importEditor", html);

  document.getElementById("btnValidate")?.addEventListener("click", () => {
    const txt = document.getElementById("taJson")?.value || "";
    const p = parseSheetsJson(txt);
    _lastParsed = p.ok ? p.sheets : null;
    setHtml("importPreview", p.ok
      ? `<div class="muted">OK: ${p.sheets.length} fichas prontas para importar.</div>`
      : `<div class="muted" style="color:#b00">Erro: ${p.error}</div>`);
  });

  document.getElementById("btnImport")?.addEventListener("click", async () => {
    try {
      const txt = document.getElementById("taJson")?.value || "";
      const p = parseSheetsJson(txt);
      if (!p.ok) { toast("error", p.error); return; }
      await importSheetsBulk(p.sheets);
      toast("ok", `Importadas: ${p.sheets.length}`);
      setHtml("importPreview", `<div class="muted">Importadas: ${p.sheets.length}</div>`);
    } catch (e) {
      toast("error", String(e?.message || e));
    }
  });
}

export function mountImportPanel() {
  const s = loadSession();
  const role = s.role || "player";
  const roomId = s.roomId || "";
  setImporterContext({ roomId, role });
  render(role);
}
