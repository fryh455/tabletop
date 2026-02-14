# SUR4 - Simple (GitHub Pages)

## Atenção (importante)
Este build usa **UID = nome** e **não usa Auth**. Para funcionar, suas **Firebase Realtime DB Rules** precisam permitir read/write.
Durante testes, use rules abertas (não recomendado em produção):

{
  "rules": { ".read": true, ".write": true }
}

Se você quiser segurança real (recomendado), eu troco para Firebase Auth + UID real, mantendo o nome como displayName.

## Deploy
- Suba o repo no GitHub
- Settings -> Pages -> Deploy from GitHub Actions
- O workflow `/.github/workflows/pages.yml` publica o site.
- A página inicial redireciona para `/sur4/`.
