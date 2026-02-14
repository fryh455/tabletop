// Micro event-bus (imutável) — evita acoplamento de módulos
const listeners = new Map(); // event -> Set(fn)

export function on(eventName, fn) {
  const ev = String(eventName);
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(fn);
  return () => off(ev, fn);
}

export function off(eventName, fn) {
  const ev = String(eventName);
  const set = listeners.get(ev);
  if (!set) return;
  set.delete(fn);
  if (set.size === 0) listeners.delete(ev);
}

export function emit(eventName, payload) {
  const ev = String(eventName);
  const set = listeners.get(ev);
  if (!set) return;
  // nunca quebra o app por listener ruim
  for (const fn of Array.from(set)) {
    try { fn(payload); } catch (_) {}
  }
}

export function once(eventName, fn) {
  const unsub = on(eventName, (p) => { unsub(); fn(p); });
  return unsub;
}
