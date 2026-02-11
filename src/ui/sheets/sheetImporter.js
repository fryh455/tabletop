import { saveCharacter } from './characterSheet.js';

export function openImporter(){
  const el = document.getElementById('sheet-content');
  if(!el) return;
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Cole o JSON da(s) ficha(s) SUR4 aqui';
  const btn = document.createElement('button');
  btn.textContent = 'Importar';
  btn.addEventListener('click', async ()=>{
    try{
      const data = JSON.parse(textarea.value);
      const roomId = new URLSearchParams(window.location.search).get('roomId');
      if(Array.isArray(data)){
        for(const c of data) await saveCharacter(roomId, c);
      } else await saveCharacter(roomId, data);
      alert('Importado');
    } catch(e){ alert('JSON inválido'); }
  });
  el.innerHTML=''; el.appendChild(textarea); el.appendChild(btn);
}
