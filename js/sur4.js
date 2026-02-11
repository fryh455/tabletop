// SUR4 formulas + dice (minimal but complete for required features)
export function intentions(VIG, DEX){ return Math.floor((VIG + DEX + 1)/2); }
export function movement(DEX){ return DEX + 3; }
export function dodge(DEX){ return DEX * 2; }

export function dtHead(VIG){ return (VIG + 3) * 4; }
export function dtTorso(VIG, FOR){ return (VIG + FOR + 3) * 4; }
export function dtArm(VIG){ return (VIG + 3) * 3; }
export function dtLeg(VIG){ return (VIG + 3) * 3; }
export function hpTotal(dts){
  const sum = dts.head + dts.torso + dts.armL + dts.armR + dts.legL + dts.legR;
  return sum * 4;
}

export function inventoryLimit(FOR, VIG){ return (FOR + VIG) * 4; }
export function classifyKg(kg){ return kg<=3 ? "leve" : kg<=10 ? "medio" : "pesado"; }

export function d12(){ return 1 + Math.floor(Math.random()*12); }
export function roll(mode="normal"){
  if(mode==="normal") return {dice:[d12()], picked:null};
  const a=d12(), b=d12();
  const picked = mode==="advantage" ? Math.max(a,b) : Math.min(a,b);
  return {dice:[a,b], picked};
}

export function ncEffectiveDt(nc, base=9){
  if(nc>=7) return 0;
  // simple ladder: NC1=9, NC2=8, NC3=7, NC4=5, NC5=3, NC6=2
  if(nc<=1) return base;
  if(nc===2) return base-1;
  if(nc===3) return base-2;
  if(nc===4) return Math.max(0, base-4);
  if(nc===5) return Math.max(0, base-6);
  if(nc===6) return Math.max(0, base-7);
  return base;
}

export function resolveDamage(st, dt, natural){
  let final = st;
  let outcome = "normal";
  const flags=[];
  if(natural===12){ final = Math.floor(final * 1.5); flags.push("CRIT_12"); }
  if(st > dt){ final = st*2; outcome="muito_danificado"; flags.push("DBL"); }
  if(st >= 3*dt && dt>0){ outcome="inutilizado"; flags.push("DISABLE"); }
  return {final, outcome, flags};
}

export function mentalEffects(m){
  if(m>=5) return {dtDelta:-3, dicePenalty:0, noAdvantages:false, physPerIntention:0};
  if(m<=-12) return {dtDelta:0, dicePenalty:-5, noAdvantages:true, physPerIntention:5};
  if(m<=-10) return {dtDelta:0, dicePenalty:-5, noAdvantages:true, physPerIntention:0};
  if(m<=-8) return {dtDelta:0, dicePenalty:-5, noAdvantages:false, physPerIntention:0};
  return {dtDelta:0, dicePenalty:0, noAdvantages:false, physPerIntention:0};
}
