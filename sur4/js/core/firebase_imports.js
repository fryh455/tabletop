// Centralized Firebase CDN imports (ESM)
// Keep versions consistent to avoid double-loading issues.
// Version pinned: 12.9.0
export { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";

export {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

export {
  getDatabase,
  ref,
  child,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  off,
  serverTimestamp,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
