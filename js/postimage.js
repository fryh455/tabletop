// OBS: Este projeto roda como site estático no GitHub Pages.
// Upload externo (ex: PostImage) e uso de API key foram removidos por restrição do projeto.
// Use URLs simples (http/https) já hospedadas ou DataURL/base64 (via input file) para sprites.

export async function uploadToPostImage(){
  throw new Error(
    "Upload externo desabilitado. Use uma URL direta de imagem ou carregue como DataURL/base64 no painel de Tokens."
  );
}
