// Camera controls panel (master only): broadcast center; per-player focus lock
import { setHtml } from "../dom.js";
import { on } from "../../core/events.js";
import { loadSession } from "../../core/state.js";
import { toast } from "../toast.js";
import { getTokens } from "../../room/tokens.js";
import { getPlayers } from "../../room/sync.js";
import { setCameraContext, masterSetCenterAllPlayers, masterSetPlayerFocus, masterClearPlayerFocus } from "../../room/camera_follow.js";

function render() {
  const s = loadSession();
  if (s.role !== "master") {
    setHtml("cameraTools", "<p>Somente mestre.</p>");
    return;
  }

  const tokens = Object.values(getTokens()||{});
  const tokOpts = tokens.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join("");

  const players = Object.values(getPlayers()||{});
  const plyOpts = players.map(p => `<option value="${p.uid}">${p.displayName || p.uid}</option>`).join("");

  setHtml("cameraTools", `
    <div class="card">
      <b>Câmera / Centralizar</b>

      <div style="margin-top:8px"><b>Broadcast (todos players)</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <select id="camTokSel">${tokOpts}</select>
        <button type="button" id="btnCamAllTok">Centralizar no token</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <input id="camX" placeholder="x" style="width:90px"/>
        <input id="camY" placeholder="y" style="width:90px"/>
        <button type="button" id="btnCamAllXY">Centralizar (x,y)</button>
      </div>

      <hr/>

      <div><b>Travar player (override)</b></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <select id="camPlayerSel">${plyOpts}</select>
        <select id="camPlayerTokSel">${tokOpts}</select>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <button type="button" id="btnLockPlayerToTok">Travar no token</button>
        <button type="button" id="btnUnlockPlayer">Destravar</button>
      </div>

      <div class="muted" style="margin-top:8px">
        Observação: “Travar” força a câmera do player a seguir um alvo.
      </div>
    </div>
  `);

  document.getElementById("btnCamAllTok")?.addEventListener("click", async () => {
    try {
      const tokenId = document.getElementById("camTokSel")?.value || "";
      if (!tokenId) return;
      await masterSetCenterAllPlayers({ mode:"token", tokenId });
      toast("ok","Broadcast aplicado");
    } catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnCamAllXY")?.addEventListener("click", async () => {
    try {
      const x = Number(document.getElementById("camX")?.value);
      const y = Number(document.getElementById("camY")?.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { toast("error","x/y inválido"); return; }
      await masterSetCenterAllPlayers({ mode:"xy", x, y });
      toast("ok","Broadcast aplicado");
    } catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnLockPlayerToTok")?.addEventListener("click", async () => {
    try {
      const uid = document.getElementById("camPlayerSel")?.value || "";
      const tokenId = document.getElementById("camPlayerTokSel")?.value || "";
      if (!uid || !tokenId) return;
      await masterSetPlayerFocus(uid, { mode:"token", tokenId });
      toast("ok","Player travado");
    } catch(e){ toast("error", String(e?.message||e)); }
  });

  document.getElementById("btnUnlockPlayer")?.addEventListener("click", async () => {
    try {
      const uid = document.getElementById("camPlayerSel")?.value || "";
      if (!uid) return;
      await masterClearPlayerFocus(uid);
      toast("ok","Player destravado");
    } catch(e){ toast("error", String(e?.message||e)); }
  });
}

export function mountCameraPanel(roomId, role, uid){
  setCameraContext({ roomId, role, uid });
  on("players:update", render);
  on("tokens:update", render);
  render();
}
