// Lobby controller (index.html)
import { validateDisplayName, validateRoomCode } from "../core/validate.js";
import { loadSession, saveSession, clearSession } from "../core/state.js";
import { baseUrl } from "../core/env.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";

function el(id) { return document.getElementById(id); }

function setStatus(msg) {
  const s = el("status");
  if (s) s.textContent = msg || "";
}

function genRoomId() {
  // code-friendly roomId (não usa push key aqui)
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

function gotoRoom(roomId) {
  const url = baseUrl(`room.html?room=${encodeURIComponent(roomId)}`);
  window.location.href = url;
}

export function initLobby() {
  loadSession();

  const nameInp = el("name");
  const btnCreate = el("btnCreateRoom");
  const roomInp = el("roomCode");
  const btnJoin = el("btnJoinRoom");

  if (nameInp && !nameInp.value && typeof loadSession().displayName === "string") {
    nameInp.value = loadSession().displayName;
  }

  function requireName() {
    const v = validateDisplayName(nameInp ? nameInp.value : "");
    if (!v.ok) {
      toast("warn", "Nome inválido (1–24).");
      return null;
    }
    return v.value;
  }

  btnCreate?.addEventListener("click", () => {
    const displayName = requireName();
    if (!displayName) return;

    const roomId = genRoomId();
    saveSession({ displayName, roomId, role: "master" });
    setStatus(`Criando mesa: ${roomId}`);
    // OBS: criação real no DB virá no módulo firebase/db
    gotoRoom(roomId);
  });

  btnJoin?.addEventListener("click", () => {
    const displayName = requireName();
    if (!displayName) return;

    const rc = validateRoomCode(roomInp ? roomInp.value : "");
    if (!rc.ok) {
      toast("warn", "Código inválido (a-z 0-9 _ -).");
      return;
    }

    saveSession({ displayName, roomId: rc.value, role: "player" });
    setStatus(`Entrando na mesa: ${rc.value}`);
    gotoRoom(rc.value);
  });

  // UX: se tiver sessão, oferece reset
  const sess = loadSession();
  if (sess.displayName && sess.roomId) {
    openModal(
      "Sessão encontrada",
      `<p>Você tem uma sessão salva para <b>${sess.displayName}</b> / <b>${sess.roomId}</b>.</p>
       <div class="row">
         <button id="btnContinue" type="button">Continuar</button>
         <button id="btnReset" type="button">Resetar</button>
       </div>`
    );
    setTimeout(() => {
      document.getElementById("btnContinue")?.addEventListener("click", () => gotoRoom(sess.roomId));
      document.getElementById("btnReset")?.addEventListener("click", () => { clearSession(); window.location.reload(); });
    }, 0);
  }
}
