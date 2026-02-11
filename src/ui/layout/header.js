import { el } from "../../utils/helpers.js";
import { state } from "../../core/state.js";
import { getRoomIdFromURL } from "../../core/router.js";
import { badge } from "../../utils/helpers.js";

export function renderHeader({ mode="home", user=null, onLogout=null, onHome=null }={}){
  const root=document.getElementById("header");
  if (!root) return;
  const roomId = mode==="room" ? getRoomIdFromURL() : null;
  root.innerHTML="";
  const left=el("div",{class:"row gap-8 align-center"},[
    el("div",{class:"logo"},["SUR4"]),
    el("div",{class:"muted"},[mode==="room" ? `Sala: ${roomId}` : "Tabletop"])
  ]);

  const right=el("div",{class:"row gap-8 align-center"},[]);
  if (user){
    right.appendChild(el("div",{class:"muted"},[`UID: ${user.uid.slice(0,6)}…`]));
    if (mode==="room" && state.player?.role){
      right.appendChild(el("div",{class:"muted", html: badge(state.player.role)}));
    }
    if (onHome){
      right.appendChild(el("button",{class:"btn secondary small", onclick:onHome},["Home"]));
    }
    if (onLogout){
      right.appendChild(el("button",{class:"btn danger small", onclick:onLogout},["Logout"]));
    }
  }

  root.appendChild(el("div",{class:"header-inner"},[left, right]));
}
