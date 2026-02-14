export function d12() {
  return 1 + Math.floor(Math.random() * 12);
}

export function rollD12({ mode = "normal", modifier = 0 } = {}) {
  // mode: normal | advantage | disadvantage
  let rolls = [];
  let base = 0;

  if (mode === "advantage" || mode === "disadvantage") {
    const a = d12();
    const b = d12();
    rolls = [a, b];
    base = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
  } else {
    const a = d12();
    rolls = [a];
    base = a;
  }

  return {
    rolls,
    base,
    modifier,
    total: base + (Number(modifier) || 0)
  };
}
