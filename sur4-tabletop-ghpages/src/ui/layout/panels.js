import { el, toast } from "../../utils/helpers.js";
import { createRoom, joinRoom } from "../../db/rooms.js";
import { auth } from "../../db/firebase.js";
import { goToRoom } from "../../core/router.js";
import { state } from "../../core/state.js";

import { renderMapPanel } from "../map/canvas.js";
import { renderSheetsPanel } from "../sheets/characterSheet.js";
import { renderTokensPanel } from "../tokens/tokenManager.js";
import { renderIntentionsPanel } from "../intentions/intentionsBoard.js";
import { renderRollsPanel } from "../rolls/rollHistory.js";
import { renderCombatPanel } from "../combat/combatUI.js";
import { renderLogsPanel } from "../logs/logsPanel.js";

export function renderRoomsCard(root){
  root.innerHTML="";
  const user=auth.currentUser;
  root.appendChild(el("h2",{class:"h2"},["Salas"]));

  const name=el("input",{class:"input", placeholder:"Nome da sala (criar)"});
  const btnCreate=el("button",{class:"btn", onclick: async ()=>{
    try{
      const roomId = await createRoom({ name: name.value.trim() || "Sala SUR4", uid: user.uid });
      toast("Sala criada.");
      goToRoom(roomId);
    }catch(e){ toast(e.message,"error"); }
  }},["Criar sala (master)"]);

  const roomId=el("input",{class:"input", placeholder:"roomId (entrar)"});
  const role=el("select",{class:"input"},[
    el("option",{value:"player"},["player"]),
    el("option",{value:"master"},["master"])
  ]);
  const btnJoin=el("button",{class:"btn secondary", onclick: async ()=>{
    try{
      const rid=roomId.value.trim();
      if (!rid) return toast("Informe roomId.","warn");
      await joinRoom({ roomId: rid, uid: user.uid, role: role.value });
      toast("Entrou na sala.");
      goToRoom(rid);
    }catch(e){ toast(e.message,"error"); }
  }},["Entrar"]);

  root.appendChild(el("div",{class:"stack gap-8"},[
    el("div",{class:"row gap-8"},[name, btnCreate]),
    el("div",{class:"row gap-8"},[roomId, role, btnJoin]),
    el("p",{class:"muted"},["Dica: copie o roomId da URL para convidar players."])
  ]));
}

export function renderPanels(activeTab){
  const root=document.getElementById("content");
  root.innerHTML="";
  switch(activeTab){
    case "Mapa": return renderMapPanel(root);
    case "Fichas": return renderSheetsPanel(root);
    case "Tokens": return renderTokensPanel(root);
    case "Intenções": return renderIntentionsPanel(root);
    case "Rolagens": return renderRollsPanel(root);
    case "Combate": return renderCombatPanel(root);
    case "Logs": return renderLogsPanel(root);
    default: root.textContent="Em construção.";
  }
}
