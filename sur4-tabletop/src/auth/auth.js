import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged as onAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { initFirebase } from "../db/firebase.js";

let authInstance = null;

export function getAuthInstance() {
  if (!authInstance) {
    initFirebase(); // ensure initialized
    authInstance = getAuth();
    // expose to window for some modules
    window.firebaseAuth = authInstance;
  }
  return authInstance;
}

export async function login(email, password) {
  const a = getAuthInstance();
  return signInWithEmailAndPassword(a, email, password);
}

export async function register(email, password) {
  const a = getAuthInstance();
  return createUserWithEmailAndPassword(a, email, password);
}

export async function logout() {
  const a = getAuthInstance();
  return signOut(a);
}

export function onAuthStateChanged(cb) {
  const a = getAuthInstance();
  return onAuth(a, cb);
}
