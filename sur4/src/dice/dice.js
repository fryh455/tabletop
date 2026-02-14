export function d12(){return 1+Math.floor(Math.random()*12);}
export function rollD12({mode="normal",modifier=0}={}) {
  let rolls=[],base=0;
  if(mode==="advantage"||mode==="disadvantage"){const a=d12(),b=d12();rolls=[a,b];base=mode==="advantage"?Math.max(a,b):Math.min(a,b);}
  else {const a=d12();rolls=[a];base=a;}
  const m=Number(modifier)||0;
  return {rolls,base,modifier:m,total:base+m};
}
