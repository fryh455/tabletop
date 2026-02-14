# SUR4 Tabletop MVP (GitHub Pages)

MVP: login modal (nome + role), tabletop canvas, tokens com imagem base64, fichas atribuídas pelo mestre, rolagem d12, export/import JSON.

## Rodar local
- Use qualquer servidor estático (ex.: VSCode Live Server).
- Abra `index.html`.

## GitHub Pages
1) Suba este repositório com os arquivos na raiz.
2) GitHub → Settings → Pages
3) Source: `Deploy from a branch`
4) Branch: `main` / folder `/ (root)`
5) Acesse a URL gerada.

## Rotas
- `/#/room/<roomId>`
- Sem roomId → gera automaticamente.

## Controles
- Arrastar token: mestre sempre / player apenas o próprio token.
- Pan: segure **Shift** e arraste com mouse.
- Zoom: scroll do mouse.
- Snap: botão "Snap: ON/OFF".
- Export/Import: topo.

## Observações
- Sem persistência: tudo em memória. Use Export/Import JSON para salvar/restaurar.
- Sem Firebase neste MVP.
