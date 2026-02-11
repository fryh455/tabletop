import { el, toast } from "../../utils/helpers.js";
import { uploadToPostImage } from "../../services/postimage.js";

export function spriteUploader({ onUrl }){
  const file=el("input",{type:"file", class:"input"});
  const url=el("input",{type:"text", class:"input", placeholder:"...ou cole uma URL da imagem"});
  const btn=el("button",{class:"btn secondary small", onclick: async ()=>{
    try{
      if (url.value.trim()){
        onUrl?.(url.value.trim());
        toast("Sprite atualizado (URL).");
        return;
      }
      const f = file.files?.[0];
      if (!f) return toast("Selecione um arquivo ou informe URL.","warn");
      const u = await uploadToPostImage(f);
      if (!u) throw new Error("Upload não retornou URL.");
      onUrl?.(u);
      toast("Sprite atualizado (PostImage).");
    }catch(e){
      toast(e.message,"error");
    }
  }},["Enviar/Aplicar"]);

  return el("div",{class:"stack gap-6"},[
    el("label",{class:"label"},["Sprite (PostImage ou URL)"]),
    file, url, btn
  ]);
}
