// Core validation/sanitization (contratos)
export const VALID = Object.freeze({
  NAME_MIN: 1,
  NAME_MAX: 24,
  ROOM_MIN: 4,
  ROOM_MAX: 32,
  NOTE_PLAYER_MAX: 2000,
  NOTE_MASTER_MAX: 4000,
});

export function clampInt(n, min, max) {
  const x = Number.isFinite(+n) ? Math.trunc(+n) : min;
  return Math.max(min, Math.min(max, x));
}

export function clampNum(n, min, max) {
  const x = Number.isFinite(+n) ? +n : min;
  return Math.max(min, Math.min(max, x));
}

export function sanitizeText(s, maxLen) {
  const v = String(s ?? "").replace(/\u0000/g, "").trim();
  if (maxLen != null) return v.slice(0, maxLen);
  return v;
}

export function validateDisplayName(name) {
  const v = sanitizeText(name, VALID.NAME_MAX);
  if (v.length < VALID.NAME_MIN) return { ok: false, reason: "name_too_short" };
  return { ok: true, value: v };
}

export function validateRoomCode(code) {
  // roomId/code: letras/números/_/-
  const v = sanitizeText(code, VALID.ROOM_MAX);
  if (v.length < VALID.ROOM_MIN) return { ok: false, reason: "room_too_short" };
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return { ok: false, reason: "room_bad_chars" };
  return { ok: true, value: v };
}

export function parseMod(modStr) {
  // mod permitido:
  // - soma: "+3" "-2" "5"
  // - mult: "*1.5" "*2"
  const s = sanitizeText(modStr, 24);
  if (!s) return { ok: true, kind: "none", value: 0, raw: "" };

  if (/^\*\d+(\.\d+)?$/.test(s)) {
    return { ok: true, kind: "mul", value: parseFloat(s.slice(1)), raw: s };
  }
  if (/^[+-]?\d+$/.test(s)) {
    return { ok: true, kind: "add", value: parseInt(s, 10), raw: s };
  }
  return { ok: false, reason: "invalid_mod", raw: s };
}

export function validateAttrUsed(attr) {
  const v = String(attr ?? "").toUpperCase();
  if (v === "QI" || v === "FOR" || v === "DEX" || v === "VIG") return { ok: true, value: v };
  if (v === "" || v === "NULL" || v === "NONE") return { ok: true, value: null };
  return { ok: false, reason: "invalid_attr", raw: v };
}
