import { renderSidebar } from "./sidebar.js";
import { state } from "../../core/state.js";
import { renderPanels } from "./panels.js";

export function mountRoomUI(){
  renderSidebar({ onTab:(tab)=> renderPanels(tab) });
  renderPanels(state.ui.activeTab);

  // re-render header badge when player arrives
  window.addEventListener("sur4:players", ()=> {
    import("./header.js").then(m=>m.renderHeader({mode:"room", user: state.user, onHome: ()=>location.href="index.html"}));
  });
}
