# SUR4 Tabletop MVP (subfolder-safe)

Funciona em subdiretórios do GitHub Pages, ex:
- https://usuario.github.io/repo/sur4/

Motivo: `sur4/index.html` usa `<base href="./" />` + paths relativos.

## Publicar
- Coloque esta pasta `sur4/` no root do repo.
- Ative GitHub Pages apontando para root do branch.
- A raiz `index.html` redireciona para `./sur4/`.

## Rodar local
- Abra `sur4/index.html` via Live Server.

## MVP
- Login modal: nome + role (master/player), sem persistência.
- Tabletop: canvas + tokens (base64), mover (master sempre, player só o próprio).
- Fichas: mestre cria e atribui por nome do jogador; player vê só as próprias.
- Rolagem: clique no atributo (d12 + modificador), com modo normal/adv/dis.
- Export/Import: JSON do estado do room.
