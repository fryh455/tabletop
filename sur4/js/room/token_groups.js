// Token Groups: move-together sets; any owner of tokens in group can move the group
import { dbRef, dbOnValue, dbPush, dbSet, dbUpdate, dbRemove, nowServer } from "../core/db.js";
import { emit } from "../core/events.js";
import { isMaster } from "../core/permissions.js";
import { pTokenGroups, pTokenGroup, pTokens } from "../core/paths.js";

let _ctx = { roomId: null, role: "player" };
let _groups = {};
let _unsub = null;

export function setGroupsContext(ctx){ _ctx = { ..._ctx, ...(ctx||{}) }; }
export function getTokenGroups(){ return _groups || {}; }

export function watchTokenGroups(roomId){
  _ctx.roomId = roomId;
  const r = dbRef(pTokenGroups(roomId));
  _unsub = dbOnValue(r, (snap) => {
    _groups = snap.exists() ? (snap.val() || {}) : {};
    emit("tokenGroups:update", _groups);
  });
  return () => { try{_unsub?.();}catch(_){} _unsub=null; };
}

function assertMaster(){
  if(!_ctx.roomId) throw new Error("no_room");
  if(!isMaster(_ctx.role)) throw new Error("not_master");
}

export async function createTokenGroup(data){
  assertMaster();
  const ref = await dbPush(dbRef(pTokenGroups(_ctx.roomId)));
  const id = ref.key;
  const g = {
    id,
    name: String(data?.name || "Grupo").slice(0, 48),
    tokenIds: Array.isArray(data?.tokenIds) ? data.tokenIds.slice(0, 200).map(String) : [],
    createdAt: nowServer(),
    updatedAt: nowServer(),
  };
  await dbSet(dbRef(pTokenGroup(_ctx.roomId, id)), g);
  return g;
}

export async function renameTokenGroup(groupId, name){
  assertMaster();
  await dbUpdate(dbRef(pTokenGroup(_ctx.roomId, groupId)), { name: String(name||"Grupo").slice(0,48), updatedAt: nowServer() });
}

export async function deleteTokenGroup(groupId){
  assertMaster();
  // also clear groupId on tokens (best-effort)
  const g = _groups?.[groupId];
  const upd = {};
  (g?.tokenIds||[]).forEach(tid => { upd[`${pTokens(_ctx.roomId)}/${tid}/groupId`] = null; });
  upd[pTokenGroup(_ctx.roomId, groupId)] = null;
  await dbUpdate(dbRef("/"), upd);
}

export async function addTokenToGroup(groupId, tokenId){
  assertMaster();
  const g = _groups?.[groupId];
  if(!g) throw new Error("group_not_found");
  const next = Array.from(new Set([...(g.tokenIds||[]), String(tokenId)])).slice(0, 200);
  const upd = {};
  upd[pTokenGroup(_ctx.roomId, groupId) + "/tokenIds"] = next;
  upd[pTokens(_ctx.roomId) + "/" + tokenId + "/groupId"] = groupId;
  upd[pTokenGroup(_ctx.roomId, groupId) + "/updatedAt"] = nowServer();
  await dbUpdate(dbRef("/"), upd);
}

export async function removeTokenFromGroup(groupId, tokenId){
  assertMaster();
  const g = _groups?.[groupId];
  if(!g) throw new Error("group_not_found");
  const next = (g.tokenIds||[]).filter(x => x !== String(tokenId));
  const upd = {};
  upd[pTokenGroup(_ctx.roomId, groupId) + "/tokenIds"] = next;
  upd[pTokens(_ctx.roomId) + "/" + tokenId + "/groupId"] = null;
  upd[pTokenGroup(_ctx.roomId, groupId) + "/updatedAt"] = nowServer();
  await dbUpdate(dbRef("/"), upd);
}

// --- Exports (module contract)
