// Exports: obterPapelAtual, ehMestre
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

export function obterPapelAtual(mesaSnapshot) {
  const auth = getAuth();
  const usuarioId = auth.currentUser?.uid || null;
  if (!usuarioId || !mesaSnapshot) return "jogador";
  const mestreId = mesaSnapshot.mestre_id;
  return mestreId === usuarioId ? "mestre" : "jogador";
}

export function ehMestre(mesaSnapshot) {
  return obterPapelAtual(mesaSnapshot) === "mestre";
}