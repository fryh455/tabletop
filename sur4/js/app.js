// App bootstrap (page router)
import { mountToastRoot, toast } from "./ui/toast.js";
import { mountModal, openModal } from "./ui/modal.js";
import { initLobby } from "./ui/lobby.js";
import { initRoomShell } from "./ui/room_shell.js";
import { initPanelsScaffold } from "./ui/panels/init_panels.js";
import { loadSession } from "./core/state.js";
import { joinRoom } from "./room/sync.js";
import { mountMapCanvas } from "./ui/canvas/map_canvas.js";
import { on } from "./core/events.js";
import { setRoomContext } from "./room/tokens.js";
import { setSheetsContext, watchSheets } from "./room/sheets.js";
import { watchTokens } from "./room/tokens.js";
import { setMapContext } from "./room/map.js";
import { setFogContext, watchFog } from "./room/fog.js";
import { setMarksContext, watchMarks } from "./room/marks.js";
import { setGroupsContext, watchTokenGroups } from "./room/token_groups.js";
import { setCameraContext, watchRoomCamera } from "./room/camera_follow.js";

function page() {
  const p = (location.pathname || "").toLowerCase();
  if (p.endsWith("room.html")) return "room";
  return "lobby";
}

async function initRoom() {
  initRoomShell();
  initPanelsScaffold();

  const params = new URLSearchParams(location.search);
  const roomId = params.get("room") || "";
  const s = loadSession();

  if (!roomId || !s.displayName) {
    openModal("Erro", "<p>Faltou roomId ou nome. Volte e entre novamente.</p>");
    return;
  }

  let ctx = null;
  let latestSettings = null;

  on("room:settings", (st) => {
    latestSettings = st;
    if (ctx) setRoomContext({ roomId, role: ctx.role, settings: latestSettings });
  });

  try {
    toast("info", "Conectando…", 1200);
    ctx = await joinRoom(roomId);
    toast("ok", "Conectado.", 1200);

    window.__SUR4_AUTH_UID = s.uid;

    setRoomContext({ roomId, role: ctx.role, settings: latestSettings });
    setSheetsContext({ roomId, role: ctx.role });
    setMapContext({ roomId, role: ctx.role });
    setFogContext({ roomId, role: ctx.role, uid: s.uid });
    setMarksContext({ roomId, role: ctx.role });
    setGroupsContext({ roomId, role: ctx.role });
    setCameraContext({ roomId, role: ctx.role, uid: s.uid });

    watchTokens(roomId);
    watchSheets(roomId);
    watchFog(roomId);
    watchTokenGroups(roomId);
    watchRoomCamera(roomId);
    if (ctx.role === "master") watchMarks(roomId);

    mountMapCanvas(roomId, ctx.role, latestSettings);

  } catch (e) {
    console.error(e);
    openModal("Falha ao conectar", `<pre style="white-space:pre-wrap">${String(e?.message || e)}</pre>`);
  }
}

function init() {
  mountToastRoot();
  mountModal();

  const p = page();
  if (p === "lobby") {
    initLobby();
    return;
  }

  initRoom();
}

init();
