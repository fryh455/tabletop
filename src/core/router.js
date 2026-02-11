// Router simples baseado em querystring
export function getRoomIdFromURL(){
  const url = new URL(window.location.href);
  return url.searchParams.get("room") || null;
}

export function goToRoom(roomId){
  window.location.href = `room.html?room=${encodeURIComponent(roomId)}`;
}

export function goHome(){
  window.location.href = `index.html`;
}
