// Implements SUR4 calculations for DTs, HP, intentions, movement, dodge (esquiva)
export function calcIntentionsForCharacter(char){
  const VIG = Number(char.attributes?.VIG || char.attributes?.vig || 1);
  const DEX = Number(char.attributes?.DEX || char.attributes?.dex || 1);
  return Math.floor((VIG + DEX + 1)/2);
}

export function calcMovementForCharacter(char){
  const DEX = Number(char.attributes?.DEX || char.attributes?.dex || 1);
  return DEX + 3;
}

export function calcDodgeForCharacter(char){
  const DEX = Number(char.attributes?.DEX || char.attributes?.dex || 1);
  return DEX * 2;
}

export function calcDTsForCharacter(char){
  const VIG = Number(char.attributes?.VIG || char.attributes?.vig || 1);
  const FOR = Number(char.attributes?.FOR || char.attributes?.for || 1);
  return {
    head: (VIG + 3) * 4,
    torso: (VIG + FOR + 3) * 4,
    arm: (VIG + 3) * 3,
    leg: (VIG + 3) * 3
  };
}

export function calcHPForCharacter(char){
  const dts = calcDTsForCharacter(char);
  const sum = dts.head + dts.torso + dts.arm + dts.leg;
  return sum * 4;
}
