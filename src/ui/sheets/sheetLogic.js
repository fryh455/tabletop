import { baseIntentions, movement, dodge } from "../../engine/intentions.js";
import { calcDT } from "../../engine/damage.js";
import { inventoryLimit, classifyWeight, overweightTestNeeded } from "../../engine/inventory.js";
import { mentalEffects } from "../../engine/mental.js";

export function computeDerived(char){
  const attrs = char?.attrs || {FOR:0,DEX:0,VIG:0,QI:0};
  const intentions = baseIntentions(attrs);
  const move = movement(attrs);
  const esquiva = dodge(attrs);
  const dt = calcDT(attrs);
  const invLimit = inventoryLimit(attrs);
  const totalKg = (char?.inventory||[]).reduce((a,it)=>a+(Number(it.kg)||0),0);
  const weightClass = classifyWeight(totalKg, invLimit);
  const overweight = overweightTestNeeded(totalKg, invLimit);
  const mental = mentalEffects(char?.mental||0);

  return { intentions, move, esquiva, dt, invLimit, totalKg, weightClass, overweight, mental };
}
