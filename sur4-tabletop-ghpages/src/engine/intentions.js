import { floor } from "../utils/math.js";
import { ensureAttr } from "./validation.js";

export function baseIntentions(attrs){
  const a = ensureAttr(attrs);
  return floor((a.VIG + a.DEX + 1) / 2);
}

export function movement(attrs){
  const a = ensureAttr(attrs);
  return a.DEX + 3;
}

export function dodge(attrs){
  const a = ensureAttr(attrs);
  return a.DEX * 2;
}
