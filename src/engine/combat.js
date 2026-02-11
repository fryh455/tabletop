import { roll } from '../ui/rolls/rollEngine.js';

// Simplified combat choreography following spec rules when possible
export function damageFromStrike(diceValue, modifiers, targetDT){
  // diceValue is d12 result or sum per spec
  let ST = diceValue + (modifiers.damage||0);
  let damage = ST;
  if(ST > targetDT) { damage = ST * 2; }
  if(ST >= targetDT * 3) { damage = damage; /* immediate disable handled elsewhere */ }
  // critical natural
  if(diceValue === 12){ damage = Math.floor(damage * 1.5); }
  return { ST, damage };
}

// roll two d12 for attack phase and return results
export function rollAttackPool(){
  const a = Math.floor(Math.random()*12)+1;
  const b = Math.floor(Math.random()*12)+1;
  return [a,b];
}

// resolve attack vs attack basic
export function resolveContest(attackA, attackB, dexA, dexB){
  if(attackA > attackB) return 1;
  if(attackA < attackB) return -1;
  if(dexA > dexB) return 1;
  if(dexA < dexB) return -1;
  // tie fallback: reroll
  const rA = Math.floor(Math.random()*12)+1;
  const rB = Math.floor(Math.random()*12)+1;
  return resolveContest(rA, rB, dexA, dexB);
}
