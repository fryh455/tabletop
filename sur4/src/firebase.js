import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, remove, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
export const firebaseConfig = {
  apiKey: "AIzaSyBjSCYNOngXOSQGBU7jMj1kgf7hunfMjyI",
  authDomain: "marionetes-do-destino.firebaseapp.com",
  databaseURL: "https://marionetes-do-destino-default-rtdb.firebaseio.com",
  projectId: "marionetes-do-destino",
  storageBucket: "marionetes-do-destino.firebasestorage.app",
  messagingSenderId: "506859529879",
  appId: "1:506859529879:web:aef41f525b22754c7f6bd2",
  measurementId: "G-LQNNS93LDY"
};
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const fb = { ref, onValue, set, update, push, remove, get };
