import { SUR4 } from "../utils/constants.js";
import { d12 } from "./dice.js";

export function ncTest(nc=1){
  // Teste 1d12 vs DT base 9, com redução de DT por NC
  // regra: DT efetiva = max(0, 9 - (nc-1))
  const dtEff = Math.max(0, SUR4.DT_BASE_NC_TEST - Math.max(0,(nc-1)));
  const r = d12();
  const success = dtEff===0 ? true : (r >= dtEff);
  return { roll:r, dt:dtEff, success, nc };
}
