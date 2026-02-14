export const state = {
  roomId: null,
  session: null, // { displayName, role, roomId }
  ui: {
    snapToGrid: false,
    gridSize: 50,
    selectedTokenId: null,
    selectedSheetId: null
  },
  room: {
    players: [], // local list (no sync): [{ displayName, role }]
    tokens: [],  // token objects
    sheets: []   // sheet objects
  }
};

export function resetStateForRoom(roomId) {
  state.roomId = roomId;
  state.ui.selectedTokenId = null;
  state.ui.selectedSheetId = null;

  // Volatile room state; starts empty
  state.room.players = [];
  state.room.tokens = [];
  state.room.sheets = [];
}
