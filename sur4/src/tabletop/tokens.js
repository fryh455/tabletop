import { $, setHidden, safeText, escapeHtml } from "../utils/dom.js";
import { state, isMaster } from "../state.js";
import { uid } from "../utils/id.js";
import { setv, upv, del } from "../db/api.js";
import { paths } from "../db/paths.js";

const imageCache = new Map();
function getOrCreateImage(token){
  if(imageCache.has(token.id)) return imageCache.get(token.id);
  const img = new Image();
  img.src = token.imageBase64;
  imageCache.set(token.id, img);
  return img;
}

export function renderTokens(ctx, { worldToScreen, zoom }) {
  const tokens = Object.values(state.room.tokensById || {});
  for (const t of tokens) {
    const s = worldToScreen(t.x, t.y);
    const size = (t.size || 64) * zoom;

    if (state.ui.selectedTokenId === t.id) {
      ctx.save();
      ctx.strokeStyle = "rgba(91,214,255,0.85)";
      ctx.lineWidth = Math.max(2, 2 * zoom);
      ctx.strokeRect(s.x - size/2 - 3, s.y - size/2 - 3, size + 6, size + 6);
      ctx.restore();
    }

    ctx.save();
    const img = getOrCreateImage(t);
    ctx.drawImage(img, s.x - size/2, s.y - size/2, size, size);

    const label = t.ownerUid ? (state.room.playersByUid?.[t.ownerUid]?.name || t.ownerUid.slice(0,6)) : "master";
    ctx.font = `${Math.max(10, 11 * zoom)}px ui-sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const tw = ctx.measureText(label).width;
    ctx.fillRect(s.x - tw/2 - 6, s.y + size/2 + 4, tw + 12, 16 * zoom);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(label, s.x - tw/2, s.y + size/2 + 16 * zoom);
    ctx.restore();
  }
}

export function hitTestToken(wx, wy) {
  const tokens = Object.values(state.room.tokensById || {});
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const half = (t.size || 64) / 2;
    if (wx >= t.x - half && wx <= t.x + half && wy >= t.y - half && wy <= t.y + half) return t;
  }
  return null;
}

export function canMoveToken(token) {
  if (!state.me) return false;
  if (isMaster()) return true;
  if (state.room.map?.locked) return false;
  return token.ownerUid && token.ownerUid === state.me.uid;
}

export function mountTokenCreateModal() {
  const btnAddToken = $("#btn-add-token");
  const overlay = $("#modal-token");
  const inputOwnerUid = $("#token-owner-uid");
  const inputSize = $("#token-size");
  const inputFile = $("#token-file");
  const btnCreate = $("#token-create");
  const btnCancel = $("#token-cancel");

  function renderButton() {
    btnAddToken.classList.toggle("hidden", !isMaster());
  }
  window.addEventListener("app:room:meta", renderButton);
  renderButton();

  function open() {
    if (!isMaster()) return;
    inputOwnerUid.value = "";
    inputSize.value = "64";
    inputFile.value = "";
    setHidden(overlay, false);
  }
  function close() { setHidden(overlay, true); }

  btnAddToken.addEventListener("click", open);
  btnCancel.addEventListener("click", close);

  btnCreate.addEventListener("click", async () => {
    if (!isMaster()) return;
    if (!inputFile.files?.[0]) return alert("Escolha uma imagem.");

    const size = Math.max(16, Number(inputSize.value) || 64);
    const ownerUid = safeText(inputOwnerUid.value, 80) || null;
    const base64 = await fileToDataURL(inputFile.files[0]);

    const id = uid("token");
    const token = {
      id,
      x: 200 + Math.random() * 200,
      y: 200 + Math.random() * 200,
      size,
      ownerUid,
      linkedSheetId: null,
      imageBase64: base64,
      updatedAt: Date.now()
    };

    await setv(paths.roomToken(state.roomId, id), token);
    close();
    state.ui.selectedTokenId = id;
    window.dispatchEvent(new CustomEvent("app:token:selected", { detail: id }));
  });
}

export function mountInspector() {
  const inspector = $("#inspector");
  const empty = $("#inspector-empty");

  function render() {
    const tokenId = state.ui.selectedTokenId;
    const token = tokenId ? state.room.tokensById?.[tokenId] : null;
    if (!token) {
      empty.classList.remove("hidden");
      inspector.innerHTML = "";
      return;
    }
    empty.classList.add("hidden");

    const canEdit = isMaster();

    inspector.innerHTML = `
      <div class="token-card">
        <div class="row"><strong>Token</strong><span class="muted">${escapeHtml(token.id)}</span></div>

        <div class="kv"><div class="muted small">OwnerUid</div><div>${escapeHtml(token.ownerUid || "-")}</div></div>
        <div class="kv"><div class="muted small">LinkedSheetId</div><div>${escapeHtml(token.linkedSheetId || "-")}</div></div>
        <div class="kv"><div class="muted small">Posição</div><div>${Math.round(token.x)}, ${Math.round(token.y)}</div></div>
        <div class="kv"><div class="muted small">Tamanho</div><div>${escapeHtml(String(token.size||64))}</div></div>

        <hr />

        <div class="section-title">Editar (mestre)</div>
        <div class="form-row">
          <label>OwnerUid</label>
          <input id="tok-owner" ${canEdit ? "" : "disabled"} value="${escapeHtml(token.ownerUid || "")}" placeholder="uid do player" />
        </div>
        <div class="form-row">
          <label>LinkedSheetId</label>
          <input id="tok-sheet" ${canEdit ? "" : "disabled"} value="${escapeHtml(token.linkedSheetId || "")}" placeholder="sheetId" />
        </div>
        <div class="form-row">
          <label>Tamanho (px) ilimitado</label>
          <input id="tok-size" ${canEdit ? "" : "disabled"} type="number" min="1" step="1" value="${escapeHtml(String(token.size||64))}" />
        </div>

        <div class="form-row">
          <button id="tok-apply" ${canEdit ? "" : "disabled"} type="button">Aplicar</button>
          <button id="tok-delete" class="danger" ${canEdit ? "" : "disabled"} type="button">Deletar</button>
        </div>
      </div>
    `;

    inspector.querySelector("#tok-apply")?.addEventListener("click", async () => {
      const ownerUid = safeText(inspector.querySelector("#tok-owner").value, 80) || null;
      const linkedSheetId = safeText(inspector.querySelector("#tok-sheet").value, 80) || null;
      const size = Math.max(1, Number(inspector.querySelector("#tok-size").value) || 64);
      await upv(paths.roomToken(state.roomId, token.id), { ownerUid, linkedSheetId, size, updatedAt: Date.now() });
      alert("Atualizado.");
    });

    inspector.querySelector("#tok-delete")?.addEventListener("click", async () => {
      if (!confirm("Deletar token?")) return;
      await del(paths.roomToken(state.roomId, token.id));
      state.ui.selectedTokenId = null;
      window.dispatchEvent(new CustomEvent("app:token:selected", { detail: null }));
    });
  }

  window.addEventListener("app:token:selected", render);
  window.addEventListener("app:room:tokens", render);
  window.addEventListener("app:room:meta", render);
  render();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler arquivo."));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
