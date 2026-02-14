import { dbApi } from "../firebase/firebase.js";
import { db } from "../firebase/firebase.js";
import { ref } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { paths } from "./paths.js";
import { state } from "../state.js";

export function mountRoomSync(roomId) {
  const unsub = [];

  const on = (path, cb) => {
    const rr = ref(db, path);
    const u = dbApi.onValue(rr, (snap) => cb(snap.val()));
    unsub.push(u);
  };

  on(paths.roomMeta(roomId), (v) => {
    state.roomMeta = v || null;
    state.masterUid = v?.masterUid || null;
    if (state.me?.uid && state.masterUid) {
      state.role = state.me.uid === state.masterUid ? "master" : "player";
    }
    window.dispatchEvent(new CustomEvent("app:room:meta", { detail: v }));
  });

  on(paths.roomPlayers(roomId), (v) => {
    state.room.playersByUid = v || {};
    window.dispatchEvent(new CustomEvent("app:room:players", { detail: v }));
  });

  on(paths.roomTokens(roomId), (v) => {
    state.room.tokensById = v || {};
    window.dispatchEvent(new CustomEvent("app:room:tokens", { detail: v }));
  });

  on(paths.roomSheets(roomId), (v) => {
    state.room.sheetsById = v || {};
    window.dispatchEvent(new CustomEvent("app:room:sheets", { detail: v }));
  });

  on(paths.roomRolls(roomId), (v) => {
    state.room.rollsById = v || {};
    window.dispatchEvent(new CustomEvent("app:room:rolls", { detail: v }));
  });

  on(paths.roomMap(roomId), (v) => {
    state.room.map = v || state.room.map;
    window.dispatchEvent(new CustomEvent("app:room:map", { detail: v }));
  });

  return () => { unsub.forEach((u) => typeof u === "function" && u()); };
}
