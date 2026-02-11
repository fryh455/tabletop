export function ensureNum(n, def=0){
  const x=Number(n);
  return Number.isFinite(x)? x : def;
}

export function ensureAttr(attrs){
  const { FOR, DEX, VIG, QI } = attrs||{};
  return {
    FOR: ensureNum(FOR, 0),
    DEX: ensureNum(DEX, 0),
    VIG: ensureNum(VIG, 0),
    QI: ensureNum(QI, 0),
  };
}
