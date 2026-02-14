// Master Clipboard: copy/cut/paste/clone for tokens (and optional hide/delete helpers)
import { createToken, updateToken, deleteToken, getTokens } from "./tokens.js";
import { isMaster } from "../core/permissions.js";
import { loadSession } from "../core/state.js";

const KEY = "sur4.clipboard.v1";

let _cursor = { x: 0, y: 0 };

export function setClipboardCursor(world){ if(world && Number.isFinite(world.x) && Number.isFinite(world.y)) _cursor = {x:world.x, y:world.y}; }
export function getClipboard(){ try{ return JSON.parse(localStorage.getItem(KEY) || "null"); } catch(_){ return null; } }

function assertMaster(){
  const s = loadSession();
  if (!isMaster(s.role)) throw new Error("not_master");
}

export function copyToken(tokenId){
  assertMaster();
  const t = getTokens()?.[tokenId];
  if (!t) throw new Error("token_not_found");
  const payload = { kind:"token", at: Date.now(), token: {
    name: t.name || "Token",
    x: t.x ?? 0,
    y: t.y ?? 0,
    size: t.size ?? 1,
    ownerUid: t.ownerUid ?? null,
    sheetId: t.sheetId ?? null,
    groupId: null, // paste never keeps group
    hidden: !!t.hidden,
    spriteUrl: t.spriteUrl ?? null,
  }};
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}

export async function cutToken(tokenId){
  assertMaster();
  const payload = copyToken(tokenId);
  await deleteToken(tokenId);
  return payload;
}

export async function pasteToken(opts={}){
  assertMaster();
  const clip = getClipboard();
  if (!clip || clip.kind !== "token" || !clip.token) throw new Error("clipboard_empty");
  const base = clip.token;

  const x = Number.isFinite(opts.x) ? opts.x : _cursor.x;
  const y = Number.isFinite(opts.y) ? opts.y : _cursor.y;

  const t = await createToken({
    name: base.name,
    x, y,
    size: base.size,
    ownerUid: base.ownerUid,
    sheetId: base.sheetId,
    groupId: null,
    hidden: false,
    spriteUrl: base.spriteUrl ?? null,
  });
  return t;
}

export async function cloneToken(tokenId, offset=24){
  assertMaster();
  const t = getTokens()?.[tokenId];
  if (!t) throw new Error("token_not_found");
  return await createToken({
    name: (t.name || "Token") + " (clone)",
    x: (t.x ?? 0) + offset,
    y: (t.y ?? 0) + offset,
    size: t.size ?? 1,
    ownerUid: t.ownerUid ?? null,
    sheetId: t.sheetId ?? null,
    groupId: null,
    hidden: false,
    spriteUrl: t.spriteUrl ?? null,
  });
}

export async function hideToken(tokenId, hidden=true){
  assertMaster();
  await updateToken(tokenId, { hidden: !!hidden });
}

export async function destroyToken(tokenId){
  assertMaster();
  await deleteToken(tokenId);
}

// --- Exports (module contract)
export { cutToken, pasteToken, cloneToken, hideToken, destroyToken };
