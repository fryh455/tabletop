export const state = {
  user: null,
  roomId: null,
  player: null,      // {uid, role, displayName}
  room: null,
  players: [],
  characters: [],
  tokens: [],
  intentions: [],
  rolls: [],
  logs: [],
  ui: {
    activeTab: "Mapa"
  }
};

export function setState(patch){
  Object.assign(state, patch);
}
