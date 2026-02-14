// UI Modal (no deps)
import { emit, on } from "../core/events.js";

function el(id) { return document.getElementById(id); }

export function openModal(title, html) {
  emit("ui:modal:open", { title, html });
}

export function closeModal() {
  emit("ui:modal:close", {});
}

export function mountModal() {
  const back = el("modalBack");
  const title = el("modalTitle");
  const body = el("modalBody");
  const close = el("modalClose");

  if (!back || !title || !body || !close) return;

  function setVisible(v) {
    back.classList.toggle("hidden", !v);
  }

  on("ui:modal:open", ({ title: t, html } = {}) => {
    title.textContent = String(t ?? "");
    body.innerHTML = String(html ?? "");
    setVisible(true);
  });

  on("ui:modal:close", () => setVisible(false));

  close.addEventListener("click", () => closeModal());
  back.addEventListener("click", (e) => {
    if (e.target === back) closeModal();
  });

  // start hidden
  setVisible(true);
  setVisible(false);
}
