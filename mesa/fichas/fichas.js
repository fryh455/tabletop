// Exports: criarFicha, atualizarFicha, obterFicha
import { getDatabase, ref, set, update, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { calcularAtributosDerivados, aplicarModificador as aplicarModificadorNaFicha } from "./ficha-calculos.js";

const db = () => getDatabase();
const auth = () => getAuth();

/*
  Nota de esquema:
  - atributos esperados nas fichas: { QI, FOR, DEX, VIG } (siglas conforme spec)
  - campos adicionais: mental, dt_membros, hp_total, limite_inventario, criado_em, atualizado_em
*/

function validarNumero(v, fallback = 1) {
  return (typeof v === "number" && Number.isFinite(v)) ? Math.round(v) : fallback;
}

function aplicarLimitesAtributos(atributos) {
  // limites de jogo: min -2, max 6
  const limiteMin = -2;
  const limiteMax = 6;
  return {
    QI: Math.max(limiteMin, Math.min(limiteMax, validarNumero(atributos.QI, 1))),
    FOR: Math.max(limiteMin, Math.min(limiteMax, validarNumero(atributos.FOR, 1))),
    DEX: Math.max(limiteMin, Math.min(limiteMax, validarNumero(atributos.DEX, 1))),
    VIG: Math.max(limiteMin, Math.min(limiteMax, validarNumero(atributos.VIG, 1)))
  };
}

function aplicarAjustesPorRacaEProfissao(atributos, raca = null, profissao = null) {
  // [ASSUNÇÃO] raca/profissao fornecem um objeto com ajustes, ex: { QI:1, FOR:-1 }
  // A soma dos valores de raca não pode aumentar a soma total dos atributos (deve apenas rearranjar).
  // Implementamos: se raca.adjustSumForçar == true então redistribui sem aumentar soma.
  if (!raca && !profissao) return atributos;

  let result = { ...atributos };

  // aplicar raça (rearranjo sem aumentar soma total)
  if (raca && typeof raca === "object") {
    // se raca possui campo 'rearranjo' aplicamos substituição por soma original
    const sumBefore = result.QI + result.FOR + result.DEX + result.VIG;
    // apply direct deltas if present
    ["QI","FOR","DEX","VIG"].forEach(k => {
      if (typeof raca[k] === "number") result[k] = result[k] + raca[k];
    });
    // garantir que a soma não aumente: se aumentou, reduzir proporcionalmente
    const sumAfter = result.QI + result.FOR + result.DEX + result.VIG;
    if (sumAfter > sumBefore) {
      const excesso = sumAfter - sumBefore;
      // reduzir excesso do atributo com maior valor não abaixo de -2
      const keys = ["QI","FOR","DEX","VIG"].sort((a,b)=> result[b]-result[a]);
      let rem = excesso;
      for (const k of keys) {
        const canReduce = Math.max(0, result[k] - (-2));
        const take = Math.min(canReduce, rem);
        result[k] -= take;
        rem -= take;
        if (rem <= 0) break;
      }
    }
  }

  // aplicar profissao: profissao adiciona atributos base adicionais (ex: +2 em atributo principal)
  if (profissao && typeof profissao === "object") {
    ["QI","FOR","DEX","VIG"].forEach(k => {
      if (typeof profissao[k] === "number") result[k] = result[k] + profissao[k];
    });
  }

  return aplicarLimitesAtributos(result);
}

export async function criarFicha(usuarioId, dadosIniciais = {}) {
  const usuarioAtivo = auth().currentUser?.uid;
  if (!usuarioAtivo) throw new Error("Autenticação requerida");

  // dadosIniciais pode conter: atributos (parciais), raca, profissao, pontosDistribuir (4..7), distribuicao (obj)
  const pontosDistribuir = typeof dadosIniciais.pontosDistribuir === "number" ? Math.max(4, Math.min(7, dadosIniciais.pontosDistribuir)) : 5; // [ASSUNÇÃO] default 5
  const distribuicao = dadosIniciais.distribuicao || {}; // ex: { QI:2, FOR:1, DEX:1, VIG:1 }
  // iniciar atributos em 1 cada
  const base = { QI:1, FOR:1, DEX:1, VIG:1 };

  // aplicar distribuição informada (somente até pontosDistribuir)
  let totalDistribuido = 0;
  const target = { ...base };
  ["QI","FOR","DEX","VIG"].forEach(k=>{
    const add = validarNumero(distribuicao[k], 0);
    totalDistribuido += add;
    target[k] += add;
  });
  if (totalDistribuido > pontosDistribuir) {
    // se o usuário enviou mais do que permitido, truncar proporcionalmente
    // [ASSUNÇÃO] truncamos recusando extras: reduzimos extras da ordem QI,FOR,DEX,VIG
    let excesso = totalDistribuido - pontosDistribuir;
    const keys = ["QI","FOR","DEX","VIG"];
    for (const k of keys) {
      if (excesso <= 0) break;
      const canTake = Math.min(target[k] - 1, excesso);
      target[k] -= canTake;
      excesso -= canTake;
    }
  }

  // aplicar raça e profissão (se existirem)
  const atributosComRacaProf = aplicarAjustesPorRacaEProfissao(target, dadosIniciais.raca, dadosIniciais.profissao);

  // garantir limites
  const atributos = aplicarLimitesAtributos(atributosComRacaProf);

  // compor ficha com schema exigido
  const ficha = {
    usuarioId,
    nome: dadosIniciais.nome || null,
    idade: dadosIniciais.idade || null,
    peso: dadosIniciais.peso || null,
    altura: dadosIniciais.altura || null,
    atributos,
    mental: 0, // padrão
    itens: dadosIniciais.itens || {},
    vantagens: dadosIniciais.vantagens || {},
    atualizado_em: new Date().toISOString()
  };

  // calcular derivados e inserir
  const derivados = calcularAtributosDerivados(ficha);
  ficha.dt_membros = derivados.dt_membros;
  ficha.hp_total = derivados.hp_total;
  ficha.intencoes = derivados.intencoes;
  ficha.movimento = derivados.movimento;
  ficha.esquiva = derivados.esquiva;
  ficha.limite_inventario = derivados.limite_inventario;
  ficha.mental_estado = derivados.mental_estado_snapshot || 0;

  await set(ref(db(), `/fichas/${usuarioId}`), ficha);
  return { sucesso: true, ficha };
}

export async function atualizarFicha(usuarioId, patch) {
  const usuarioAtivo = auth().currentUser?.uid;
  if (!usuarioAtivo) throw new Error("Autenticação requerida");
  // se for o próprio usuário, permitir apenas campos não-críticos (definido em spec)
  if (usuarioAtivo === usuarioId) {
    const permitidos = ["nome", "idade", "peso", "altura", "itens", "vantagens", "mental"];
    const safePatch = {};
    Object.keys(patch).forEach(k => { if (permitidos.includes(k)) safePatch[k] = patch[k]; });
    // se patch altera atributos, bloquear — atributos só mudam por mestre ou NC7
    if (patch.atributos) throw new Error("Jogador não pode alterar atributos diretamente");
    await update(ref(db(), `/fichas/${usuarioId}`), { ...safePatch, atualizado_em: new Date().toISOString() });
    return { sucesso: true, atualizado: true };
  } else {
    // supõe-se mestre: ao alterar atributos, recalcular derivados automaticamente
    const currentSnap = await get(ref(db(), `/fichas/${usuarioId}`));
    const current = currentSnap.exists() ? currentSnap.val() : {};
    const novo = { ...current, ...patch, atualizado_em: new Date().toISOString() };
    if (patch.atributos) {
      // aplicar limites
      novo.atributos = aplicarLimitesAtributos(patch.atributos);
    }
    // recalcular derivados
    const derivados = calcularAtributosDerivados(novo);
    novo.dt_membros = derivados.dt_membros;
    novo.hp_total = derivados.hp_total;
    novo.intencoes = derivados.intencoes;
    novo.movimento = derivados.movimento;
    novo.esquiva = derivados.esquiva;
    novo.limite_inventario = derivados.limite_inventario;
    await update(ref(db(), `/fichas/${usuarioId}`), novo);
    return { sucesso: true, atualizado: true };
  }
}

export async function obterFicha(usuarioId) {
  const snap = await get(ref(db(), `/fichas/${usuarioId}`));
  return snap.exists() ? snap.val() : null;
}
