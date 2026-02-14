import { $, setHidden } from "../utils/dom.js";
import { state, isMaster } from "../state.js";
import { upv } from "../db/api.js";
import { paths } from "../db/paths.js";

let fogImg = null;

export function getFogImage() { return fogImg; }

export function setFogImageFromBase64(base64) {
  if (!base64) { fogImg = null; return; }
  const img = new Image();
  img.src = base64;
  fogImg = img;
}

export function mountFogModal() {
  const overlay = $("#modal-fog");
  const fileEl = $("#fog-file");
  const opacityEl = $("#fog-opacity");
  const btnApply = $("#fog-apply");
  const btnClear = $("#fog-clear");
  const btnCancel = $("#fog-cancel");

  function open() {
    if (!isMaster()) return;
    setHidden(overlay, false);
  }
  function close() { setHidden(overlay, true); fileEl.value = ""; }

  window.addEventListener("ui:fog:open", open);
  btnCancel.addEventListener("click", close);

  btnApply.addEventListener("click", async () => {
    if (!isMaster()) return;
    const opacity = Math.max(0, Math.min(1, Number(opacityEl.value) || 0.6));
    if (!fileEl.files?.[0]) {
      // allow just opacity update
      await upv(paths.roomMapFog(state.roomId), { opacity });
      close();
      return;
    }
    const base64 = await fileToDataURL(fileEl.files[0]);
    await upv(paths.roomMapFog(state.roomId), { imageBase64: base64, opacity });
    close();
  });

  btnClear.addEventListener("click", async () => {
    if (!isMaster()) return;
    await upv(paths.roomMapFog(state.roomId), { imageBase64: null });
    close();
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler arquivo."));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
