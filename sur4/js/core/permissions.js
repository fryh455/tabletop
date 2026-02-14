// Client-side permission helpers (NOT security rules)
export function isMaster(role) {
  return String(role || "").toLowerCase() === "master";
}
export function isPlayer(role) {
  return String(role || "").toLowerCase() === "player";
}

export function canMoveToken({ role, token, settings, authUid }) {
  if (isMaster(role)) return true;
  if (!isPlayer(role)) return false;
  if (!settings?.playersCanMoveOwnTokens) return false;
  if (!token) return false;
  if (token.locked) return false;
  return token.ownerUid === authUid;
}

export function canEditMental({ role, sheet, settings, authUid }) {
  if (isMaster(role)) return true;
  if (!isPlayer(role)) return false;
  if (!settings?.playersCanEditMental) return false;
  return sheet?.ownerUid === authUid;
}

export function canEditInventory({ role, sheet, settings, authUid }) {
  if (isMaster(role)) return true;
  if (!isPlayer(role)) return false;
  if (!settings?.playersCanEditInventory) return false;
  return sheet?.ownerUid === authUid;
}

export function canPanZoom({ role, settings }) {
  if (isMaster(role)) return true;
  if (!isPlayer(role)) return false;
  return !!settings?.playersCanPanZoom;
}
