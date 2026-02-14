// Inventory math helpers
import { parseMod, validateAttrUsed } from "../core/validate.js";

export function sumInventoryWeight(items) {
  let w = 0;
  for (const it of (items || [])) {
    const ww = Number(it?.weight);
    if (Number.isFinite(ww)) w += ww;
  }
  return w;
}

export function normalizeItem(raw) {
  return {
    id: raw?.id || null,
    name: String(raw?.name || "Item").slice(0, 48),
    desc: String(raw?.desc || "").slice(0, 300),
    mod: String(raw?.mod || "").slice(0, 24), // "+3" "*1.5"
    attr: validateAttrUsed(raw?.attr).ok ? validateAttrUsed(raw?.attr).value : null,
    weight: Number.isFinite(+raw?.weight) ? +raw.weight : 0,
  };
}

export function normalizeAdv(raw) {
  return {
    id: raw?.id || null,
    name: String(raw?.name || "Vantagem").slice(0, 48),
    desc: String(raw?.desc || "").slice(0, 400),
    mod: String(raw?.mod || "").slice(0, 24),
    dt: Number.isFinite(+raw?.dt) ? Math.trunc(+raw.dt) : 0,
    attr: validateAttrUsed(raw?.attr).ok ? validateAttrUsed(raw?.attr).value : null,
    notes: String(raw?.notes || "").slice(0, 400),
  };
}

export function modEntry(label, raw) {
  const p = parseMod(raw);
  if (!p.ok) return { label, raw: p.raw };
  return { label, raw: p.raw };
}
