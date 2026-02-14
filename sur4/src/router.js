export function initRouter({ onRoute }) {
  function parse() {
    const hash = location.hash || "";
    const roomMatch = hash.match(/^#\/room\/([a-zA-Z0-9_-]{3,64})/);
    if (roomMatch) {
      onRoute?.({ name: "room", params: { roomId: roomMatch[1] } });
      return;
    }
    onRoute?.({ name: "unknown", params: {} });
  }
  window.addEventListener("hashchange", parse);
  parse();
}
