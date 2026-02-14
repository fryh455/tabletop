// Map state + master updates (bg url/transform)
import { dbRef, dbUpdate, nowServer } from "../core/db.js";
import { pMap } from "../core/paths.js";
import { isMaster } from "../core/permissions.js";
import { emit, on } from "../core/events.js";

let _ctx = { roomId: null, role: "player" };
let _map = null;

export function setMapContext(ctx) { _ctx = { ..._ctx, ...(ctx||{}) }; }
export function getMapState() { return _map; }

on("room:map", (m) => {
  _map = m || null;
  emit("map:update", _map);
});

export async function updateMap(patch) {
  if (!_ctx.roomId) throw new Error("no_room");
  if (!isMaster(_ctx.role)) throw new Error("not_master");
  await dbUpdate(dbRef(pMap(_ctx.roomId)), { ...(patch||{}), updatedAt: nowServer() });
}

// --- Exports (module contract)
export { updateMap };
