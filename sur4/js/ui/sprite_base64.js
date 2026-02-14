\
import { safeUrl } from "../core/security.js";

export function isBase64Image(s){
  s = String(s||"");
  return s.startsWith("data:image/") && s.includes(";base64,");
}

export function normalizeSpriteInput(s){
  s = safeUrl(s, 800000); // allow big but not infinite
  // permit either base64 data URL or normal URL
  return s;
}
