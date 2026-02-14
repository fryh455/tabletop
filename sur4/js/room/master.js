// Master tools: create tokens, create sheets, assign sheet<->token, assign sheet owner to player uid
import { dbRef, dbUpdate } from "../core/db.js";
import { isMaster } from "../core/permissions.js";
import { pToken, pSheet } from "../core/paths.js";
import { createToken } from "./tokens.js";
import { createSheet, updateSheet } from "./sheets.js";

let _ctx = { roomId: null, role: "player" };

export function setMasterContext(ctx) { _ctx = { ..._ctx, ...(ctx||{}) }; }
function assertMaster() {
  if (!_ctx.roomId) throw new Error("no_room");
  if (!isMaster(_ctx.role)) throw new Error("not_master");
}

export async function masterCreateTokenQuick() {
  assertMaster();
  const name = prompt("Nome do token?") || "token";
  const ownerUid = prompt("OwnerUid (auth.uid do player) (vazio = NPC)") || "";
  const size = prompt("Size (ex: 1) (opcional)") || "1";
  const x = prompt("X (opcional)") || "0";
  const y = prompt("Y (opcional)") || "0";

  return createToken({
    name,
    ownerUid: ownerUid.trim() ? ownerUid.trim() : null,
    size: Number(size)||1,
    x: Number(x)||0,
    y: Number(y)||0,
  });
}

export async function masterCreateSheetQuick() {
  assertMaster();
  const name = prompt("Nome da ficha?") || "Personagem";
  const ownerUid = prompt("OwnerUid (auth.uid do player) (vazio = NPC)") || "";
  return createSheet({
    name,
    ownerUid: ownerUid.trim() ? ownerUid.trim() : null,
  });
}

export async function linkTokenToSheet(tokenId, sheetId) {
  assertMaster();
  await dbUpdate(dbRef(pToken(_ctx.roomId, tokenId)), { sheetId });
}

export async function setSheetOwner(sheetId, ownerUid) {
  assertMaster();
  await updateSheet(sheetId, { ownerUid: ownerUid || null });
}

export async function setTokenOwner(tokenId, ownerUid) {
  assertMaster();
  await dbUpdate(dbRef(pToken(_ctx.roomId, tokenId)), { ownerUid: ownerUid || null });
}

export async function assignTokenAndSheet(tokenId, sheetId, ownerUid) {
  assertMaster();
  await Promise.all([
    dbUpdate(dbRef(pToken(_ctx.roomId, tokenId)), { sheetId, ownerUid: ownerUid || null }),
    updateSheet(sheetId, { ownerUid: ownerUid || null }),
  ]);
}

// --- Exports (module contract)
export { setMasterContext, masterCreateTokenQuick, masterCreateSheetQuick, assignTokenAndSheet };
