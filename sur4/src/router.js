export function initRouter({ onRoom }) {
  function parse() {
    const hash = location.hash || "";
    const m = hash.match(/^#\/room\/([a-zA-Z0-9_-]{3,64})/);
    if (m) return onRoom?.(m[1]);
    onRoom?.(null);
  }
  window.addEventListener("hashchange", parse);
  parse();
}
