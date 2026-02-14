// Token inspector: select token to set global selected id (used by marks stash)
import { setHtml } from "./dom.js";
import { on } from "../core/events.js";
import { getTokens } from "../room/tokens.js";
import { loadSession } from "../core/state.js";
import { toast } from "./toast.js";

function render(tokenId) {
  const t = (getTokens() || {})[tokenId];
  if (!t) { setHtml("tokenInspector", "<p>Selecione um token.</p>"); return; }

  window.__SUR4_SELECTED_TOKEN_ID = tokenId;

  const html = `
    <div class="card">
      <b>Token</b>
      <div class="muted">${t.name || tokenId}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <div class="pill">x: ${Math.round(t.x||0)}</div>
        <div class="pill">y: ${Math.round(t.y||0)}</div>
        <div class="pill">size: ${t.size||1}</div>
        <div class="pill">owner: ${t.ownerUid||"NPC"}</div>
      </div>
    </div>
  `;
  setHtml("tokenInspector", html);
}

export function mountTokenInspector() {
  on("token:select", ({ tokenId }) => render(tokenId));
}
