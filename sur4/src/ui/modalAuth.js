import { $, setHidden, safeText } from "../utils/dom.js";
import { state } from "../state.js";

let mounted = false;
let onSessionReadyCb = null;

export function mountAuthModal({ onSessionReady }) {
  if (mounted) return;
  mounted = true;
  onSessionReadyCb = onSessionReady;

  const overlay = $("#modal-auth");
  const roomSpan = $("#auth-room-id");
  const inputName = $("#auth-name");
  const selectRole = $("#auth-role");
  const btn = $("#auth-submit");

  function close() {
    setHidden(overlay, true);
  }

  function open(roomId) {
    roomSpan.textContent = roomId;
    setHidden(overlay, false);
    inputName.value = "";
    inputName.focus();
  }

  function submit() {
    const displayName = safeText(inputName.value, 24);
    const role = selectRole.value === "master" ? "master" : "player";
    if (!displayName) {
      alert("Digite um nome.");
      inputName.focus();
      return;
    }

    const session = { displayName, role, roomId: state.roomId };
    // local players list (no sync)
    const exists = state.room.players.some((p) => p.displayName === displayName);
    if (!exists) state.room.players.push({ displayName, role });

    onSessionReadyCb?.(session);
    close();
    window.dispatchEvent(new CustomEvent("app:ui:toast", { detail: `Entrou como ${displayName} (${role})` }));
  }

  btn.addEventListener("click", submit);
  inputName.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  selectRole.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  window.addEventListener("app:session:cleared", () => open(state.roomId));

  // expose open function internally
  window.__authModalOpen = open;
}

export function openAuthModal(roomId) {
  if (!mounted) throw new Error("Auth modal not mounted.");
  window.__authModalOpen?.(roomId);
}
