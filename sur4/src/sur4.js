export function trunc(n){ return n < 0 ? Math.ceil(n) : Math.floor(n); }
export function calcDT({ VIG, FOR }){
  const vig = Number(VIG)||0, fo = Number(FOR)||0;
  return { head:(vig+3)*4, torso:(vig+fo+3)*4, arm:(vig+3)*3, leg:(vig+3)*3 };
}
export function calcHP(dt){
  const totalDT = (dt.head + dt.torso + dt.arm + dt.arm + dt.leg + dt.leg);
  return totalDT * 4;
}
export function calcIntentions({ VIG, DEX }){ return trunc(((Number(VIG)||0)+(Number(DEX)||0)+1)/2); }
export function calcMove({ DEX }){ return (Number(DEX)||0)+3; }
export function calcInvLimit({ FOR, VIG }){ return ((Number(FOR)||0)+(Number(VIG)||0))*4; }
export function d12(){ return 1 + Math.floor(Math.random()*12); }
export function roll(mode="normal"){
  if(mode==="adv"){ const a=d12(), b=d12(); return { rolls:[a,b], base: Math.max(a,b) }; }
  if(mode==="dis"){ const a=d12(), b=d12(); return { rolls:[a,b], base: Math.min(a,b) }; }
  const a=d12(); return { rolls:[a], base:a };
}
export function parseMod(mod){
  const s=String(mod||"").trim();
  if(!s) return null;
  if(s[0]==="+"||s[0]==="-"){ const n=Number(s); if(!Number.isFinite(n)) return null; return { add:n, mul:1, raw:s }; }
  if(s[0]==="*"){ const n=Number(s.slice(1)); if(!Number.isFinite(n)) return null; return { add:0, mul:n, raw:s }; }
  return null;
}
