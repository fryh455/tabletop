// Master map editor (bg image url + transform)
import { setHtml } from "../dom.js";
import { loadSession } from "../../core/state.js";
import { on } from "../../core/events.js";
import { setMapContext, getMapState, updateMap } from "../../room/map.js";
import { toast } from "../toast.js";

function render(role) {
  const m = getMapState() || {};
  const bgUrl = m.bgUrl || "";
  const bgScale = Number(m.bgScale ?? 1);
  const bgX = Number(m.bgX ?? 0);
  const bgY = Number(m.bgY ?? 0);

  if (role !== "master") {
    setHtml("mapEditor", "<p>Apenas o mestre edita o mapa.</p>");
    return;
  }

  const html = `
    <div class="card">
      <b>Mapa (imagem de fundo)</b>
      <div class="muted" style="margin-top:6px">
        Dica: use URL direta de imagem (png/jpg/webp). Para PostImage, use o link direto.
      </div>

      <div style="margin-top:10px">
        <div class="muted">bgUrl</div>
        <input id="inpBgUrl" value="${bgUrl}" placeholder="https://.../map.png" style="width:100%"/>
      </div>

      <div class="row" style="margin-top:10px;flex-wrap:wrap">
        <div style="min-width:140px;flex:1">
          <div class="muted">Scale</div>
          <input id="inpBgScale" value="${bgScale}" />
        </div>
        <div style="min-width:140px;flex:1">
          <div class="muted">X</div>
          <input id="inpBgX" value="${bgX}" />
        </div>
        <div style="min-width:140px;flex:1">
          <div class="muted">Y</div>
          <input id="inpBgY" value="${bgY}" />
        </div>
      </div>

      <div class="row" style="justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
        <button type="button" id="btnApplyMap">Aplicar</button>
        <button type="button" id="btnClearMap" class="danger">Limpar</button>
      </div>
    </div>
  `;
  setHtml("mapEditor", html);

  document.getElementById("btnApplyMap")?.addEventListener("click", async () => {
    try {
      const next = {
        bgUrl: (document.getElementById("inpBgUrl")?.value || "").trim(),
        bgScale: Number(document.getElementById("inpBgScale")?.value || 1) || 1,
        bgX: Number(document.getElementById("inpBgX")?.value || 0) || 0,
        bgY: Number(document.getElementById("inpBgY")?.value || 0) || 0,
      };
      await updateMap(next);
      toast("ok", "Mapa atualizado");
    } catch (e) {
      toast("error", String(e?.message || e));
    }
  });

  document.getElementById("btnClearMap")?.addEventListener("click", async () => {
    try {
      await updateMap({ bgUrl: "", bgScale: 1, bgX: 0, bgY: 0 });
      toast("ok", "Mapa limpo");
    } catch (e) {
      toast("error", String(e?.message || e));
    }
  });
}

export function mountMapPanel() {
  const s = loadSession();
  const role = s.role || "player";
  const roomId = s.roomId || "";
  setMapContext({ roomId, role });

  on("map:update", () => render(role));
  render(role);
}
