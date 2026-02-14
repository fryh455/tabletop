// Simple tabs for room sidebar
import { el, show } from "./dom.js";

export const TAB_IDS = Object.freeze([
  "panelSheets",
  "panelTokens",
  "panelFog",
  "panelMarks",
  "panelCombat",
  "panelLogs",
  "panelSettings",
  "panelRoll",
]);

export const TAB_LABELS = Object.freeze({
  panelSheets: "Fichas",
  panelTokens: "Tokens",
  panelFog: "Fog",
  panelMarks: "Marcos",
  panelCombat: "Combate",
  panelLogs: "Logs",
  panelSettings: "Settings",
  panelRoll: "Roll",
});

export function mountTabs(onChange) {
  const bar = el("tabBar");
  if (!bar) return;

  bar.innerHTML = "";
  bar.classList.add("tabBar");

  for (const pid of TAB_IDS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tabBtn";
    b.dataset.panel = pid;
    b.textContent = TAB_LABELS[pid] || pid;
    b.addEventListener("click", () => setTab(pid, onChange));
    bar.appendChild(b);
  }

  // default
  setTab("panelSheets", onChange);
}

export function setTab(panelId, onChange) {
  for (const pid of TAB_IDS) show(pid, pid === panelId);
  const bar = el("tabBar");
  if (bar) {
    for (const b of Array.from(bar.querySelectorAll(".tabBtn"))) {
      b.classList.toggle("active", b.dataset.panel === panelId);
    }
  }
  try { onChange?.(panelId); } catch (_) {}
}
