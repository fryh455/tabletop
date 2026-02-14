// Firebase modular SDK via CDN (ESM)
import { firebaseConfig } from "./config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, push, remove, get, child, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export const dbApi = { ref, onValue, set, update, push, remove, get, child, runTransaction, serverTimestamp };

export async function ensureAnonAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) { unsub(); return resolve(user); }
        const cred = await signInAnonymously(auth);
        unsub();
        resolve(cred.user);
      } catch (e) {
        unsub();
        reject(e);
      }
    });
  });
}
