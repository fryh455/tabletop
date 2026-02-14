// Room layout shell (adds camera tools in master tab)
import { setHtml } from "./dom.js";
import { loadSession, saveSession } from "../core/state.js";
import { toast } from "./toast.js";
import { mountTokenInspector } from "./token_inspector.js";

export function initRoomShell() {
  const s = loadSession();
  setHtml("app", `
    <div class="topbar">
      <div class="brand">SUR4</div>
      <div class="spacer"></div>
      <div class="pill">${s.displayName || ""}</div>
      <button id="btnLeave" class="danger">Sair</button>
    </div>

    <div class="layout">
      <div class="left">
        <div class="canvasWrap">
          <canvas id="mapCanvas"></canvas>
        </div>

        <div class="card" style="margin-top:10px">
          <b>Rolagens</b>
          <div id="rollOut" class="muted" style="margin-top:6px"></div>
        </div>
      </div>

      <div class="right">
        <div class="tabs">
          <button class="tabBtn" data-tab="sheet">Ficha</button>
          <button class="tabBtn" data-tab="inv">Inventário</button>
          <button class="tabBtn" data-tab="fog">Fog</button>
          <button class="tabBtn" data-tab="marks">Marcos</button>
          <button class="tabBtn" data-tab="map">Mapa</button>
          <button class="tabBtn" data-tab="import">Import</button>
          <button class="tabBtn" data-tab="master">Mestre</button>
        </div>

        <div class="panel" id="panel_sheet">
          <div id="sheetView"></div>
        </div>

        <div class="panel" id="panel_inv" style="display:none">
          <div id="inventoryView"></div>
        </div>

        <div class="panel" id="panel_fog" style="display:none">
          <div id="fogTypeEditor"></div>
        </div>

        <div class="panel" id="panel_marks" style="display:none">
          <div id="markEditor"></div>
        </div>

        <div class="panel" id="panel_map" style="display:none">
          <div id="mapEditor"></div>
        </div>

        <div class="panel" id="panel_import" style="display:none">
          <div id="importEditor"></div>
        </div>

        <div class="panel" id="panel_master" style="display:none">
          <div id="panelSettings"></div>
          <div id="cameraTools" style="margin-top:10px"></div>
          <div id="masterClipboard" style="margin-top:10px"></div>
          <div id="tokenInspector" style="margin-top:10px"></div>
        </div>
      </div>
    </div>
  `);

  // tabs
  const map = {
    sheet: "panel_sheet",
    inv: "panel_inv",
    fog: "panel_fog",
    marks: "panel_marks",
    map: "panel_map",
    import: "panel_import",
    master: "panel_master",
  };
  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-tab");
      Object.values(map).forEach(id => (document.getElementById(id).style.display="none"));
      document.getElementById(map[k]).style.display = "block";
    });
  });

  document.getElementById("btnLeave")?.addEventListener("click", () => {
    saveSession({});
    toast("info","Sessão limpa.");
    location.href = "./index.html";
  });

  mountTokenInspector();
}
