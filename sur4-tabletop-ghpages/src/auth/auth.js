import { auth } from "../db/firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { el, toast } from "../utils/helpers.js";

export function renderAuthCard(root, { onAuthed }={}){
  root.innerHTML="";
  const wrap=el("div",{class:"stack gap-12"},[
    el("h2",{class:"h2"},["Login"]),
    el("p",{class:"muted"},["Entre com email/senha. Se não tiver conta, cadastre."])
  ]);

  const email=el("input",{class:"input", placeholder:"Email", type:"email"});
  const pass=el("input",{class:"input", placeholder:"Senha", type:"password"});

  const btnIn=el("button",{class:"btn", onclick: async ()=>{
    try{
      await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      toast("Login OK.");
      onAuthed?.();
    }catch(e){
      toast(e.message, "error");
    }
  }},["Entrar"]);

  const btnUp=el("button",{class:"btn secondary", onclick: async ()=>{
    try{
      await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      toast("Cadastro OK.");
      onAuthed?.();
    }catch(e){
      toast(e.message, "error");
    }
  }},["Cadastrar"]);

  wrap.appendChild(el("div",{class:"stack gap-8"},[
    el("label",{class:"label"},["Email"]), email,
    el("label",{class:"label"},["Senha"]), pass,
    el("div",{class:"row gap-8"},[btnIn, btnUp])
  ]));

  root.appendChild(wrap);
}
