import { safeParseJSON, toast } from "../../utils/helpers.js";

export function importSheetFromJSON(text){
  const obj = safeParseJSON(text);
  if (!obj){ toast("JSON inválido.", "error"); return null; }
  // normaliza estrutura mínima
  obj.name = obj.name || "Personagem";
  obj.attrs = obj.attrs || { FOR:0, DEX:0, VIG:0, QI:0 };
  obj.inventory = obj.inventory || [];
  obj.mental = Number(obj.mental||0);
  obj.nc = Number(obj.nc||1);
  return obj;
}
