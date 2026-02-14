import { $ } from "../utils/dom.js";
import { state } from "../state.js";
import { uid } from "../utils/id.js";
import { setHidden, safeText } from "../utils/dom.js";

const imageCache = new Map();
function getOrCreateImage(token){ if(imageCache.has(token.id)) return imageCache.get(token.id); const img=new Image(); img.src=token.imageBase64; imageCache.set(token.id,img); return img; }

export function renderTokens(ctx,{worldToScreen,zoom}) {
  for(const t of state.room.tokens){
    const s=worldToScreen(t.x,t.y);
    const size=(t.size||64)*zoom;

    if(state.ui.selectedTokenId===t.id){
      ctx.save(); ctx.strokeStyle="rgba(91,214,255,0.8)"; ctx.lineWidth=Math.max(2,2*zoom);
      ctx.strokeRect(s.x-size/2-3,s.y-size/2-3,size+6,size+6); ctx.restore();
    }

    ctx.save();
    const img=getOrCreateImage(t);
    ctx.drawImage(img,s.x-size/2,s.y-size/2,size,size);

    if(t.owner){
      ctx.font=`${Math.max(10,11*zoom)}px ui-sans-serif`;
      ctx.fillStyle="rgba(0,0,0,0.6)";
      const label=t.owner; const tw=ctx.measureText(label).width;
      ctx.fillRect(s.x-tw/2-6,s.y+size/2+4,tw+12,16*zoom);
      ctx.fillStyle="rgba(255,255,255,0.85)";
      ctx.fillText(label,s.x-tw/2,s.y+size/2+16*zoom);
    }
    ctx.restore();
  }
}

export function hitTestToken(wx,wy){
  for(let i=state.room.tokens.length-1;i>=0;i--){
    const t=state.room.tokens[i];
    const half=(t.size||64)/2;
    if(wx>=t.x-half&&wx<=t.x+half&&wy>=t.y-half&&wy<=t.y+half) return t;
  }
  return null;
}

export function moveKnowinglyAllowed(token){
  if(!state.session) return false;
  if(state.session.role==="master") return true;
  return token.owner && token.owner===state.session.displayName;
}

export function mountInspector(){
  const inspector=$("#inspector");
  const empty=$("#inspector-empty");

  const btnAddToken=$("#btn-add-token");
  const overlay=$("#modal-token");
  const inputOwner=$("#token-owner");
  const inputSize=$("#token-size");
  const inputFile=$("#token-file");
  const btnCreate=$("#token-create");
  const btnCancel=$("#token-cancel");

  function openTokenModal(){
    if(!state.session) return;
    if(state.session.role!=="master") return alert("Somente o mestre cria tokens no MVP.");
    inputOwner.value=""; inputSize.value="64"; inputFile.value="";
    setHidden(overlay,false);
  }
  function closeTokenModal(){ setHidden(overlay,true); }

  btnAddToken.addEventListener("click",openTokenModal);
  btnCancel.addEventListener("click",closeTokenModal);

  btnCreate.addEventListener("click", async ()=>{
    if(!inputFile.files?.[0]) return alert("Escolha uma imagem.");
    const size=Math.max(24,Math.min(256,Number(inputSize.value)||64));
    const owner=safeText(inputOwner.value,24);
    const base64=await fileToDataURL(inputFile.files[0]);

    const token={ id:uid("token"), x:200+Math.random()*200, y:200+Math.random()*200, size,
      imageBase64:base64, owner:owner||null, linkedSheetId:null, updatedAt:Date.now() };

    state.room.tokens.push(token);
    closeTokenModal();
    state.ui.selectedTokenId=token.id;
    window.dispatchEvent(new CustomEvent("app:token:selected",{detail:token.id}));
  });

  window.addEventListener("app:token:selected", renderInspector);
  window.addEventListener("app:room:imported", renderInspector);
  window.addEventListener("app:session:ready", renderInspector);

  function renderInspector(){
    const token=state.room.tokens.find(t=>t.id===state.ui.selectedTokenId);
    if(!token){ empty.classList.remove("hidden"); inspector.innerHTML=""; return; }
    empty.classList.add("hidden");

    const canEdit=state.session?.role==="master";
    const canMove=moveKnowinglyAllowed(token);

    inspector.innerHTML = `
      <div class="token-card">
        <div class="row"><strong>Token</strong><span class="muted">${token.id}</span></div>
        <div class="row"><span class="muted">Dono</span><span>${token.owner ?? "-"}</span></div>
        <div class="row"><span class="muted">Posição</span><span>${Math.round(token.x)}, ${Math.round(token.y)}</span></div>
        <div class="row"><span class="muted">Mover</span><span>${canMove ? "SIM" : "NÃO"}</span></div>
        <div class="form-row">
          <label>Vincular ficha (sheetId)</label>
          <input id="token-link-sheet" ${canEdit ? "" : "disabled"} value="${token.linkedSheetId ?? ""}" placeholder="cole o sheetId" />
        </div>
        <div class="form-row">
          <button id="token-apply-link" ${canEdit ? "" : "disabled"} type="button">Aplicar vínculo</button>
          <button id="token-delete" class="danger" ${canEdit ? "" : "disabled"} type="button">Deletar token</button>
        </div>
      </div>
    `;

    const linkInput = inspector.querySelector("#token-link-sheet");
    inspector.querySelector("#token-apply-link")?.addEventListener("click", ()=>{
      token.linkedSheetId = safeText(linkInput.value,64) || null;
      token.updatedAt=Date.now();
      alert("Vínculo aplicado.");
    });

    inspector.querySelector("#token-delete")?.addEventListener("click", ()=>{
      const idx=state.room.tokens.findIndex(t=>t.id===token.id);
      if(idx>=0) state.room.tokens.splice(idx,1);
      state.ui.selectedTokenId=null;
      window.dispatchEvent(new CustomEvent("app:token:selected",{detail:null}));
    });
  }

  renderInspector();
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error("Falha ao ler arquivo."));
    fr.onload=()=>resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
