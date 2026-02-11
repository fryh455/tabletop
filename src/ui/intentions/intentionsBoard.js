import { ref, push, set } from '../../db/firebase.js';

export function initIntentionsBoard(roomId){
  const el = document.getElementById('intentions-board');
  if(!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<h3>Intentions</h3><div id="intentions-list"></div><button id="btn-submit-intention">Submeter Intenção</button>`;
  document.getElementById('btn-submit-intention').addEventListener('click', async ()=>{
    const intent = prompt('Descreva sua intenção:');
    if(!intent) return;
    const uid = window.firebaseAuth && window.firebaseAuth.currentUser ? window.firebaseAuth.currentUser.uid : 'anon';
    const intentionsRef = ref(window.firebaseDatabase, `/rooms/${roomId}/intentions`);
    const newRef = push(intentionsRef);
    await set(newRef, { charId:null, intent, userUid:uid, createdAt: Date.now() });
    alert('Intenção enviada');
  });
}

export function submitIntention(charId, intent){ /* signature required */ }
