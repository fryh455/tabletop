export function showRollModal(rollObj){
  const el = document.getElementById('roll-modal');
  if(!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<div class="modal-content"><h3>Rolagem</h3><div>Expr: ${rollObj.expression}</div><div>Resultados: ${Array.isArray(rollObj.results)?rollObj.results.join(', '):rollObj.results}</div><div>Total: ${rollObj.total}</div><button id="btn-close-roll">Fechar</button></div>`;
  document.getElementById('btn-close-roll').addEventListener('click', ()=> el.classList.add('hidden'));
}
