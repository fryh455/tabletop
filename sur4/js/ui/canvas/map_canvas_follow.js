// Optional patch helpers to apply follow rules on camera each frame
import { centerOnWorld } from "./camera.js";
import { getTokens } from "../../room/tokens.js";

export function applyFollowRule(cam, canvas, rule){
  if (!rule || !canvas) return;
  const w = canvas.clientWidth || 0;
  const h = canvas.clientHeight || 0;

  if (rule.mode === "xy") {
    centerOnWorld(cam, Number(rule.x)||0, Number(rule.y)||0, w, h);
    return;
  }
  if (rule.mode === "token") {
    const t = getTokens()?.[rule.tokenId];
    if (!t) return;
    centerOnWorld(cam, Number(t.x)||0, Number(t.y)||0, w, h);
    return;
  }
  // masterCam handled elsewhere (player uses master broadcast camera state)
}
