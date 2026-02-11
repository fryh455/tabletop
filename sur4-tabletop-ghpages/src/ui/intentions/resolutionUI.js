import { el, toast } from "../../utils/helpers.js";
import { upsertIntention } from "../../db/intentions.js";
import { state } from "../../core/state.js";
import { rollAttackIntention } from "../../engine/combat.js";
import { applyCritical } from "../../engine/damage.js";

export function resolveIntentionCard(intention){
  const isMaster = state.player?.role==="master";
  const wrap=el("div",{class:"card mini stack gap-6"},[
    el("div",{class:"row space-between align-center"},[
      el("div",{class:"h3"},[`${intention.type} • ${intention.status||"planned"}`]),
      el("div",{class:"muted"},[`uid ${(intention.uid||"").slice(0,6)}…`]),
    ]),
    el("div",{class:"muted"},[intention.note||""]),
  ]);

  if (isMaster){
    const btn=el("button",{class:"btn small", onclick: async ()=>{
      // resolução simples: se attack, rola 2d12 e salva
      const res = intention.type==="attack" ? rollAttackIntention(0) : null;
      const payload = res ? { attack: res, total: applyCritical({ st: res.total, natural: Math.max(...res.dice) }) } : {};
      await upsertIntention(state.roomId, intention.id, { ...intention, status:"resolved", result: payload });
      toast("Intenção resolvida.");
    }},["Resolver (master)"]);
    wrap.appendChild(btn);
  }

  if (intention.result?.attack){
    wrap.appendChild(el("div",{class:"muted"},[
      `Ataque: [${intention.result.attack.dice.join(", ")}] mod ${intention.result.attack.mod} → ${intention.result.attack.total}`
    ]));
  }

  return wrap;
}
