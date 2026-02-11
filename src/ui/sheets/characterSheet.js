import { el, toast, jsonDownload } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { createCharacter, updateCharacter, deleteCharacter } from "../../db/characters.js";
import { renderSheetPreview } from "./sheetRenderer.js";
import { importSheetFromJSON } from "./sheetImporter.js";
import { computeDerived } from "./sheetLogic.js";

function emptyChar(uid){
  return {
    name: "Novo Personagem",
    ownerUid: uid,
    attrs: { FOR: 1, DEX: 1, VIG: 1, QI: 1 },
    mental: 0,
    nc: 1,
    inventory: [],
    notes: ""
  };
}

export function renderSheetsPanel(root){
  const user=state.user;
  const card=el("div",{class:"card stack gap-12"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Fichas"]),
      el("div",{class:"row gap-8"},[
        el("button",{class:"btn small", onclick: async ()=>{
          try{
            const id = await createCharacter(state.roomId, emptyChar(user.uid));
            toast("Ficha criada.");
          }catch(e){ toast(e.message,"error"); }
        }},["Criar ficha"]),
      ])
    ]),
    el("p",{class:"muted"},["Crie/edite fichas. Import JSON e export disponíveis. Limite de inventário: (FOR+VIG)*4 kg."])
  ]);

  const list=el("div",{class:"stack gap-12"},[]);
  card.appendChild(list);
  root.appendChild(card);

  function render(){
    list.innerHTML="";
    const mine = state.characters.filter(c=>c.ownerUid===user.uid || state.player?.role==="master");
    if (!mine.length){
      list.appendChild(el("div",{class:"muted"},["Nenhuma ficha ainda."]));
      return;
    }
    for (const c of mine){
      const wrap=el("div",{class:"card mini stack gap-8"},[]);
      wrap.appendChild(renderSheetPreview(c));

      const name=el("input",{class:"input", value:c.name||""});
      const FOR=el("input",{class:"input", type:"number", value:c.attrs?.FOR ?? 0});
      const DEX=el("input",{class:"input", type:"number", value:c.attrs?.DEX ?? 0});
      const VIG=el("input",{class:"input", type:"number", value:c.attrs?.VIG ?? 0});
      const QI=el("input",{class:"input", type:"number", value:c.attrs?.QI ?? 0});
      const mental=el("input",{class:"input", type:"number", value:c.mental ?? 0});
      const nc=el("input",{class:"input", type:"number", value:c.nc ?? 1, min:"1", max:"7"});

      const invText=el("textarea",{class:"textarea", placeholder:"Inventário JSON (array de itens {name,kg})"},[
        JSON.stringify(c.inventory||[], null, 2)
      ]);

      const notes=el("textarea",{class:"textarea", placeholder:"Notas"},[c.notes||""]);

      const btnSave=el("button",{class:"btn small", onclick: async ()=>{
        try{
          const inv = JSON.parse(invText.value||"[]");
          await updateCharacter(state.roomId, c.id, {
            name: name.value.trim()||"Personagem",
            attrs: { FOR:Number(FOR.value), DEX:Number(DEX.value), VIG:Number(VIG.value), QI:Number(QI.value) },
            mental: Number(mental.value||0),
            nc: Math.max(1, Math.min(7, Number(nc.value||1))),
            inventory: Array.isArray(inv)? inv : [],
            notes: notes.value||""
          });
          toast("Ficha salva.");
        }catch(e){ toast("Erro ao salvar: "+e.message, "error"); }
      }},["Salvar"]);

      const btnExport=el("button",{class:"btn secondary small", onclick: ()=>{
        jsonDownload(`sheet_${c.name||c.id}.json`, c);
      }},["Export JSON"]);

      const imp=el("textarea",{class:"textarea", placeholder:"Cole aqui um JSON para importar/substituir esta ficha"},[]);
      const btnImport=el("button",{class:"btn secondary small", onclick: async ()=>{
        const obj = importSheetFromJSON(imp.value);
        if (!obj) return;
        try{
          await updateCharacter(state.roomId, c.id, obj);
          toast("Ficha importada.");
          imp.value="";
        }catch(e){ toast(e.message,"error"); }
      }},["Import JSON"]);

      const btnDel=el("button",{class:"btn danger small", onclick: async ()=>{
        if (!confirm("Deletar ficha?")) return;
        try{ await deleteCharacter(state.roomId, c.id); toast("Ficha deletada."); }catch(e){ toast(e.message,"error"); }
      }},["Deletar"]);

      wrap.appendChild(el("div",{class:"grid-2 gap-8"},[
        el("div",{class:"stack gap-6"},[
          el("label",{class:"label"},["Nome"]), name,
          el("div",{class:"grid-4 gap-6"},[
            el("div",{},[el("label",{class:"label"},["FOR"]), FOR]),
            el("div",{},[el("label",{class:"label"},["DEX"]), DEX]),
            el("div",{},[el("label",{class:"label"},["VIG"]), VIG]),
            el("div",{},[el("label",{class:"label"},["QI"]), QI]),
          ]),
          el("div",{class:"grid-2 gap-6"},[
            el("div",{},[el("label",{class:"label"},["Mental"]), mental]),
            el("div",{},[el("label",{class:"label"},["NC (1–7)"]), nc]),
          ]),
          el("div",{class:"row gap-8"},[btnSave, btnExport, btnDel])
        ]),
        el("div",{class:"stack gap-6"},[
          el("label",{class:"label"},["Inventário (JSON)"]), invText,
          el("label",{class:"label"},["Importar (JSON)"]), imp, btnImport,
          el("label",{class:"label"},["Notas"]), notes
        ])
      ]));

      list.appendChild(wrap);
    }
  }

  render();
  window.addEventListener("sur4:characters", render);
}
