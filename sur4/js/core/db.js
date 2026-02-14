// Firebase init + RTDB helpers
import { assertFirebaseConfig } from "./env.js";
import {
  initializeApp,
  getApps,
  getDatabase,
  ref as _ref,
  child as _child,
  get as _get,
  set as _set,
  update as _update,
  remove as _remove,
  push as _push,
  onValue as _onValue,
  onChildAdded as _onChildAdded,
  onChildChanged as _onChildChanged,
  onChildRemoved as _onChildRemoved,
  off as _off,
  serverTimestamp,
  onDisconnect as _onDisconnect,
} from "./firebase_imports.js";

let _app = null;
let _db = null;

export function initFirebaseApp() {
  if (_app) return _app;
  const cfg = assertFirebaseConfig();
  const apps = getApps();
  _app = apps && apps.length ? apps[0] : initializeApp(cfg);
  _db = getDatabase(_app);
  return _app;
}

export function getDb() {
  if (!_db) initFirebaseApp();
  return _db;
}

// Re-export helpers (thin wrappers)
export function dbRef(path) {
  return _ref(getDb(), String(path || ""));
}
export function dbChild(refOrPath, subPath) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _child(r, String(subPath || ""));
}
export function dbGet(refOrPath) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _get(r);
}
export function dbSet(refOrPath, value) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _set(r, value);
}
export function dbUpdate(refOrPath, patch) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _update(r, patch);
}
export function dbRemove(refOrPath) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _remove(r);
}
export function dbPush(refOrPath, value) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  const k = _push(r);
  if (value !== undefined) return _set(k, value).then(() => k);
  return Promise.resolve(k);
}

export function dbOnValue(refOrPath, cb) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _onValue(r, cb);
}
export function dbOnChildAdded(refOrPath, cb) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _onChildAdded(r, cb);
}
export function dbOnChildChanged(refOrPath, cb) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _onChildChanged(r, cb);
}
export function dbOnChildRemoved(refOrPath, cb) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _onChildRemoved(r, cb);
}
export function dbOff(refOrPath) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _off(r);
}

export function nowServer() {
  // Use in patches: { updatedAt: nowServer() }
  return serverTimestamp();
}

export function dbOnDisconnect(refOrPath) {
  const r = typeof refOrPath === "string" ? dbRef(refOrPath) : refOrPath;
  return _onDisconnect(r);
}
