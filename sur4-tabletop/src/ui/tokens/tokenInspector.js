export function openTokenInspector(token){
  const el = document.getElementById('token-inspector');
  if(!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<div><h3>Token: ${token.tokenId || ''}</h3><img src="${token.spriteUrl||''}" style="width:64px;height:64px"/><div>owner: ${token.ownerUid||'n/a'}</div></div>`;
}
