import { $ } from "./dom.js";
import { state, resetStateForRoom } from "../state.js";

export function wireExportImport() {
  const btnExport = $("#btn-export");
  const inputImport = $("#import-file");

  btnExport.addEventListener("click", () => {
    const payload = { version: 1, exportedAt: Date.now(), roomId: state.roomId, room: state.room };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sur4_room_${state.roomId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  inputImport.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!json || json.version !== 1 || !json.room) throw new Error("JSON inválido.");

      resetStateForRoom(state.roomId);
      state.room.players = Array.isArray(json.room.players) ? json.room.players : [];
      state.room.tokens = Array.isArray(json.room.tokens) ? json.room.tokens : [];
      state.room.sheets = Array.isArray(json.room.sheets) ? json.room.sheets : [];

      window.dispatchEvent(new CustomEvent("app:room:imported"));
    } catch (err) {
      alert(`Falha ao importar: ${err?.message || err}`);
    } finally {
      e.target.value = "";
    }
  });
}
