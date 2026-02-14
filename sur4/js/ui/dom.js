// DOM helpers (safe)
export function el(id) { return document.getElementById(id); }
export function qs(sel, root=document) { return root.querySelector(sel); }
export function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

export function setText(nodeOrId, text) {
  const n = typeof nodeOrId === "string" ? el(nodeOrId) : nodeOrId;
  if (!n) return;
  n.textContent = String(text ?? "");
}

export function setHtml(nodeOrId, html) {
  const n = typeof nodeOrId === "string" ? el(nodeOrId) : nodeOrId;
  if (!n) return;
  n.innerHTML = String(html ?? "");
}

export function show(id, v=true) {
  const n = el(id);
  if (!n) return;
  n.classList.toggle("hidden", !v);
}
