import { el, prettyKg } from "../../utils/helpers.js";
import { computeDerived } from "./sheetLogic.js";

export function renderSheetPreview(char){
  const d = computeDerived(char);
  const dt = d.dt;
  return el("div",{class:"sheet-preview"},[
    el("div",{class:"row space-between align-center"},[
      el("div",{class:"h2"},[char.name||"Personagem"]),
      el("div",{class:"muted"},[`NC ${char.nc||1} • Mental ${char.mental||0}`])
    ]),
    el("div",{class:"grid-2 gap-8"},[
      el("div",{class:"card mini"},[
        el("div",{class:"h3"},["Atributos"]),
        el("div",{class:"kv"},[`FOR: ${char.attrs.FOR} • DEX: ${char.attrs.DEX} • VIG: ${char.attrs.VIG} • QI: ${char.attrs.QI}`]),
        el("div",{class:"kv"},[`Intenções: ${d.intentions} • Mov: ${d.move} • Esquiva: ${d.esquiva}`])
      ]),
      el("div",{class:"card mini"},[
        el("div",{class:"h3"},["DT/HP"]),
        el("div",{class:"kv"},[`Cabeça: ${dt.head} • Torso: ${dt.torso}`]),
        el("div",{class:"kv"},[`Braço: ${dt.arm} • Perna: ${dt.leg}`]),
        el("div",{class:"kv"},[`HP: ${dt.hp}`])
      ]),
      el("div",{class:"card mini"},[
        el("div",{class:"h3"},["Inventário"]),
        el("div",{class:"kv"},[`Total: ${prettyKg(d.totalKg)} / Limite: ${prettyKg(d.invLimit)}`]),
        el("div",{class:"kv"},[`Classe: ${d.weightClass}${d.overweight ? " • TESTE ao exceder!" : ""}`])
      ]),
      el("div",{class:"card mini"},[
        el("div",{class:"h3"},["Mental (pós-combate)"]),
        el("div",{class:"kv"},[`ΔDT global: ${d.mental.dtGlobalDelta}`]),
        el("div",{class:"kv"},[`Penalidade dados: ${d.mental.dicePenalty}`]),
        el("div",{class:"kv"},[`Sem vantagens: ${d.mental.noAdvantages ? "sim":"não"}`]),
        el("div",{class:"kv"},[`Dano físico por intenção: ${d.mental.physPerIntention}`])
      ])
    ])
  ]);
}
