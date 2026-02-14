// Roll engine: d12 + modifiers (show mods then total)
import { parseMod } from "../core/validate.js";

export function d12() {
  return 1 + Math.floor(Math.random() * 12);
}

export function rollD12WithMods({ label, base = null, mods = [] }) {
  // mods: [{label, raw:"+3"|"*1.5"|...}]
  const die = d12();

  const parsed = [];
  let addSum = 0;
  let mul = 1;

  for (const m of (mods || [])) {
    const p = parseMod(m?.raw);
    if (!p.ok) {
      parsed.push({ label: m?.label || "mod", kind: "invalid", raw: p.raw });
      continue;
    }
    if (p.kind === "add") { addSum += p.value; parsed.push({ label: m?.label || "add", kind: "add", value: p.value, raw: p.raw }); }
    else if (p.kind === "mul") { mul *= p.value; parsed.push({ label: m?.label || "mul", kind: "mul", value: p.value, raw: p.raw }); }
    else parsed.push({ label: m?.label || "none", kind: "none", value: 0, raw: "" });
  }

  const pre = die + addSum;
  const total = Math.floor(pre * mul);

  return {
    label: label || "Roll",
    die,
    mods: parsed,
    addSum,
    mul,
    total,
    // display wants: list mods, then final
  };
}
