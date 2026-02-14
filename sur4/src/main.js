import { initRouter } from "./router.js";
import { state, resetStateForRoom } from "./state.js";
import { wireTopbar, wireTabs } from "./ui/layout.js";
import { mountAuthModal, openAuthModal } from "./ui/modalAuth.js";
import { mountTabletop } from "./tabletop/canvas.js";
import { mountSheetsUI } from "./sheets/sheets.js";
import { mountInspector } from "./tabletop/tokens.js";
import { wireExportImport } from "./utils/fileio.js";

function ensureRoomIdFromHash(){
  const m=(location.hash||"").match(/^#\/room\/([a-zA-Z0-9_-]{3,64})/);
  if(m) return m[1];
  const rid=`room_${Math.random().toString(36).slice(2,10)}`;
  location.hash=`#/room/${rid}`;
  return rid;
}

function bootRoom(roomId){
  state.roomId=roomId;
  resetStateForRoom(roomId);
  openAuthModal(roomId);
  window.dispatchEvent(new CustomEvent("app:session:cleared"));
}

function main(){
  const roomId=ensureRoomIdFromHash();

  mountAuthModal({
    onSessionReady:(session)=>{
      state.session=session;
      window.dispatchEvent(new CustomEvent("app:session:ready",{detail:session}));
    }
  });

  wireTopbar();
  wireTabs();
  wireExportImport();
  mountTabletop();
  mountSheetsUI();
  mountInspector();

  initRouter({
    onRoute:(route)=>{
      if(route.name==="room") bootRoom(route.params.roomId);
      else location.hash=`#/room/${roomId}`;
    }
  });

  bootRoom(roomId);
}

main();
