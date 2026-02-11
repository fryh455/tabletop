import { ensureNum } from "./validation.js";

export function inventoryLimit(attrs){
  const FOR=ensureNum(attrs?.FOR), VIG=ensureNum(attrs?.VIG);
  return (FOR + VIG) * 4; // kg
}

export function classifyWeight(totalKg, limitKg){
  const t=ensureNum(totalKg), l=Math.max(0.0001, ensureNum(limitKg));
  const ratio = t / l;
  if (ratio <= 0.5) return "Leve";
  if (ratio <= 1.0) return "Médio";
  return "Pesado";
}

export function overweightTestNeeded(totalKg, limitKg){
  return ensureNum(totalKg) > ensureNum(limitKg);
}
