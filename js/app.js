export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

export function toast(msg, type="info"){
  const root = $("#toastRoot");
  const div = document.createElement("div");
  div.className = "toast " + (type==="error"?"error": type==="ok"?"ok":"");
  div.textContent = msg;
  root.appendChild(div);
  setTimeout(()=>div.remove(), 4200);
}

export function openModal(title, html){
  $("#modalTitle").textContent = title;
  const body = $("#modalBody");
  body.innerHTML = "";
  if (typeof html === "string") body.innerHTML = html;
  else body.appendChild(html);
  $("#modalBack").classList.add("open");
}
export function closeModal(){ $("#modalBack").classList.remove("open"); }
export function bindModal(){
  $("#modalClose")?.addEventListener("click", closeModal);
  $("#modalBack")?.addEventListener("click", (e)=>{ if(e.target.id==="modalBack") closeModal(); });
}

export function esc(s){ return String(s??"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
export function clampLen(s, n){ s=String(s??""); return s.length>n? s.slice(0,n): s; }
export function num(v, d=0){ const x=Number(v); return Number.isFinite(x)? x:d; }

export function qparam(name){
  const u=new URL(location.href);
  return u.searchParams.get(name);
}
export function goRoom(roomId){ location.href = `room.html?room=${encodeURIComponent(roomId)}`; }
export function goHome(){ location.href = "index.html"; }

export function uidShort(uid){ return uid? uid.slice(0,6)+"…"+uid.slice(-4):""; }
