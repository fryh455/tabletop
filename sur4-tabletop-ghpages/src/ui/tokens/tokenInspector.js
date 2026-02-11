import { el } from "../../utils/helpers.js";
import { spriteUploader } from "./spriteUploader.js";
import { updateToken } from "../../db/tokens.js";
import { state } from "../../core/state.js";

export function renderTokenInspector(token){
  const wrap=el("div",{class:"card mini stack gap-8"},[
    el("div",{class:"h3"},[`Inspector: ${token?.name||token?.id||""}`]),
  ]);
  if (!token) return wrap;

  const name=el("input",{class:"input", value: token.name||""});
  const x=el("input",{class:"input", type:"number", value: token.x||0});
  const y=el("input",{class:"input", type:"number", value: token.y||0});
  const r=el("input",{class:"input", type:"number", value: token.r||24});

  const charId=el("select",{class:"input"},[
    el("option",{value:""},["(sem ficha)"]),
    ...state.characters.map(c=>el("option",{value:c.id, selected: c.id===token.charId},[c.name||c.id]))
  ]);

  const btn=el("button",{class:"btn small", onclick: async ()=>{
    await updateToken(state.roomId, token.id, {
      name: name.value.trim()||"token",
      x: Number(x.value||0),
      y: Number(y.value||0),
      r: Number(r.value||24),
      charId: charId.value||null
    });
  }},["Salvar"]);

  const up = spriteUploader({ onUrl: async (u)=> {
    await updateToken(state.roomId, token.id, { spriteUrl: u });
  }});

  wrap.appendChild(el("div",{class:"grid-2 gap-8"},[
    el("div",{class:"stack gap-6"},[
      el("label",{class:"label"},["Nome"]), name,
      el("div",{class:"grid-3 gap-6"},[
        el("div",{},[el("label",{class:"label"},["x"]), x]),
        el("div",{},[el("label",{class:"label"},["y"]), y]),
        el("div",{},[el("label",{class:"label"},["r"]), r]),
      ]),
      el("label",{class:"label"},["Vincular ficha"]), charId,
      btn
    ]),
    up
  ]));

  return wrap;
}
