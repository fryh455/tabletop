import { $, setHidden, safeText } from "../utils/dom.js";
import { state, resetRoomState } from "../state.js";
import { createRoomAtomic, roomExists, setv, upv } from "../db/api.js";
import { paths } from "../db/paths.js";

let mounted = false;

export function mountLoginModal({ onCreate, onJoin }) {
  if (mounted) return;
  mounted = true;

  const overlay = $("#modal-login");
  const nameEl = $("#login-name");

  const btnCreate = $("#btn-create-room");
  const btnJoin = $("#btn-join-room");

  const joinArea = $("#join-area");
  const joinCode = $("#join-code");
  const btnConfirmJoin = $("#btn-confirm-join");
  const btnCancelJoin = $("#btn-cancel-join");

  btnJoin.addEventListener("click", () => {
    setHidden(joinArea, false);
    joinCode.focus();
  });

  btnCancelJoin.addEventListener("click", () => {
    setHidden(joinArea, true);
    joinCode.value = "";
  });

  btnCreate.addEventListener("click", async () => {
    const name = safeText(nameEl.value, 24);
    if (!name) return alert("Digite seu nome.");
    const roomId = `room_${Math.random().toString(36).slice(2, 10)}`;

    resetRoomState(roomId);

    const meta = {
      masterUid: state.me.uid,
      masterName: name,
      createdAt: Date.now()
    };

    const ok = await createRoomAtomic(roomId, meta);
    if (!ok) return alert("Falha ao criar sala (colisão). Tente de novo.");

    // register player entry
    await setv(paths.roomPlayer(roomId, state.me.uid), { name, role: "master", joinedAt: Date.now() });

    close();
    onCreate?.(roomId);
  });

  btnConfirmJoin.addEventListener("click", async () => {
    const name = safeText(nameEl.value, 24);
    if (!name) return alert("Digite seu nome.");
    const roomId = safeText(joinCode.value, 64);
    if (!roomId) return alert("Digite o código.");

    const exists = await roomExists(roomId);
    if (!exists) return alert("Mesa não encontrada.");

    resetRoomState(roomId);

    // create/update player entry (role computed by meta later)
    await upv(paths.roomPlayer(roomId, state.me.uid), { name, role: "player", joinedAt: Date.now() });

    close();
    onJoin?.(roomId);
  });

  function close() { setHidden(overlay, true); }
  function open() { setHidden(overlay, false); nameEl.focus(); }

  window.__openLogin = open;
}

export function openLoginModal() {
  window.__openLogin?.();
}
