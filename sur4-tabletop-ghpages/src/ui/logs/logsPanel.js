import { el, fmtTime } from "../../utils/helpers.js";
import { state } from "../../core/state.js";

export function renderLogsPanel(root){
  const card=el("div",{class:"card stack gap-12"},[
    el("h2",{class:"h2"},["Logs"]),
    el("p",{class:"muted"},["Audit trail: rolagens, combate, intenções, tokens, fichas."])
  ]);
  const list=el("div",{class:"stack gap-6"},[]);
  card.appendChild(list);
  root.appendChild(card);

  function render(){
    list.innerHTML="";
    for (const l of state.logs){
      const ts = l.createdAt?.seconds ? new Date(l.createdAt.seconds*1000) : null;
      list.appendChild(el("div",{class:"card mini stack gap-6"},[
        el("div",{class:"row space-between align-center"},[
          el("div",{class:"h3"},[l.type||"log"]),
          el("div",{class:"muted"},[ts?fmtTime(ts):""])
        ]),
        el("pre",{class:"pre"},[JSON.stringify(l.payload||{}, null, 2)])
      ]));
    }
    if (!state.logs.length) list.appendChild(el("div",{class:"muted"},["Sem logs ainda."]));
  }

  render();
  window.addEventListener("sur4:logs", render);
}
