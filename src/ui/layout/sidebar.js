import { el } from "../../utils/helpers.js";
import { TABS } from "../../utils/constants.js";
import { state, setState } from "../../core/state.js";

export function renderSidebar({ onTab }){
  const root=document.getElementById("sidebar");
  root.innerHTML="";
  const title=el("div",{class:"sidebar-title"},["Painel"]);
  const list=el("div",{class:"sidebar-list"},[]);

  for (const t of TABS){
    const btn=el("button",{class:`sidebtn ${state.ui.activeTab===t?"active":""}`, onclick:()=>{
      setState({ ui:{...state.ui, activeTab:t} });
      onTab?.(t);
      renderSidebar({ onTab });
    }},[t]);
    list.appendChild(btn);
  }

  root.appendChild(title);
  root.appendChild(list);
}
