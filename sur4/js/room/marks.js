// Marks: master-only points with stash + notes
import { dbRef, dbOnValue, dbPush, dbSet, dbUpdate, dbRemove, nowServer } from "../core/db.js";
import { emit } from "../core/events.js";
import { isMaster } from "../core/permissions.js";
import { pMarks, pMark, pMarkStash } from "../core/paths.js";

let _ctx = { roomId: null, role: "player" };
let _marks = {};
let _unsub = null;

export function setMarksContext(ctx) { _ctx = { ..._ctx, ...(ctx||{}) }; }
export function getMarks() { return _marks || {}; }

export function watchMarks(roomId) {
  _ctx.roomId = roomId;
  const r = dbRef(pMarks(roomId));
  _unsub = dbOnValue(r, (snap) => {
    _marks = snap.exists() ? (snap.val() || {}) : {};
    emit("marks:update", _marks);
  });
  return () => { try{_unsub?.();}catch(_){} _unsub=null; };
}

function assertMaster() {
  if (!_ctx.roomId) throw new Error("no_room");
  if (!isMaster(_ctx.role)) throw new Error("not_master");
}

export async function createMark(data) {
  assertMaster();
  const ref = await dbPush(dbRef(pMarks(_ctx.roomId)));
  const id = ref.key;
  const m = {
    id,
    name: String(data?.name || "Marco").slice(0, 48),
    x: Number(data?.x)||0,
    y: Number(data?.y)||0,
    notes: String(data?.notes || "").slice(0, 2000),
    // stash can store references and snapshots
    stash: {
      tokens: Array.isArray(data?.stash?.tokens) ? data.stash.tokens.slice(0, 200) : [],
      sheets: Array.isArray(data?.stash?.sheets) ? data.stash.sheets.slice(0, 200) : [],
      items: Array.isArray(data?.stash?.items) ? data.stash.items.slice(0, 500) : [],
    },
    createdAt: nowServer(),
    updatedAt: nowServer(),
  };
  await dbSet(dbRef(pMark(_ctx.roomId, id)), m);
  return m;
}

export async function updateMark(markId, patch) {
  assertMaster();
  await dbUpdate(dbRef(pMark(_ctx.roomId, markId)), { ...(patch||{}), updatedAt: nowServer() });
}

export async function deleteMark(markId) {
  assertMaster();
  await dbRemove(dbRef(pMark(_ctx.roomId, markId)));
}

export async function pushToMarkStash(markId, kind, entry) {
  assertMaster();
  const key = kind === "tokens" ? "stash/tokens" : kind === "sheets" ? "stash/sheets" : "stash/items";
  const cur = _marks?.[markId]?.stash?.[kind] || [];
  const next = cur.concat([entry]).slice(-500);
  await dbUpdate(dbRef(pMark(_ctx.roomId, markId)), { [key]: next, updatedAt: nowServer() });
}

export async function removeFromMarkStash(markId, kind, idx) {
  assertMaster();
  const key = kind === "tokens" ? "stash/tokens" : kind === "sheets" ? "stash/sheets" : "stash/items";
  const cur = (_marks?.[markId]?.stash?.[kind] || []).slice();
  cur.splice(idx, 1);
  await dbUpdate(dbRef(pMark(_ctx.roomId, markId)), { [key]: cur, updatedAt: nowServer() });
}

// --- Exports (module contract)
export { createMark, updateMark, deleteMark, pushToMarkStash, removeFromMarkStash };
