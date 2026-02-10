//Exports: inicializarAuth, loginEmailSenha, registrarEmailSenha, obterUsuarioAtual
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

let app = null;
let auth = null;
let database = null;

export async function inicializarAuth(firebaseConfig) {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
  }
  return { app, auth, database };
}

export async function loginEmailSenha(email, senha) {
  try {
    if (!auth) throw new Error("Auth não inicializado");
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    const usuario = cred.user;
    return { sucesso: true, usuario };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export async function registrarEmailSenha(nome, email, senha) {
  try {
    if (!auth || !database) throw new Error("Firebase não inicializado");
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const uid = cred.user.uid;
    const usuarioRef = ref(database, `/usuarios/${uid}`);
    await set(usuarioRef, {
      nome: nome,
      papel: "jogador",
      criado_em: new Date().toISOString()
    });
    return { sucesso: true, usuario: { uid, nome, email } };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export function obterUsuarioAtual() {
  if (!auth) return null;
  return auth.currentUser || null;
}

// Auto-init UI bindings (silent, no extra output)
if (typeof window !== "undefined") {
  // minimal auto-init using global firebase config if present
  const elLogin = document.getElementById("btn-login");
  const elReg = document.getElementById("btn-registrar");
  window.addEventListener("load", () => {
    // do nothing if not present
    if (!elLogin && !elReg) return;
    // try to find global firebaseConfig
    const cfg = window.firebaseConfig || null;
    if (cfg) inicializarAuth(cfg);
  });

  if (elLogin) {
    elLogin.addEventListener("click", async () => {
      const email = document.getElementById("login-email").value;
      const senha = document.getElementById("login-senha").value;
      const res = await loginEmailSenha(email, senha);
      if (res.sucesso) {
        window.location.href = "principal/principal.html";
      } else {
        alert("Erro: " + res.erro);
      }
    });
  }

  if (elReg) {
    elReg.addEventListener("click", async () => {
      const nome = document.getElementById("reg-nome").value;
      const email = document.getElementById("reg-email").value;
      const senha = document.getElementById("reg-senha").value;
      const res = await registrarEmailSenha(nome, email, senha);
      if (res.sucesso) {
        alert("Registrado. Faça login.");
      } else {
        alert("Erro: " + res.erro);
      }
    });
  }

}
