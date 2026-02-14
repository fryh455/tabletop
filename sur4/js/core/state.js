// State minimal (boot-safe): armazena sessão local e evita null crash
import { sanitizeText } from "./validate.js";

const KEY = Object.freeze({
  displayName: "sur4.displayName",
  roomId: "sur4.roomId",
  role: "sur4.role", // "master"|"player"
});

export const State = {
  displayName: null,
  roomId: null,
  role: null,
};

export function loadSession() {
  try {
    State.displayName = sanitizeText(sessionStorage.getItem(KEY.displayName), 24) || null;
    State.roomId = sanitizeText(sessionStorage.getItem(KEY.roomId), 32) || null;
    State.role = sanitizeText(sessionStorage.getItem(KEY.role), 16) || null;
  } catch (_) {}
  return State;
}

export function saveSession(patch) {
  if (patch && typeof patch === "object") {
    if ("displayName" in patch) State.displayName = patch.displayName ?? null;
    if ("roomId" in patch) State.roomId = patch.roomId ?? null;
    if ("role" in patch) State.role = patch.role ?? null;
  }
  try {
    if (State.displayName) sessionStorage.setItem(KEY.displayName, State.displayName);
    else sessionStorage.removeItem(KEY.displayName);

    if (State.roomId) sessionStorage.setItem(KEY.roomId, State.roomId);
    else sessionStorage.removeItem(KEY.roomId);

    if (State.role) sessionStorage.setItem(KEY.role, State.role);
    else sessionStorage.removeItem(KEY.role);
  } catch (_) {}
  return State;
}

export function clearSession() {
  State.displayName = null;
  State.roomId = null;
  State.role = null;
  try {
    sessionStorage.removeItem(KEY.displayName);
    sessionStorage.removeItem(KEY.roomId);
    sessionStorage.removeItem(KEY.role);
  } catch (_) {}
}
