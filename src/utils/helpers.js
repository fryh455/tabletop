import { esc } from "./sanitize.js";

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

export function el(tag, attrs={}, children=[]){
  const node=document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})){
    if (k==="class") node.className=v;
    else if (k==="html") node.innerHTML=v;
    else if (k.startsWith("on") && typeof v==="function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  for (const c of (children||[])){
    if (c==null) continue;
    node.appendChild(typeof c==="string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function toast(msg, type="info"){
  const t=el("div",{class:`toast toast-${type}`},[msg]);
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add("show"), 20);
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(), 200); }, 2600);
}

export function fmtTime(ts){
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString();
}

export function jsonDownload(filename, obj){
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

export function safeParseJSON(str){
  try { return JSON.parse(str); } catch { return null; }
}

export function prettyKg(kg){
  const n=Number(kg)||0;
  return `${n.toFixed(1)} kg`;
}

export function badge(text){
  return `<span class="badge">${esc(text)}</span>`;
}
