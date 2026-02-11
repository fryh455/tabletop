import { el, toast } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { createToken, deleteToken } from "../../db/tokens.js";
import { renderTokenInspector } from "./tokenInspector.js";

export function renderTokensPanel(root){
  const card=el("div",{class:"card stack gap-12"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Tokens"]),
      el("div",{class:"row gap-8"},[
        el("button",{class:"btn small", onclick: async ()=>{
          try{
            if (state.player?.role !== "master") return toast("Apenas master cria/deleta tokens.", "warn");
            await createToken(state.roomId, { name:"Token", x:120, y:120, r:24, spriteUrl:"", charId:null });
            toast("Token criado.");
          }catch(e){ toast(e.message,"error"); }
        }},["Criar token (master)"])
      ])
    ]),
    el("p",{class:"muted"},["Master cria/deleta. Todos podem arrastar (posição atualiza). Vincule ficha e troque sprite."])
  ]);

  const grid=el("div",{class:"grid-2 gap-12"},[]);
  const list=el("div",{class:"stack gap-8"},[]);
  const inspectorWrap=el("div",{class:"stack gap-8"},[]);
  grid.appendChild(list);
  grid.appendChild(inspectorWrap);
  card.appendChild(grid);
  root.appendChild(card);

  let selected=null;

  function render(){
    list.innerHTML="";
    inspectorWrap.innerHTML="";
    if (!state.tokens.length){
      list.appendChild(el("div",{class:"muted"},["Nenhum token."]));
    } else {
      for (const t of state.tokens){
        const row=el("div",{class:"row space-between align-center card mini"},[
          el("div",{class:"stack"},[
            el("div",{class:"h3"},[t.name||"token"]),
            el("div",{class:"muted"},[`(${Math.round(t.x||0)}, ${Math.round(t.y||0)}) • r ${t.r||24}`])
          ]),
          el("div",{class:"row gap-8"},[
            el("button",{class:"btn secondary small", onclick: ()=>{
              selected=t;
              render();
            }},["Inspecionar"]),
            el("button",{class:"btn danger small", onclick: async ()=>{
              if (state.player?.role !== "master") return toast("Apenas master deleta.", "warn");
              if (!confirm("Deletar token?")) return;
              await deleteToken(state.roomId, t.id);
              toast("Token deletado.");
            }},["Deletar"])
          ])
        ]);
        list.appendChild(row);
      }
    }
    inspectorWrap.appendChild(renderTokenInspector(selected));
  }

  render();
  window.addEventListener("sur4:tokens", render);
  window.addEventListener("sur4:characters", render);
}
