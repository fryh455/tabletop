import { $, $all, setHidden, safeText } from "../utils/dom.js";
import { state, isMaster } from "../state.js";
import { openLoginModal } from "./modalLogin.js";
import { upv } from "../db/api.js";
import { paths } from "../db/paths.js";

export function wireTabs() {
  const tabs = $all(".tab");
  const panels = { sheets: $("#tab-sheets"), inspector: $("#tab-inspector"), rolls: $("#tab-rolls") };

  function select(name) {
    for (const t of tabs) t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false");
    for (const [k, el] of Object.entries(panels)) el.classList.toggle("hidden", k !== name);
  }

  tabs.forEach((t) => t.addEventListener("click", () => select(t.dataset.tab)));
  select("sheets");
}

export function wireTopbar() {
  const badge = $("#session-badge");
  const btnSwitch = $("#btn-switch-user");
  const btnRoom = $("#btn-room");

  const btnLock = $("#btn-lock");
  const btnFog = $("#btn-fog");
  const btnFogImage = $("#btn-fog-image");
  const btnSyncView = $("#btn-sync-view");
  const btnZoomPlus = $("#btn-zoom-plus");
  const btnZoomMinus = $("#btn-zoom-minus");

  function renderBadge() {
    const rid = state.roomId || "-";
    const name = state.me?.name ? safeText(state.me.name, 24) : "—";
    const uid = state.me?.uid ? safeText(state.me.uid, 10) : "—";
    const role = state.role || "—";
    badge.textContent = `${name} • ${role} • room=${rid} • uid=${uid}`;
  }

  function renderMasterControls() {
    const m = isMaster();
    setHidden(btnLock, !m);
    setHidden(btnFog, !m);
    setHidden(btnFogImage, !m);
    setHidden(btnSyncView, !m);
    setHidden(btnZoomPlus, !m);
    setHidden(btnZoomMinus, !m);
  }

  btnSwitch.addEventListener("click", () => {
    // "logout" local: clear page state by reload without persisting
    location.hash = "";
    location.reload();
  });

  btnRoom.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}#/room/${state.roomId}`;
    prompt("Copie o link/código:", url);
  });

  btnLock.addEventListener("click", async () => {
    const locked = !state.room.map?.locked;
    await upv(paths.roomMap(state.roomId), { locked });
  });

  btnFog.addEventListener("click", async () => {
    const enabled = !state.room.map?.fog?.enabled;
    await upv(paths.roomMapFog(state.roomId), { enabled });
  });

  btnFogImage.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("ui:fog:open"));
  });

  btnSyncView.addEventListener("click", async () => {
    const enabled = !state.room.map?.view?.enabled;
    await upv(paths.roomMapView(state.roomId), { enabled, zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
  });

  btnZoomPlus.addEventListener("click", async () => {
    state.ui.zoom = Math.min(8, state.ui.zoom * 1.1);
    if (state.room.map?.view?.enabled) await upv(paths.roomMapView(state.roomId), { zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
  });
  btnZoomMinus.addEventListener("click", async () => {
    state.ui.zoom = Math.max(0.2, state.ui.zoom / 1.1);
    if (state.room.map?.view?.enabled) await upv(paths.roomMapView(state.roomId), { zoom: state.ui.zoom, panX: state.ui.panX, panY: state.ui.panY });
  });

  function renderRoomMapButtons() {
    const locked = !!state.room.map?.locked;
    btnLock.dataset.on = locked ? "1" : "0";
    btnLock.textContent = locked ? "Mapa: BLOQ" : "Mapa: LIVRE";

    const fog = !!state.room.map?.fog?.enabled;
    btnFog.dataset.on = fog ? "1" : "0";
    btnFog.textContent = fog ? "Fog: ON" : "Fog: OFF";

    const sv = !!state.room.map?.view?.enabled;
    btnSyncView.dataset.on = sv ? "1" : "0";
    btnSyncView.textContent = sv ? "Sync View: ON" : "Sync View: OFF";
  }

  window.addEventListener("app:room:meta", () => { renderBadge(); renderMasterControls(); });
  window.addEventListener("app:room:map", () => { renderRoomMapButtons(); });

  // initial
  renderBadge();
  renderMasterControls();
  renderRoomMapButtons();
}
