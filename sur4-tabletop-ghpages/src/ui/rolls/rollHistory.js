import { el } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { openRollModal } from "./rollModal.js";

export function renderRollsPanel(root){
  const card=el("div",{class:"card stack gap-12"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Rolagens"]),
      el("button",{class:"btn small", onclick: ()=>openRollModal()},["Nova rolagem"])
    ]),
    el("p",{class:"muted"},["Histórico (audit trail)."])
  ]);
  const list=el("div",{class:"stack gap-6"},[]);
  card.appendChild(list);
  root.appendChild(card);

  function render(){
    list.innerHTML="";
    for (const r of state.rolls){
      list.appendChild(el("div",{class:"card mini row space-between align-center"},[
        el("div",{class:"stack"},[
          el("div",{class:"h3"},[r.label || "rolagem"]),
          el("div",{class:"muted"},[`dado: [${(r.dice||[]).join(", ")}] mod ${r.mod||0} → total ${r.total}`]),
          el("div",{class:"muted"},[`uid: ${(r.uid||"").slice(0,6)}…`]),
        ])
      ]));
    }
    if (!state.rolls.length) list.appendChild(el("div",{class:"muted"},["Sem rolagens ainda."]));
  }

  render();
  window.addEventListener("sur4:rolls", render);
}
