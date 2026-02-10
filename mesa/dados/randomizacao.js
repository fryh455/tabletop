// Exports: gerarSeed, rolarComSeed
// Simple deterministic RNG using xorshift and seeded with time+random
export function gerarSeed() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  return s;
}

function xorshift32(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }
  return function() {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967295;
  };
}

export function rolarComSeed(seed, specDados = "1d20") {
  // spec "NdM" support
  const rng = xorshift32(seed);
  const m = specDados.match(/(\d+)d(\d+)/i);
  const results = [];
  if (!m) {
    // fallback single roll 1..20
    results.push(Math.floor(rng() * 20) + 1);
    return results;
  }
  const n = parseInt(m[1],10);
  const sides = parseInt(m[2],10);
  for (let i = 0; i < n; i++) {
    results.push(Math.floor(rng() * sides) + 1);
  }
  return results;
}