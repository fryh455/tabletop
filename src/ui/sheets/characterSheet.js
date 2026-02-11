import { ref, push, set, get } from '../../db/firebase.js';
import { sanitizeString } from '../../utils/sanitize.js';
import { calcDTsForCharacter, calcHPForCharacter, calcIntentionsForCharacter, calcMovementForCharacter } from './sheetLogic.js';

export function renderCharacterSheet(charId=null){
  const el = document.getElementById('character-sheet');
  if(!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<div class="sheet-header"><h3>Ficha</h3><div id="sheet-content">Nenhuma ficha selecionada</div><button id="btn-import-sheet">Importar JSON</button></div>`;
  const btn = document.getElementById('btn-import-sheet');
  if(btn) btn.addEventListener('click', ()=> import('./sheetImporter.js').then(m=>m.openImporter()));
}

export async function saveCharacter(roomId, charObj){
  const sanitized = Object.assign({}, charObj);
  sanitized.name = sanitizeString(sanitized.name||'Personagem', 120);
  const charsRef = ref(window.firebaseDatabase, `/rooms/${roomId}/characters`);
  if(!sanitized.charId){ const newRef = push(charsRef); sanitized.charId = newRef.key; await set(newRef, sanitized); return sanitized; }
  else { const charRef = ref(window.firebaseDatabase, `/rooms/${roomId}/characters/${sanitized.charId}`); await set(charRef, sanitized); return sanitized; }
}
