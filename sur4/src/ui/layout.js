import { $, $all, safeText } from "../utils/dom.js";
import { state } from "../state.js";
import { openAuthModal } from "./modalAuth.js";

export function wireTopbar() {
  const badge = $("#session-badge");
  const btnSwitch = $("#btn-switch-user");
  const btnCopy = $("#btn-copy-link");

  function renderBadge() {
    if (!state.session) return (badge.textContent = "Sem sessão");
    badge.textContent = `${safeText(state.session.displayName, 24)} • ${state.session.role} • ${state.session.roomId}`;
  }

  btnSwitch.addEventListener("click", () => {
    state.session = null;
    window.dispatchEvent(new CustomEvent("app:session:cleared"));
    openAuthModal(state.roomId);
  });

  btnCopy.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#/room/${state.roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      btnCopy.textContent = "Link copiado!";
      setTimeout(() => (btnCopy.textContent = "Copiar link"), 900);
    } catch {
      prompt("Copie o link:", url);
    }
  });

  window.addEventListener("app:session:ready", renderBadge);
  window.addEventListener("app:session:cleared", renderBadge);
  renderBadge();
}

export function wireTabs() {
  const tabs = $all(".tab");
  const panels = { sheets: $("#tab-sheets"), inspector: $("#tab-inspector"), players: $("#tab-players") };

  function select(name) {
    for (const t of tabs) t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false");
    for (const [k, el] of Object.entries(panels)) el.classList.toggle("hidden", k !== name);
  }

  tabs.forEach((t) => t.addEventListener("click", () => select(t.dataset.tab)));
  select("sheets");
}
