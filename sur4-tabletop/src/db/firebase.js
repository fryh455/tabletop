import firebaseConfig from "../config/firebaseConfig.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, get, child, set, push, update, onValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

let app = null;
let database = null;
let auth = null;

export function initFirebase(config = null) {
  if (app) return { app, database, auth };
  const cfg = config || firebaseConfig;
  app = initializeApp(cfg);
  database = getDatabase(app);
  auth = getAuth(app);
  // expose for convenience
  window.firebaseApp = app;
  window.firebaseDatabase = database;
  window.firebaseAuth = auth;
  return { app, database, auth };
}

export { database as db, auth, ref, get, child, set, push, update, onValue };
