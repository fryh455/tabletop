// Estados mentais e efeitos pós-combate
export function mentalEffects(score){
  const s = Number(score)||0;
  const eff = { dtGlobalDelta:0, dicePenalty:0, noAdvantages:false, physPerIntention:0, state:s };

  if (s >= 5) eff.dtGlobalDelta = -3;
  if (s === -8 || s === -9) eff.dicePenalty = -5;
  if (s === -10 || s === -11) eff.noAdvantages = true;
  if (s <= -12) eff.physPerIntention = 5;

  return eff;
}
