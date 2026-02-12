import { firebaseConfig } from "./firebaseConfig.js";

// Firebase modular CDN (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, off, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

let app, auth, db;
export function initFirebase(){
  if(app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}
export function getAuthApi(){ return auth; }
export function getDb(){ return db; }


function sanitizeForFirebase(value){
  // Firebase RTDB rejects undefined. This removes undefined recursively.
  if(value === undefined) return null;
  if(value === null) return null;
  if(Array.isArray(value)){
    return value.map(v=>sanitizeForFirebase(v));
  }
  if(typeof value === "object"){
    const out = {};
    for(const [k,v] of Object.entries(value)){
      if(v === undefined) continue;
      out[k] = sanitizeForFirebase(v);
    }
    return out;
  }
  return value;
}

// Auth
export function onAuth(cb){ return onAuthStateChanged(auth, cb); }
export async function register(email, pass){ return createUserWithEmailAndPassword(auth, email, pass); }
export async function login(email, pass){ return signInWithEmailAndPassword(auth, email, pass); }
export async function logout(){ return signOut(auth); }

// RTDB helpers
export const r = (path)=> ref(db, path);
export async function dbGet(path){ const snap = await get(r(path)); return snap.exists()? snap.val(): null; }
export async function dbSet(path, val){ await set(r(path), sanitizeForFirebase(val)); }
export async function dbUpdate(path, patch){ await update(r(path), sanitizeForFirebase(patch)); }
export async function dbPush(path, val){ const p = push(r(path)); await set(p, sanitizeForFirebase(val)); return p.key; }
export function dbOn(path, cb){
  const rr = r(path);
  const h = onValue(rr, (snap)=> cb(snap.exists()? snap.val(): null));
  return ()=> off(rr, "value", h);
}
export { serverTimestamp };
