import { toast } from "./app.js";

async function fileToBase64(file){
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for(let i=0;i<bytes.length;i+=chunkSize){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunkSize));
  }
  return btoa(binary);
}

export async function uploadToPostImage(file, apiKey){
  const key = (apiKey || localStorage.getItem("sur4_postimage_key") || "").trim();
  if(!key) throw new Error("Defina uma PostImage API Key (localStorage sur4_postimage_key ou settings da sala).");

  const nameFull = (file?.name || "image.png");
  const parts = nameFull.split(".");
  const ext = (parts.length>1 ? parts.pop() : "png").toLowerCase();
  const name = parts.join(".") || "image";

  const imageB64 = await fileToBase64(file);

  // PostImages (postimages.org) API (reverse-engineered / widely used in clients)
  const params = new URLSearchParams();
  params.set("key", key);
  params.set("o", "2b819584285c102318568238c7d4a4c7");
  params.set("m", "59c2ad4b46b0c1e12d5703302bff0120");
  params.set("version", "1.0.1");
  params.set("portable", "1");
  params.set("name", name);
  params.set("type", ext);
  params.set("image", imageB64);

  const res = await fetch("https://api.postimage.org/1/upload", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString()
  });

  const text = await res.text();
  let data = null;
  try{ data = JSON.parse(text); }catch{ /* ignore */ }

  if(!res.ok){
    const msg = data?.error || data?.message || text || "Falha no upload";
    throw new Error(msg);
  }

  const url = data?.url || data?.direct || data?.image?.url || data?.data?.url || data?.data?.url_viewer;
  if(!url) throw new Error("Resposta PostImage sem URL");
  return url;
}