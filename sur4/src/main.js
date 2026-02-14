import { initRouter } from "./router.js";
import { state, resetRoomState, isMaster } from "./state.js";
import { ensureAnonAuth } from "./firebase/firebase.js";
import { mountRoomSync } from "./db/sync.js";
import { setv, upv } from "./db/api.js";
import { paths } from "./db/paths.js";
import { wireTabs, wireTopbar } from "./ui/layout.js";
import { mountLoginModal, openLoginModal } from "./ui/modalLogin.js";
import { mountTabletop } from "./tabletop/canvas.js";
import { mountInspector, mountTokenCreateModal } from "./tabletop/tokens.js";
import { mountSheetsUI } from "./sheets/sheets.js";
import { mountRollsUI } from "./rolls/rolls.js";
import { mountFogModal } from "./tabletop/fog.js";
import { $, setHidden, safeText } from "./utils/dom.js";

let unmountSync = null;

async function boot() {
  // auth
  const user = await ensureAnonAuth();
  state.me = { uid: user.uid, name: null };

  // UI mounts (static)
  wireTabs();
  wireTopbar();
  mountTabletop();
  mountInspector();
  mountTokenCreateModal();
  mountSheetsUI();
  mountRollsUI();
  mountFogModal();

  // login modal
  mountLoginModal({
    onCreate: (roomId) => enterRoom(roomId),
    onJoin: (roomId) => enterRoom(roomId)
  });

  initRouter({
    onRoom: (roomId) => {
      if (!roomId) {
        // no room in hash: show login
        openLoginModal();
        return;
      }
      // if already in this room, ignore
      if (state.roomId === roomId && unmountSync) return;
      // show login anyway; the modal will create/join and then call enterRoom
      resetRoomState(roomId);
      openLoginModal();
    }
  });
}

async function enterRoom(roomId) {
  // read name from login field
  const nameEl = document.querySelector("#login-name");
  const name = safeText(nameEl?.value, 24);
  state.me.name = name || "anon";

  // go to route
  location.hash = `#/room/${roomId}`;

  // sync
  if (unmountSync) unmountSync();
  unmountSync = mountRoomSync(roomId);

  // store "presence"
  await upv(paths.roomPlayer(roomId, state.me.uid), { name: state.me.name, lastSeenAt: Date.now() });

  // show some buttons depending on role after meta arrives
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("app:session:ready")), 0);

  // if master, show create buttons after meta; if player, keep hidden (handled in UI)
}

boot().catch((e) => {
  console.error(e);
  alert("Falha ao iniciar. Veja console.");
});
