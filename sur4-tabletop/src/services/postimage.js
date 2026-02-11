import { POSTIMAGE_API_KEY, POSTIMAGE_UPLOAD_URL } from '../config/postimageConfig.js';

export async function uploadImage(file){
  const form = new FormData();
  form.append('image', file);
  form.append('key', POSTIMAGE_API_KEY);
  const res = await fetch(POSTIMAGE_UPLOAD_URL, { method:'POST', body: form });
  if(!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.data ? data.data.url : data.url || null;
}
