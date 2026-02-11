export function renderHeader(){
  const header = document.getElementById('header-bar');
  if(!header) return;
  header.innerHTML = `<div class="header-left"><h1>SUR4</h1></div><div class="header-right"><button id="btn-logout">Logout</button></div>`;
  const btn = document.getElementById('btn-logout');
  if(btn) btn.addEventListener('click', async ()=>{
    const auth = await import('../../auth/auth.js');
    await auth.logout();
    window.location.href = 'index.html';
  });
}

export function renderSidebar(){
  const sidebar = document.getElementById('sidebar-left');
  if(!sidebar) return;
  sidebar.innerHTML = `<div class="sidebar-section"><h3>Controles</h3><button id="btn-open-sheet">Abrir Ficha</button><button id="btn-open-intentions">Intentions</button></div><div id="rooms-list"></div>`;
  const btn = document.getElementById('btn-open-sheet');
  if(btn) btn.addEventListener('click', ()=>{
    const s = document.getElementById('character-sheet');
    s.classList.toggle('hidden');
  });
}
