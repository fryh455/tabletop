import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjSCYNOngXOSQGBU7jMj1kgf7hunfMjyI",
  authDomain: "marionetes-do-destino.firebaseapp.com",
  databaseURL: "https://marionetes-do-destino-default-rtdb.firebaseio.com",
  projectId: "marionetes-do-destino"
};

let app = null;
let auth = null;
let database = null;

export function inicializarFirebase() {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  }
  auth = getAuth();
  database = getDatabase();
  return { app, auth, database };
}

export function obterAuth() {
  if (!auth) throw new Error("Firebase não inicializado");
  return auth;
}

export function obterDatabase() {
  if (!database) throw new Error("Firebase não inicializado");
  return database;
}
