\
export function clamp(n, min, max){
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function safeStr(s, maxLen=120){
  if (s == null) return "";
  s = String(s);
  s = s.replace(/[\u0000-\u001F\u007F]/g, ""); // remove control chars
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function safeId(s, maxLen=40){
  s = safeStr(s, maxLen);
  // allow: a-z A-Z 0-9 _ -
  s = s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return s.slice(0, maxLen);
}

export function safeUrl(s, maxLen=512){
  s = safeStr(s, maxLen);
  // very permissive; UI should still validate image loading
  return s;
}

// Basic SUR4 sheet normalization (avoid null/undefined crashes)
export function normalizeSheet(sheet){
  const out = sheet && typeof sheet === "object" ? { ...sheet } : {};
  out.name = safeStr(out.name || "Sem nome", 60);
  out.age = clamp(out.age ?? 0, 0, 999);
  out.height = clamp(out.height ?? 0, 0, 999);
  out.weight = clamp(out.weight ?? 0, 0, 999);

  out.attrs = out.attrs && typeof out.attrs === "object" ? { ...out.attrs } : {};
  // defaults
  for (const k of ["QI","FOR","DEX","VIG"]) {
    out.attrs[k] = clamp(out.attrs[k] ?? 1, -2, 15);
  }

  out.mental = clamp(out.mental ?? 0, -12, 5);

  out.items = Array.isArray(out.items) ? out.items : [];
  out.advantages = Array.isArray(out.advantages) ? out.advantages : [];
  out.disadvantages = Array.isArray(out.disadvantages) ? out.disadvantages : [];

  out.notes = safeStr(out.notes ?? "", 4000);
  return out;
}
