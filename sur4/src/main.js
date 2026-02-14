import { initRouter } from "./router.js";
import { state, resetStateForRoom } from "./state.js";
import { wireTopbar, wireTabs } from "./ui/layout.js";
import { mountAuthModal, openAuthModal } from "./ui/modalAuth.js";
import { mountTabletop } from "./tabletop/canvas.js";
import { mountSheetsUI } from "./sheets/sheets.js";
import { mountInspector } from "./tabletop/tokens.js";
import { wireExportImport } from "./utils/fileio.js";

function ensureRoomIdFromHash() {
  const hash = location.hash || "";
  const m = hash.match(/^#\/room\/([a-zA-Z0-9_-]{3,64})/);
  if (m) return m[1];

  // If no room, generate and route
  const rid = `room_${Math.random().toString(36).slice(2, 10)}`;
  location.hash = `#/room/${rid}`;
  return rid;
}

function guardSession(roomId) {
  state.roomId = roomId;

  // Room state is per roomId, volatile; reset on navigation to room
  resetStateForRoom(roomId);

  // Auth modal is mandatory; session is volatile (no storage).
  if (!state.session) openAuthModal(roomId);
}

function main() {
  const roomId = ensureRoomIdFromHash();

  mountAuthModal({
    onSessionReady: (session) => {
      state.session = session;
      window.dispatchEvent(new CustomEvent("app:session:ready", { detail: session }));
    }
  });

  wireTopbar();
  wireTabs();
  wireExportImport();

  mountTabletop();
  mountSheetsUI();
  mountInspector();

  initRouter({
    onRoute: (route) => {
      if (route.name === "room") {
        guardSession(route.params.roomId);
      } else {
        // Default to room
        location.hash = `#/room/${roomId}`;
      }
    }
  });

  // First run
  guardSession(roomId);
}

main();
