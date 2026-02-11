# SUR4 Tabletop (Vanilla JS + Firebase)

Projeto de mesa virtual para o sistema **SUR4**.

## ✅ O que está implementado
- Autenticação Firebase (email/senha)
- Roles: **master** / **player** (definido ao criar/entrar na sala)
- Salas (CRUD mínimo) + presença de players
- Fichas (criar, editar, importar JSON, render)
- Tokens (criar, arrastar no canvas, vincular ficha, trocar sprite via PostImage)
- Mapa: canvas + grid + layers + fog of war (master controla)
- Intenções: cálculo base + board de distribuição + resolução
- Rolagens: engine 1d12 / 2d12, histórico
- Combate simultâneo: comparação, coreografia e efeitos
- Logs (audit trail): rolagens, combate, intenções, alterações em tokens/fichas

## 🚀 Como rodar
1. Sirva a pasta como **site estático** (ex.: VSCode Live Server) apontando a raiz do projeto.
2. Abra:
   - `/public/index.html`
3. Configure Firebase em `src/config/firebaseConfig.js`.
4. (Opcional) Configure PostImage em `src/config/postimageConfig.js`.

## 🔐 Regras do Firebase
Arquivo `firebase.rules.json` contém um template de rules para Firestore (ajuste conforme seu projeto).

## Estrutura
Veja a árvore no enunciado — está espelhada aqui.



## GitHub Pages
- Os arquivos `index.html` e `room.html` ficam na raiz para o GitHub Pages abrir automaticamente.
- Caminhos foram ajustados para **relativos**.
