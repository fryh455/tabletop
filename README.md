# SUR4 - Online Tabletop (Lite)

Vanilla JS + Firebase Auth (email/password) + Firebase Realtime Database.
Pronto para rodar local e publicar no GitHub Pages (sem build).

## Rodar local
Use um servidor estático na raiz (ex.: VSCode Live Server).
Abra `index.html`.

## GitHub Pages
1. Suba os arquivos na raiz do repo (index.html, room.html, css/, js/, etc)
2. Settings -> Pages:
   - Deploy from a branch
   - Branch: main
   - Folder: /(root)
3. Acesse: `https://<user>.github.io/<repo>/`

## Firebase (obrigatório)
1. Console Firebase -> Authentication -> Sign-in method: habilite **Email/Password**
2. Authentication -> Settings -> Authorized domains:
   - adicione `<user>.github.io`
   - adicione `localhost`
3. Realtime Database: crie a RTDB e aplique as rules do arquivo `firebase.rules.json`

## PostImage
Para trocar sprite via upload, gere uma API key do PostImage e cole no painel Tokens (salva em localStorage).

## Observações
- Paths no GitHub Pages são relativos (./js/...).
- Players só movem/alteram o próprio token (client + rules).
