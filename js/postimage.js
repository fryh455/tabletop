import { toast } from "./app.js";

export async function uploadToPostImage(file, apiKey){
  if(!apiKey) throw new Error("Defina uma PostImage API Key.");
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`https://api.postimg.cc/1/upload?key=${encodeURIComponent(apiKey)}`, { method:"POST", body: form });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.error?.message || "Falha no upload");
  // data.data.url (page) and data.data.url_viewer; prefer direct image if present:
  const url = data?.data?.url || data?.data?.url_viewer;
  if(!url) throw new Error("Resposta PostImage sem URL");
  return url;
}
