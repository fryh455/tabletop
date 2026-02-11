import { postimageConfig } from "../config/postimageConfig.js";
import { toast } from "../utils/helpers.js";

export async function uploadToPostImage(file){
  if (!postimageConfig.enabled){
    throw new Error("PostImage desativado em src/config/postimageConfig.js");
  }
  // Observação: a API pública do PostImage pode variar. Este wrapper é um template.
  const form = new FormData();
  form.append("image", file);
  if (postimageConfig.apiKey && postimageConfig.apiKey !== "REPLACE_ME"){
    form.append("key", postimageConfig.apiKey);
  }

  const res = await fetch(postimageConfig.endpoint, { method:"POST", body: form });
  if (!res.ok) throw new Error("Falha no upload.");
  const data = await res.json();
  // tente padrões comuns
  return data?.url || data?.data?.url || data?.data?.image?.url || null;
}
