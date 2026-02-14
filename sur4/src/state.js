export const state = {
  roomId: null,
  session: null,
  ui: { snapToGrid: false, gridSize: 50, selectedTokenId: null, selectedSheetId: null },
  room: { players: [], tokens: [], sheets: [] }
};

export function resetStateForRoom(roomId) {
  state.roomId = roomId;
  state.ui.selectedTokenId = null;
  state.ui.selectedSheetId = null;
  state.room.players = [];
  state.room.tokens = [];
  state.room.sheets = [];
}
