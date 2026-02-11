import { roll as rollDie, sum } from "./dice.js";
import { ensureNum } from "./validation.js";

export function rollAttackIntention(mod=0){
  // 2d12 por intenção de ataque
  const dice = rollDie(2,12);
  const total = sum(dice) + ensureNum(mod,0);
  return { dice, total, mod };
}

export function resolveSimultaneous(a, b){
  // maior acerto vence; empate -> maior DEX; persistindo -> reroll (aqui retorna tie=true)
  if (a.hit > b.hit) return { winner:"A" };
  if (b.hit > a.hit) return { winner:"B" };
  if (a.dex > b.dex) return { winner:"A" };
  if (b.dex > a.dex) return { winner:"B" };
  return { tie:true };
}

export function choreography(roll){
  // <7 → 2 acertos; <10 → 3; 12 → 5 (interpretação: no d12)
  const r = ensureNum(roll,0);
  if (r === 12) return 5;
  if (r < 7) return 2;
  if (r < 10) return 3;
  return 1;
}

export function effectDamage(kind){
  // leve 1d4, médio 1d6, pesado 1d8, perfeito 12 fixo
  const k = String(kind||"leve").toLowerCase();
  if (k==="perfeito") return { kind:k, value:12, die:null };
  if (k==="medio"||k==="médio") return { kind:k, value: sum(rollDie(1,6)), die:"1d6" };
  if (k==="pesado") return { kind:k, value: sum(rollDie(1,8)), die:"1d8" };
  return { kind:k, value: sum(rollDie(1,4)), die:"1d4" };
}
