import { resolveSimultaneous, choreography } from "../../engine/combat.js";
import { resolveST, calcDT, applyCritical } from "../../engine/damage.js";
import { effectDamage } from "../../engine/combat.js";

export function resolveTurn({ a, b }){
  // a/b: {hit, dex, dtMember}
  const sim = resolveSimultaneous(a,b);
  return sim;
}

export function memberDTFromChar(char, member="torso"){
  const dt=calcDT(char?.attrs||{});
  if (member==="cabeça") return dt.head;
  if (member==="braço") return dt.arm;
  if (member==="perna") return dt.leg;
  return dt.torso;
}

export function damageOutcome({ st, dt, natural=0 }){
  const st2 = applyCritical({ st, natural });
  const res = resolveST({ st: st2, dt });
  return { ...res, st: st2, dt };
}
