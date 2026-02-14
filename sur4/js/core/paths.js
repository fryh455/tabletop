// Centralized DB paths
export const pRoom = (roomId) => `/rooms/${roomId}`;
export const pRooms = () => `/rooms`;

export const pRoomSettings = (roomId) => `/rooms/${roomId}/settings`;
export const pRoomPlayers = (roomId) => `/rooms/${roomId}/players`;
export const pRoomPlayer = (roomId, uid) => `/rooms/${roomId}/players/${uid}`;

export const pTokens = (roomId) => `/rooms/${roomId}/tokens`;
export const pToken = (roomId, tokenId) => `/rooms/${roomId}/tokens/${tokenId}`;

export const pSheets = (roomId) => `/rooms/${roomId}/sheets`;
export const pSheet = (roomId, sheetId) => `/rooms/${roomId}/sheets/${sheetId}`;

export const pMap = (roomId) => `/rooms/${roomId}/map`;

export const pFog = (roomId) => `/rooms/${roomId}/fog`;
export const pFogTypes = (roomId) => `/rooms/${roomId}/fog/types`;
export const pFogAreas = (roomId) => `/rooms/${roomId}/fog/areas`;

export const pMarks = (roomId) => `/rooms/${roomId}/marks`;

export const pTokenGroups = (roomId) => `/rooms/${roomId}/tokenGroups`;
export const pTokenGroup = (roomId, groupId) => `/rooms/${roomId}/tokenGroups/${groupId}`;

// camera follow
export const pRoomCam = (roomId) => `/rooms/${roomId}/cam`;
export const pRoomPlayerCam = (roomId, uid) => `/rooms/${roomId}/playerCam/${uid}`;
