// Panels init (scaffold + mounts)
import { setHtml } from "../dom.js";
import { mountRollPanel } from "./roll_panel.js";
import { mountInventoryPanel } from "./inventory_panel.js";
import { mountMasterPanel } from "./master_panel.js";
import { mountMapPanel } from "./map_panel.js";
import { mountImportPanel } from "./import_panel.js";
import { mountFogPanel } from "./fog_panel.js";
import { mountMarksPanel } from "./marks_panel.js";
import { mountMasterClipboardPanel } from "./master_clipboard_panel.js";
import { mountCameraPanel } from "./camera_panel.js";
import { loadSession } from "../../core/state.js";

export function initPanelsScaffold() {
  setHtml("sheetView", "<p>Carregando ficha…</p>");
  setHtml("tokenInspector", "<p>Selecione um token.</p>");
  setHtml("fogTypeEditor", "<p>Carregando fog…</p>");
  setHtml("markEditor", "<p>Carregando marcos…</p>");
  setHtml("rollOut", "<p>Abra uma rolagem clicando em um atributo/DT/item/vantagem.</p>");
  setHtml("panelSettings", "<p>Carregando…</p>");
  setHtml("masterClipboard", "<p>Carregando clipboard…</p>");
  setHtml("cameraTools", "<p>Carregando câmera…</p>");
  setHtml("mapEditor", "<p>Carregando mapa…</p>");
  setHtml("importEditor", "<p>Carregando import…</p>");

  mountRollPanel();
  mountInventoryPanel();
  mountMasterPanel();
  mountMasterClipboardPanel();
  mountMapPanel();
  mountImportPanel();
  mountFogPanel();
  mountMarksPanel();

  const s = loadSession();
  mountCameraPanel(s.roomId || "", s.role || "player", s.uid || "");
}
