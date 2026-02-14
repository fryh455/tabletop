// JSON import (master): bulk create sheets from JSON
import { isMaster } from "../core/permissions.js";
import { createSheet } from "./sheets.js";
import { normalizeItem, normalizeAdv } from "../rules/inventory_math.js";

let _ctx = { roomId: null, role: "player" };
export function setImporterContext(ctx) { _ctx = { ..._ctx, ...(ctx||{}) }; }
function assertMaster() { if (!isMaster(_ctx.role)) throw new Error("not_master"); }

function clamp(n, a, b) { n = Number(n); if (!Number.isFinite(n)) return a; return Math.max(a, Math.min(b, n)); }
function uid() { return "id_" + Math.random().toString(36).slice(2, 10); }

export function parseSheetsJson(text) {
  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { return { ok:false, error:"JSON inválido" }; }

  let arr = null;
  if (Array.isArray(obj)) arr = obj;
  else if (obj && Array.isArray(obj.sheets)) arr = obj.sheets;
  else return { ok:false, error:"Formato inválido: esperado array ou {sheets:[...]}" };

  const out = [];
  const errors = [];

  for (let i=0;i<arr.length;i++) {
    const raw = arr[i] || {};
    const name = String(raw.name || raw.nome || "Personagem").slice(0,48);

    const age = raw.age ?? raw.idade ?? 0;
    const attrs = raw.attrs || raw.atributos || {};
    const QI = clamp(attrs.QI ?? attrs.qi ?? 1, -2, 6);
    const FOR = clamp(attrs.FOR ?? attrs.for ?? 1, -2, 6);
    const DEX = clamp(attrs.DEX ?? attrs.dex ?? 1, -2, 6);
    const VIG = clamp(attrs.VIG ?? attrs.vig ?? 1, -2, 6);

    const items = Array.isArray(raw.items || raw.itens) ? (raw.items || raw.itens) : [];
    const advs = Array.isArray(raw.advantages || raw.vantagens) ? (raw.advantages || raw.vantagens) : [];
    const dis = Array.isArray(raw.disadvantages || raw.desvantagens) ? (raw.disadvantages || raw.desvantagens) : [];

    const inv = items.map(it => normalizeItem({ ...it, id: it?.id || uid() }));
    const advantages = advs.map(a => normalizeAdv({ ...a, id: a?.id || uid() }));
    const disadvantages = dis.map(a => normalizeAdv({ ...a, id: a?.id || uid(), name: a?.name || a?.nome || "Desvantagem" }));

    out.push({
      name,
      bio: { idade: clamp(age, 0, 999), peso: clamp(raw.peso ?? raw.weight ?? 0, 0, 999), altura: clamp(raw.altura ?? raw.height ?? 0, 0, 999) },
      attrs: { QI, FOR, DEX, VIG },
      mental: clamp(raw.mental ?? 0, -12, 5),
      notes: String(raw.notes || raw.notas || "").slice(0, 800),
      inventory: inv,
      advantages,
      disadvantages,
    });
  }

  return { ok:true, sheets: out, errors };
}

export async function importSheetsBulk(sheets) {
  assertMaster();
  const created = [];
  for (const s of (sheets || [])) {
    const sheet = await createSheet(s);
    // set extra fields not covered by createSheet default
    // createSheet already writes inventory/advantages/notes/mental/bio/attrs
    created.push(sheet);
  }
  return created;
}
