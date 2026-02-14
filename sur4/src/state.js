export const state = {
  roomId: null,
  me: null, // { uid, name }
  role: null, // "master" | "player"
  masterUid: null,
  roomMeta: null,

  ui: {
    snapToGrid: false,
    gridSize: 50,
    selectedTokenId: null,
    selectedSheetId: null,

    // local view (can be overridden by master sync view)
    zoom: 1,
    panX: 0,
    panY: 0,

    fogEdit: false,
    syncView: false
  },

  room: {
    playersByUid: {},
    tokensById: {},
    sheetsById: {},
    rollsById: {},
    map: {
      locked: false,
      fog: { enabled: false, opacity: 0.6, imageBase64: null, rects: {} }, // rects: {rectId:{x,y,w,h}}
      view: { enabled: false, zoom: 1, panX: 0, panY: 0 }
    }
  }
};

export function resetRoomState(roomId) {
  state.roomId = roomId;
  state.role = null;
  state.masterUid = null;
  state.roomMeta = null;

  state.ui.selectedTokenId = null;
  state.ui.selectedSheetId = null;
  state.ui.zoom = 1;
  state.ui.panX = 0;
  state.ui.panY = 0;
  state.ui.fogEdit = false;
  state.ui.syncView = false;

  state.room.playersByUid = {};
  state.room.tokensById = {};
  state.room.sheetsById = {};
  state.room.rollsById = {};
  state.room.map = { locked: false, fog: { enabled:false, opacity:0.6, imageBase64:null, rects:{} }, view:{ enabled:false, zoom:1, panX:0, panY:0 } };
}

export function isMaster() { return state.role === "master"; }
