import { el, toast } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { rollAttackIntention, choreography, effectDamage } from "../../engine/combat.js";
import { memberDTFromChar, damageOutcome } from "./combatResolver.js";
import { addLog, LogType } from "../../db/logs.js";

export function renderCombatPanel(root){
  const card=el("div",{class:"card stack gap-12"},[
    el("div",{class:"row space-between align-center"},[
      el("h2",{class:"h2"},["Combate"]),
      el("div",{class:"muted"},["Simultâneo • Coreografia • Efeitos"])
    ]),
    el("p",{class:"muted"},["Fluxo: Distribuir intenções → rolar ataques (2d12) → resolver simultâneo → aplicar dano por membro."])
  ]);

  const aTok=tokenSelect("A (atacante/ator)");
  const bTok=tokenSelect("B (alvo/oponente)");
  const member=el("select",{class:"input"},[
    el("option",{value:"torso"},["torso"]),
    el("option",{value:"cabeça"},["cabeça"]),
    el("option",{value:"braço"},["braço"]),
    el("option",{value:"perna"},["perna"])
  ]);
  const mod=el("input",{class:"input", type:"number", value:"0"});
  const kind=el("select",{class:"input"},[
    el("option",{value:"leve"},["leve"]),
    el("option",{value:"médio"},["médio"]),
    el("option",{value:"pesado"},["pesado"]),
    el("option",{value:"perfeito"},["perfeito"])
  ]);

  const out=el("div",{class:"card mini stack gap-6"},[el("div",{class:"muted"},["Resultado aparecerá aqui."])]);

  const btn=el("button",{class:"btn", onclick: async ()=>{
    if (state.player?.role !== "master") return toast("Resolução de combate é do master.", "warn");
    const A = state.tokens.find(t=>t.id===aTok.value);
    const B = state.tokens.find(t=>t.id===bTok.value);
    if (!A || !B) return toast("Selecione tokens A e B.", "warn");

    const charA = state.characters.find(c=>c.id===A.charId) || null;
    const charB = state.characters.find(c=>c.id===B.charId) || null;

    const dexA = Number(charA?.attrs?.DEX||0);
    const dexB = Number(charB?.attrs?.DEX||0);

    const atkA = rollAttackIntention(Number(mod.value||0));
    const atkB = rollAttackIntention(0);

    // simultâneo: compara total (hit) e dex
    const hitA = atkA.total;
    const hitB = atkB.total;

    let winner="tie";
    if (hitA>hitB) winner="A";
    else if (hitB>hitA) winner="B";
    else if (dexA>dexB) winner="A";
    else if (dexB>dexA) winner="B";

    // coreografia: usa o melhor dado do atacante vencedor (interpretação)
    const bestA = Math.max(...atkA.dice);
    const bestB = Math.max(...atkB.dice);
    const hits = winner==="A" ? choreography(bestA) : (winner==="B" ? choreography(bestB) : 0);

    const dt = memberDTFromChar(charB, member.value);
    const st = atkA.total; // ST = d12 + mods (aqui total 2d12+mod; você pode ajustar)
    const eff = effectDamage(kind.value);
    const dmg = damageOutcome({ st: st + eff.value, dt, natural: Math.max(...atkA.dice) });

    const payload = {
      a:{ tokenId:A.id, name:A.name, hit:hitA, dice:atkA.dice, mod:atkA.mod, dex:dexA },
      b:{ tokenId:B.id, name:B.name, hit:hitB, dice:atkB.dice, mod:atkB.mod, dex:dexB },
      winner, hits,
      member: member.value,
      effect: eff,
      damage: dmg
    };

    out.innerHTML="";
    out.appendChild(el("div",{class:"h3"},[`Vencedor: ${winner}`]));
    out.appendChild(el("div",{class:"muted"},[`A: [${atkA.dice.join(", ")}] +${atkA.mod} = ${hitA} • DEX ${dexA}`]));
    out.appendChild(el("div",{class:"muted"},[`B: [${atkB.dice.join(", ")}] +0 = ${hitB} • DEX ${dexB}`]));
    out.appendChild(el("div",{class:"muted"},[`Coreografia (hits): ${hits}`]));
    out.appendChild(el("div",{class:"muted"},[`Efeito: ${eff.kind} (${eff.die||eff.value})`]));
    out.appendChild(el("div",{class:"muted"},[`ST: ${dmg.st} vs DT(${member.value}): ${dmg.dt} → ${dmg.outcome} x${dmg.multiplier} ${dmg.flags.join(" ")}`]));

    await addLog(state.roomId, LogType.COMBAT, payload);
    toast("Combate registrado em logs.");
  }},["Resolver Turno (master)"]);

  card.appendChild(el("div",{class:"grid-2 gap-12"},[
    el("div",{class:"stack gap-8"},[
      el("label",{class:"label"},["Token A"]), aTok,
      el("label",{class:"label"},["Token B"]), bTok,
      el("label",{class:"label"},["Membro atingido"]), member,
      el("label",{class:"label"},["Modificador A"]), mod,
      el("label",{class:"label"},["Efeito"]), kind,
      btn
    ]),
    out
  ]));

  root.appendChild(card);

  function tokenSelect(label){
    const sel=el("select",{class:"input"},[
      el("option",{value:""},["(selecione)"]),
      ...state.tokens.map(t=>el("option",{value:t.id},[t.name||t.id]))
    ]);
    const rerender=()=>{
      const cur=sel.value;
      sel.innerHTML="";
      sel.appendChild(el("option",{value:""},["(selecione)"]));
      for (const t of state.tokens){
        const opt=el("option",{value:t.id},[t.name||t.id]);
        if (t.id===cur) opt.selected=true;
        sel.appendChild(opt);
      }
    };
    window.addEventListener("sur4:tokens", rerender);
    return sel;
  }
}
