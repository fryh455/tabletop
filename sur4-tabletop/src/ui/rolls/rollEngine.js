import { pushRoll } from '../../db/rolls.js';

function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

export function roll(expression, modifiers={}){
  // expression examples: "1d12+3", "2d12"
  const m = expression.match(/(\d+)d(\d+)([+-]\d+)?/i);
  if(!m) throw new Error('Invalid expression');
  const times = parseInt(m[1],10), sides = parseInt(m[2],10), fixed = m[3]?parseInt(m[3],10):0;
  const results=[];
  for(let i=0;i<times;i++) results.push(randInt(1,sides));
  const total = results.reduce((a,b)=>a+b,0) + fixed + (modifiers.add||0) - (modifiers.sub||0);
  const rollObj = { expression, results, total, modifiers, timestamp: Date.now(), userUid: (window.firebaseAuth && window.firebaseAuth.currentUser)?window.firebaseAuth.currentUser.uid:null, visibility: modifiers.visibility||'public' };
  if(modifiers.roomId) pushRoll(modifiers.roomId, rollObj);
  return rollObj;
}

export function rollAdvantage(sides=12){ const a = randInt(1,sides), b = randInt(1,sides); return Math.max(a,b); }
export function rollDisadvantage(sides=12){ const a = randInt(1,sides), b = randInt(1,sides); return Math.min(a,b); }
