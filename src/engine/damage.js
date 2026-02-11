import { ensureNum } from "./validation.js";

export function calcDT(attrs){
  const FOR=ensureNum(attrs?.FOR), DEX=ensureNum(attrs?.DEX), VIG=ensureNum(attrs?.VIG), QI=ensureNum(attrs?.QI);
  const head = (VIG + 3) * 4;
  const torso = (VIG + FOR + 3) * 4;
  const arm = (VIG + 3) * 3;
  const leg = (VIG + 3) * 3;
  const hp = (head+torso+arm+arm+leg+leg) * 4;
  return { head, torso, arm, leg, hp };
}

export function resolveST({ st, dt }){
  // ST <= DT → dano normal
  // ST > DT → dano dobrado + Muito Danificado
  // ST >= 3×DT → Inutilizado
  const ST=ensureNum(st), DT=ensureNum(dt);
  if (DT<=0) return { outcome:"inutilizado", multiplier:3, flags:["INUTILIZADO"] };
  if (ST >= 3*DT) return { outcome:"inutilizado", multiplier:3, flags:["INUTILIZADO"] };
  if (ST > DT) return { outcome:"muito_danificado", multiplier:2, flags:["MUITO_DANIFICADO"] };
  return { outcome:"normal", multiplier:1, flags:[] };
}

export function applyCritical({ st, natural }){
  // crítico natural 12 → +50%
  if (Number(natural)===12) return Math.floor(st * 1.5);
  return st;
}
