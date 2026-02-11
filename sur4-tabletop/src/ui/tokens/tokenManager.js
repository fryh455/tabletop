import { ref, push, set, update } from '../../db/firebase.js';
import { getAuthInstance } from '../../auth/auth.js';

export function attachTokenManager(roomId){
  const sidebar = document.getElementById('sidebar-left');
  if(!sidebar) return;
  const btn = document.createElement('button');
  btn.textContent = 'Criar Token';
  btn.addEventListener('click', ()=> createTokenUI(roomId));
  sidebar.appendChild(btn);
}

export async function createTokenUI(roomId){
  const tokenData = { x:200, y:200, layer:0, ownerUid:null, spriteUrl:null, linkedCharId:null };
  const tokensRef = ref(window.firebaseDatabase, `/rooms/${roomId}/tokens`);
  const newRef = push(tokensRef);
  await set(newRef, Object.assign({ tokenId: newRef.key }, tokenData));
  return newRef.key;
}

export async function moveToken(tokenId, x, y, roomId){
  const tokenRef = ref(window.firebaseDatabase, `/rooms/${roomId}/tokens/${tokenId}`);
  return update(tokenRef, { x, y });
}
