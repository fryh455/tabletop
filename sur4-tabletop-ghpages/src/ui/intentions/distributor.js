import { upsertIntention } from "../../db/intentions.js";
import { state } from "../../core/state.js";

export async function assignIntention({ type="attack", targetTokenId=null, note="", round=1 }){
  return await upsertIntention(state.roomId, null, {
    uid: state.user.uid,
    type,
    targetTokenId,
    note,
    round,
    status: "planned"
  });
}
