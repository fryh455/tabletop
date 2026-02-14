// UI Toast (no deps)
import { emit, on } from "../core/events.js";

export function toast(type, msg, ttlMs = 2500) {
  emit("ui:toast", { type, msg, ttlMs });
}

function el(id) { return document.getElementById(id); }

export function mountToastRoot() {
  const root = el("toastRoot");
  if (!root) return;

  root.classList.add("toastRoot");

  on("ui:toast", ({ type, msg, ttlMs } = {}) => {
    const item = document.createElement("div");
    item.className = "toastItem " + (type || "info");
    item.textContent = String(msg ?? "");
    root.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));

    const ttl = Number.isFinite(+ttlMs) ? +ttlMs : 2500;
    setTimeout(() => {
      item.classList.remove("show");
      setTimeout(() => item.remove(), 250);
    }, ttl);
  });
}
