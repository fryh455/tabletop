// Core ENV (GitHub Pages friendly)
// Regras:
// - Imports sempre relativos (ESM).
// - Nunca hardcode de secrets aqui; lê config de window.__FIREBASE_CONFIG__.
// - Base URL sempre relativo (funciona em /sur4/).
export const ENV = Object.freeze({
  APP_NAME: "SUR4",
  // Para assets/rotas internas (se precisar), mantém relativo.
  BASE_PATH: "./",
  // Firebase: esperado em runtime via <script> antes do app, ou setado no window.
  // Exemplo: window.__FIREBASE_CONFIG__ = { ... }.
  FIREBASE_CONFIG:
    (typeof window !== "undefined" && window.__FIREBASE_CONFIG__)
      ? window.__FIREBASE_CONFIG__
      : null,
  // RTDB root (se quiser prefixar versões)
  DB_VERSION: "v1",
});

export function assertFirebaseConfig() {
  if (!ENV.FIREBASE_CONFIG) {
    const msg =
      "Firebase config ausente. Defina window.__FIREBASE_CONFIG__ antes de carregar o app.";
    const err = new Error(msg);
    err.code = "ENV_NO_FIREBASE_CONFIG";
    throw err;
  }
  return ENV.FIREBASE_CONFIG;
}

export function baseUrl(path = "") {
  // Mantém sempre relativo para funcionar em GitHub Pages /sur4/
  const p = String(path || "").replace(/^\/+/, "");
  return ENV.BASE_PATH + p;
}
