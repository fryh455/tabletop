import { el, toast } from "../../utils/helpers.js";
import { roll1d12, roll2d12 } from "./rollEngine.js";

export function openRollModal({ onClose }={}){
  const root=document.getElementById("modal-root");
  root.innerHTML="";
  const label=el("input",{class:"input", placeholder:"Label (ex.: Ataque, Esquiva...)"});
  const mod=el("input",{class:"input", type:"number", value:"0"});
  const btn1=el("button",{class:"btn", onclick: async ()=>{
    await roll1d12({ label: label.value, mod: mod.value });
    toast("Rolagem registrada.");
    close();
  }},["Rolar 1d12"]);
  const btn2=el("button",{class:"btn", onclick: async ()=>{
    await roll2d12({ label: label.value, mod: mod.value });
    toast("Rolagem registrada.");
    close();
  }},["Rolar 2d12"]);

  const modal=el("div",{class:"modal"},[
    el("div",{class:"modal-card stack gap-8"},[
      el("div",{class:"h2"},["Rolagem"]),
      el("label",{class:"label"},["Label"]), label,
      el("label",{class:"label"},["Modificador"]), mod,
      el("div",{class:"row gap-8"},[btn1, btn2, el("button",{class:"btn secondary", onclick:close},["Fechar"])])
    ])
  ]);
  root.appendChild(modal);

  function close(){
    root.innerHTML="";
    onClose?.();
  }
}
