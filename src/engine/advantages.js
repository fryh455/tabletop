import { ncTest } from "./ncSystem.js";

export function evolveNC(currentNC=1){
  const next = Math.min(7, Math.max(1, Number(currentNC)||1) + 1);
  const test = ncTest(next);
  return { nextNC: next, test };
}
