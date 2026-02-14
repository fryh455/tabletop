// Sheets sync minimal: master can create/assign; player sees own sheet
import { dbRef, dbOnValue, dbUpdate, dbPush, dbSet, dbRemove, nowServer } from "../core/db.js";
import { currentUser } from "../core/auth.js";
import { pSheets, pSheet } from "../core/paths.js";
import { emit } from "../core/events.js";
import { isMaster } from "../core/permissions.js";

let _roomId = null;
let _role = "player";
let _sheets = {}; // sheetId -> sheet
let _unsub = null;

export function setSheetsContext({ roomId, role }) {
  _roomId = roomId;
  _role = role || "player";
}

export function getSheets() { return _sheets || {}; }

export function watchSheets(roomId) {
  _roomId = roomId;
  const r = dbRef(pSheets(roomId));
  _unsub = dbOnValue(r, (snap) => {
    _sheets = snap.exists() ? (snap.val() || {}) : {};
    emit("sheets:update", _sheets);
  });
  return () => { try { _unsub?.(); } catch(_) {} _unsub=null; };
}

export function getMySheet() {
  const uid = currentUser()?.uid;
  if (!uid) return null;
  for (const s of Object.values(_sheets || {})) {
    if (s && s.ownerUid === uid) return s;
  }
  return null;
}

export async function createSheet(data) {
  if (!_roomId) throw new Error("no_room");
  if (!isMaster(_role)) throw new Error("not_master");

  const ref = await dbPush(dbRef(pSheets(_roomId)));
  const sheetId = ref.key;

  const sheet = {
    id: sheetId,
    name: data?.name || "Personagem",
    ownerUid: data?.ownerUid ?? null, // when assigned to player
    attrs: {
      QI: data?.attrs?.QI ?? 1,
      FOR: data?.attrs?.FOR ?? 1,
      DEX: data?.attrs?.DEX ?? 1,
      VIG: data?.attrs?.VIG ?? 1,
    },
    bio: {
      idade: data?.bio?.idade ?? 0,
      peso: data?.bio?.peso ?? 0,
      altura: data?.bio?.altura ?? 0,
    },
    mental: data?.mental ?? 0,
    notes: data?.notes ?? "",
    inventory: data?.inventory ?? [], // items
    advantages: data?.advantages ?? [],
    updatedAt: nowServer(),
  };

  await dbSet(dbRef(pSheet(_roomId, sheetId)), sheet);
  return sheet;
}

export async function updateSheet(sheetId, patch) {
  if (!_roomId) throw new Error("no_room");
  // master can update any; player can update only own (enforced also by rules)
  await dbUpdate(dbRef(pSheet(_roomId, sheetId)), { ...patch, updatedAt: nowServer() });
}

export async function deleteSheet(sheetId) {
  if (!_roomId) throw new Error("no_room");
  if (!isMaster(_role)) throw new Error("not_master");
  await dbRemove(dbRef(pSheet(_roomId, sheetId)));
}

// --- Exports (module contract)
