export function d12(){ return 1 + Math.floor(Math.random() * 12); }

export function rollD12({ mode="normal", modifier=0, multiplier=1 } = {}) {
  let rolls = [];
  let base = 0;

  if (mode === "advantage" || mode === "disadvantage") {
    const a = d12(), b = d12();
    rolls = [a, b];
    base = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
  } else {
    const a = d12();
    rolls = [a];
    base = a;
  }

  const add = Number(modifier) || 0;
  const mul = Number(multiplier) || 1;

  const total = Math.trunc((base + add) * mul);
  return { rolls, base, add, mul, total };
}
