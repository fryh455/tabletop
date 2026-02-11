export function floor(n){ return Math.floor(n); }
export function sum(arr){ return arr.reduce((a,b)=>a+(Number(b)||0),0); }
export function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
