import { el } from "../../utils/helpers.js";
import { effectDamage } from "../../engine/combat.js";

export function effectsPicker({ onPick }){
  const sel=el("select",{class:"input"},[
    el("option",{value:"leve"},["leve (1d4)"]),
    el("option",{value:"médio"},["médio (1d6)"]),
    el("option",{value:"pesado"},["pesado (1d8)"]),
    el("option",{value:"perfeito"},["perfeito (12)"])
  ]);
  const btn=el("button",{class:"btn secondary small", onclick: ()=> onPick?.(effectDamage(sel.value))},["Aplicar"]);
  return el("div",{class:"row gap-8 align-center"},[sel, btn]);
}
