import { el, toast } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { assignIntention } from "./distributor.js";
import { deleteIntention } from "../../db/intentions.js";
import { resolveIntentionCard } from "./resolutionUI.js";
import { computeDerived } from "../sheets/sheetLogic.js";

export function renderIntentionsPanel(root){
  const card=el("div",{class:"card stack gap-12"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Intenções"]),
      el("div",{class:"row gap-8"},[
        el("button",{class:"btn small", onclick: async ()=>{
          try{
            await assignIntention({ type:"attack", note:"Ataque", round: getRound() });
            toast("Intenção adicionada.");
          }catch(e){ toast(e.message,"error"); }
        }},["+ Ataque"]),
        el("button",{class:"btn secondary small", onclick: async ()=>{
          try{
            await assignIntention({ type:"move", note:"Movimento", round: getRound() });
            toast("Intenção adicionada.");
          }catch(e){ toast(e.message,"error"); }
        }},["+ Movimento"]),
        el("button",{class:"btn secondary small", onclick: async ()=>{
          try{
            await assignIntention({ type:"defense", note:"Defesa", round: getRound() });
            toast("Intenção adicionada.");
          }catch(e){ toast(e.message,"error"); }
        }},["+ Defesa"]),
      ])
    ]),
    el("p",{class:"muted"},["Distribuição de intenções. O total recomendado do jogador é floor((VIG+DEX+1)/2) da ficha."])
  ]);

  const round=el("input",{class:"input", type:"number", value:"1", min:"1"});
  card.appendChild(el("div",{class:"row gap-8 align-center"},[
    el("div",{class:"muted"},["Round:"]), round
  ]));

  const list=el("div",{class:"stack gap-8"},[]);
  card.appendChild(list);
  root.appendChild(card);

  function getRound(){ return Number(round.value||1); }

  function render(){
    list.innerHTML="";
    const myChars = state.characters.filter(c=>c.ownerUid===state.user.uid);
    const rec = myChars[0] ? computeDerived(myChars[0]).intentions : null;

    const mine = state.intentions
      .filter(i => Number(i.round||1)===getRound())
      .sort((a,b)=> (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));

    if (rec!=null){
      const countMine = mine.filter(i=>i.uid===state.user.uid).length;
      list.appendChild(el("div",{class:"card mini"},[
        el("div",{class:"h3"},["Recomendação"]),
        el("div",{class:"muted"},[`Sua ficha sugere ${rec} intenções. Você alocou ${countMine}.`])
      ]));
    }

    if (!mine.length){
      list.appendChild(el("div",{class:"muted"},["Nenhuma intenção neste round."]));
      return;
    }

    for (const i of mine){
      const row=el("div",{class:"row gap-8 align-start"},[
        resolveIntentionCard(i)
      ]);

      // delete own intentions or master
      const canDel = (i.uid===state.user.uid) || state.player?.role==="master";
      if (canDel){
        row.appendChild(el("button",{class:"btn danger small", onclick: async ()=>{
          await deleteIntention(state.roomId, i.id);
          toast("Intenção removida.");
        }},["Remover"]));
      }
      list.appendChild(row);
    }
  }

  render();
  round.addEventListener("change", render);
  window.addEventListener("sur4:intentions", render);
  window.addEventListener("sur4:characters", render);
}
