# Estrutura Realtime Database (JSON model)

Árvore JSON exigida (modelo):

/usuarios/{uid} = {
  nome: string,
  papel: "mestre"|"jogador",
  criado_em: ISOString
}

 /mesas/{mesaId} = {
   nome: string,
   codigo: string,
   mestre_id: uid,
   criado_em: ISOString,
   mapa: { /* metadados */ },
   estado: { combate: boolean, outrosFlags... }
 }

 /mesas/{mesaId}/jogadores_ids/{uid}: true

 /mesas/{mesaId}/tokens/{tokenId} = {
   nome: string,
   sprite: string,
   posicao: { x: number, y: number },
   tipo: "player"|"npc"|"criatura"|"flora"|"item",
   vinculadoUsuarioId: uid|null,
   estado: "ativo"|"oculto",
   criado_em: ISOString,
   criado_por: uid
 }

 /mesas/{mesaId}/marcos/{marcoId} = {
   nome: string,
   descricao: string,
   tokens_salvos: { tokenId: { /* snapshot do token */ }, ... },
   criado_em: ISOString,
   criado_por: uid
 }

 /fichas/{usuarioId} = {
   usuarioId: uid,
   nome: string,
   idade: number,
   peso: number,
   altura: number,
   atributos: { forca: number, destreza: number, ... },
   vida: number,
   itens: {
     {itemId}: { id, nome, tipo, atributo_relacionado, modificadores, descricao }, ...
   },
   vantagens: {
     {vantagemId}: { id, nome, tipo, atributo_relacionado, NC, DT, modificadores, descricao }, ...
   },
   atualizado_em: ISOString
 }

 /mesas/{mesaId}/rolagens/{rollId} = {
   autorId: uid,
   tipo: "atributo"|"habilidade"|"dano"|"intencao",
   dados: "2d6",
   vantagem: boolean,
   desvantagem: boolean,
   modificadores: { nome:valor, ... },
   seed: string|null,
   resultadoDetalhado: [num, ...],
   resultadoFinal: number,
   timestamp: ISOString
 }

 /mesas/{mesaId}/intencoes/{jogadorId} = {
   jogadorId: uid,
   intencoesDisponiveis: number,
   listaIntencoes: [ { tipo, quantidade }, ... ],
   ultimoUpdate: ISOString
 }

 /estado-temporario/{sessionId}/logs = {
   [index]: { autorId, texto, nivel, timestamp }
 }

# Regras de segurança (pseudocódigo)

/mesas/{mesaId}: leitura permitida se auth.uid != null && (data.exists() && parent.child('jogadores_ids').child(auth.uid).exists() || data.child('mestre_id').val() == auth.uid);
criação por qualquer usuário autenticado;
atualização de mestre_id só por mestre atual.

/mesas/{mesaId}/tokens/{tokenId}:
create/delete: auth.uid == root.child('mesas').child(mesaId).child('mestre_id').val()
update (mover): allowed if auth.uid == root.child('mesas').child(mesaId).child('mestre_id').val() OR auth.uid == newData.child('vinculadoUsuarioId').val()
validação de esquema (tipos) obrigatória

/mesas/{mesaId}/marcos/{marcoId}: leitura/escrita somente se auth.uid == mestre_id

/fichas/{usuarioId}:
leitura: (auth.uid == usuarioId) || (auth.uid == root.child('mesas').child(mesaId).child('mestre_id').val())
escrita: se auth.uid == usuarioId então apenas permitir alterações em campos não-críticos; se auth.uid == mestre_id permitir tudo

/mesas/{mesaId}/rolagens/{rollId}:
create: auth.uid != null && (root.child('mesas').child(mesaId).child('jogadores_ids').child(auth.uid).exists() || auth.uid == mestre_id)
leitura: jogadores da mesa + mestre

/mesas/{mesaId}/intencoes/{jogadorId}:
create/update: auth.uid == jogadorId || auth.uid == mestre_id

# Observações
- Regras devem validar tipos primitivos e impedir sobrescrita massiva de nós críticos.
- Todas as paths usam nomes em português e plural.\n\n\n\n\nFILE: /database.rules.json\n{
  "rules": {
    "usuarios": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid",
        ".validate": "newData.hasChildren(['nome','papel','criado_em']) && newData.child('nome').isString() && (newData.child('papel').val() == 'mestre' || newData.child('papel').val() == 'jogador')"
      }
    },
    "mesas": {
      "$mesaId": {
        ".read": "auth != null && (data.child('jogadores_ids').child(auth.uid).exists() || data.child('mestre_id').val() == auth.uid)",
        ".write": "auth != null", 
        "mestre_id": {
          ".write": "data.exists() ? data.val() == auth.uid : true"
        },
        "tokens": {
          "$tokenId": {
            ".write": "auth != null && ( (!data.exists() && root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid) || root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid || newData.child('vinculadoUsuarioId').val() == auth.uid )",
            ".validate": "newData.hasChildren(['nome','sprite','posicao','tipo','vinculadoUsuarioId','estado','criado_em','criado_por'])",
            "posicao": {
              ".validate": "newData.hasChildren(['x','y']) && newData.child('x').isNumber() && newData.child('y').isNumber()"
            }
          }
        },
        "marcos": {
          "$marcoId": {
            ".read": "auth != null && root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid",
            ".write": "auth != null && root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid"
          }
        },
        "jogadores_ids": {
          "$uid": {
            ".write": "auth != null && auth.uid == $uid"
          }
        },
        "rolagens": {
          "$rollId": {
            ".write": "auth != null && (root.child('mesas').child($mesaId).child('jogadores_ids').child(auth.uid).exists() || root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid)",
            ".read": "auth != null && (root.child('mesas').child($mesaId).child('jogadores_ids').child(auth.uid).exists() || root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid)",
            ".validate": "newData.hasChildren(['autorId','tipo','dados','seed','resultadoDetalhado','resultadoFinal','timestamp'])"
          }
        },
        "intencoes": {
          "$jogadorId": {
            ".write": "auth != null && (auth.uid == $jogadorId || root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid)",
            ".read": "auth != null && (root.child('mesas').child($mesaId).child('jogadores_ids').child(auth.uid).exists() || root.child('mesas').child($mesaId).child('mestre_id').val() == auth.uid)"
          }
        }
      }
    },
    "fichas": {
      "$usuarioId": {
        ".read": "auth != null && (auth.uid == $usuarioId || root.child('mesas').child(auth.uid).exists() || true)",
        ".write": "auth != null && (auth.uid == $usuarioId || root.child('mesas').child(auth.uid).exists() || true)",
        ".validate": "newData.hasChildren(['usuarioId'])"
      }
    },
    "estado-temporario": {
      "$sessionId": {
        "logs": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}