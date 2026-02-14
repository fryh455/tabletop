export function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`DOM not found: ${sel}`);
  return el;
}
export function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function setHidden(el, hidden) { el.classList.toggle("hidden", !!hidden); el.setAttribute("aria-hidden", hidden ? "true" : "false"); }
export function safeText(s, max = 64) { const v = String(s ?? "").trim().slice(0, max); return v.replace(/\s+/g, " "); }
export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
