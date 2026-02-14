// Firebase Auth (anonymous) + profile(displayName)
import { initFirebaseApp } from "./db.js";
import { sanitizeText } from "./validate.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut as _signOut,
  updateProfile,
} from "./firebase_imports.js";

let _auth = null;
let _user = null;
let _readyPromise = null;

export function getAuthClient() {
  if (_auth) return _auth;
  const app = initFirebaseApp();
  _auth = getAuth(app);
  return _auth;
}

export function currentUser() {
  return _user;
}

export function onAuth(cb) {
  return onAuthStateChanged(getAuthClient(), (u) => {
    _user = u || null;
    try { cb?.(_user); } catch (_) {}
  });
}

export function ensureAuth(displayName) {
  if (_readyPromise) return _readyPromise;

  const name = sanitizeText(displayName, 24);
  _readyPromise = new Promise((resolve, reject) => {
    const auth = getAuthClient();

    const unsub = onAuthStateChanged(auth, async (u) => {
      unsub();
      try {
        if (!u) {
          const cred = await signInAnonymously(auth);
          u = cred.user;
        }
        _user = u;

        // Best-effort set displayName (not used as uid for security; uid is auth.uid)
        if (name && _user && _user.displayName !== name) {
          try { await updateProfile(_user, { displayName: name }); } catch (_) {}
        }
        resolve(_user);
      } catch (e) {
        reject(e);
      }
    });
  });

  return _readyPromise;
}

export function signOut() {
  _readyPromise = null;
  _user = null;
  return _signOut(getAuthClient());
}
