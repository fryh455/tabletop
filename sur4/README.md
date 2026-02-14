# SUR4 Tabletop (Sync MVP)

Roda em subdiretório no GitHub Pages:
- `https://usuario.github.io/repo/sur4/`

## Como usar
1. Abra `.../sur4/`
2. Digite seu nome.
3. Clique **Criar mesa** (vira mestre) ou **Entrar com código**.
4. Link da sala: botão **Sala** (topo).

### Controles
- Zoom local: scroll (mestre ou player).
- Pan: Shift + arrastar (bloqueado no player se Sync View estiver ON).
- Mestre:
  - Criar token
  - Editar token (ownerUid, sheetId, tamanho ilimitado)
  - Criar ficha (ownerUid obrigatório)
  - Lock map (impede players moverem tokens)
  - Fog ON/OFF
  - Fog: **Alt+arrastar** cria retângulo escondido (players não enxergam por cima).
  - Imagem Fog: define overlay base64 + opacidade
  - Sync View: quando ON, players seguem zoom/pan do mestre.

## Firebase Realtime DB (regras mínimas)
**Ajuste em Firebase Console → Realtime Database → Rules**:

- `rooms/{roomId}/meta/masterUid` define o mestre.
- Players podem ler tudo da sala, mas só escrever:
  - `rooms/{roomId}/players/{uid}`
  - `rooms/{roomId}/rolls/*`
  - `rooms/{roomId}/tokens/*` apenas se `ownerUid == auth.uid` e `map.locked == false`
  - `rooms/{roomId}/sheets/*` apenas se `ownerUid == auth.uid` e apenas campos permitidos (playerNotes/inventory) — no MVP o cliente respeita, mas ideal é travar em rules.

Arquivo `firebase_rules.example.json` na pasta `sur4/` contém um baseline (você cola no console e ajusta).
