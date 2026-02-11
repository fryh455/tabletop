import { d12, roll as rollDie, sum } from "../../engine/dice.js";
import { addRoll } from "../../db/rolls.js";
import { state } from "../../core/state.js";

export async function roll1d12({ label="", mod=0 }){
  const natural = d12();
  const total = natural + (Number(mod)||0);
  return await addRoll(state.roomId, {
    uid: state.user.uid,
    label,
    dice: [natural],
    mod: Number(mod)||0,
    total
  });
}

export async function roll2d12({ label="", mod=0 }){
  const dice = rollDie(2,12);
  const total = sum(dice) + (Number(mod)||0);
  return await addRoll(state.roomId, {
    uid: state.user.uid,
    label,
    dice,
    mod: Number(mod)||0,
    total
  });
}
