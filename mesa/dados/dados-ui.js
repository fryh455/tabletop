/* IDs: #select-dado, #btn-rolar, #rolagem-result */
export function initDicerUI(containerId = null) {
  // [ASSUNÇÃO] UI simple injection if container present
  const container = containerId ? document.getElementById(containerId) : document.body;
  const select = document.createElement("input");
  select.id = "select-dado";
  select.placeholder = "ex: 2d6";
  const btn = document.createElement("button");
  btn.id = "btn-rolar";
  btn.textContent = "Rolar";
  const out = document.createElement("div");
  out.id = "rolagem-result";
  container.appendChild(select);
  container.appendChild(btn);
  container.appendChild(out);
  return { select, btn, out };
}