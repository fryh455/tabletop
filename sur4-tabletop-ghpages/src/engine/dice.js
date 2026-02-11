import { randInt } from "../utils/math.js";

export function d12(){ return randInt(1,12); }
export function d4(){ return randInt(1,4); }
export function d6(){ return randInt(1,6); }
export function d8(){ return randInt(1,8); }

export function roll(n=1, die=12){
  const out=[];
  for (let i=0;i<n;i++) out.push(randInt(1,die));
  return out;
}

export function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
