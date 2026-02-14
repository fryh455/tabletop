// SUR4 derived stats (pure functions)
export function dtCabeca(VIG) { return (VIG + 3) * 4; }
export function dtTorso(VIG, FOR) { return (VIG + FOR + 3) * 4; }
export function dtBraco(VIG) { return (VIG + 3) * 3; }
export function dtPerna(VIG) { return (VIG + 3) * 3; }

export function hpTotal(VIG, FOR) {
  const head = dtCabeca(VIG);
  const torso = dtTorso(VIG, FOR);
  const arm = dtBraco(VIG);
  const leg = dtPerna(VIG);
  return (head + torso + arm + arm + leg + leg) * 4;
}

export function intentions(VIG, DEX) {
  return Math.floor((VIG + DEX + 1) / 2);
}
export function movement(DEX) {
  return DEX + 3;
}
export function esquiva(DEX) {
  return DEX * 2;
}
export function invLimit(FOR, VIG) {
  return (FOR + VIG) * 4;
}
