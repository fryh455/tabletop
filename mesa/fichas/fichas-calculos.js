// Exports required by spec: calcularAtributosDerivados, calcularDT, aplicarModificador
// Extended: also provide helper functions used by criarFicha

// All functions are pure where indicated.

export function calcularDT(NC) {
  // DT base para testes de ativação de vantagem conforme NC (pure function)
  // Implementação baseada nas regras descritas:
  // NC1 => 9
  // NC2 => 8 (reduz 1)
  // NC3 => 7 (reduz 1)
  // NC4 => 5 (reduz 2)
  // NC5 => 3 (reduz 2)
  // NC6 => 2 (reduz 1)
  // NC7 => 0 (vantagem deixa de falhar)
  const n = Number(NC) || 1;
  if (n <= 1) return 9;
  if (n === 2) return 8;
  if (n === 3) return 7;
  if (n === 4) return 5;
  if (n === 5) return 3;
  if (n === 6) return 2;
  if (n >= 7) return 0;
  return 9;
}

export function calcularAtributosDerivados(ficha) {
  // Pure function: recebe ficha com ficha.atributos.{QI,FOR,DEX,VIG} e ficha.mental (opcional)
  const attrs = (ficha && ficha.atributos) ? ficha.atributos : { QI:1, FOR:1, DEX:1, VIG:1 };
  const QI = Number(attrs.QI || 1);
  const FOR = Number(attrs.FOR || 1);
  const DEX = Number(attrs.DEX || 1);
  const VIG = Number(attrs.VIG || 1);
  const mental = Number((ficha && typeof ficha.mental !== "undefined") ? ficha.mental : 0);

  // INTENÇÕES: (VIG + DEX + 1)/2 -> number of actions per turn; arredondar para baixo
  const intencoesRaw = (VIG + DEX + 1) / 2;
  const intencoes = Math.floor(intencoesRaw);

  // MOVIMENTO: DEX + 3 (metros por intenção)
  const movimento = DEX + 3;

  // ESQUIVA: DEX * 2
  const esquiva = DEX * 2;

  // MENTAL: aplicar efeitos de acordo com intervalos (retornar snapshot de efeitos)
  const mentalEstado = mental;
  const mentalEfeitos = {
    recupDadoHP: 0, // quantos dados extras ao descansar
    dadosHPBonus: 0, // +X para todos os dados
    reduzirDT: 0, // redução de DT enquanto estiver com esse valor
    impossibilitadoVantagens: false,
    danoConstantePorIntencao: 0
  };
  if (mentalEstado >= 1 && mentalEstado <= 3) {
    mentalEfeitos.recupDadoHP = 1;
  }
  if (mentalEstado >= 4 && mentalEstado <= 4) {
    mentalEfeitos.dadosHPBonus = 5;
  }
  if (mentalEstado >= 5) {
    mentalEfeitos.reduzirDT = 3;
  }
  if (mentalEstado <= -8 && mentalEstado >= -9) {
    mentalEfeitos.dadosHPBonus = -5; // penalidade nos dados
  }
  if (mentalEstado <= -10 && mentalEstado >= -11) {
    mentalEfeitos.impossibilitadoVantagens = true;
  }
  if (mentalEstado <= -12) {
    mentalEfeitos.impossibilitadoVantagens = true;
    mentalEfeitos.danoConstantePorIntencao = 5;
  }

  // DTs dos membros:
  // DT cabeça = (VIG + 3) * 4;
  // DT torso = (VIG + FOR + 3) * 4;
  // DT braço = (VIG + 3) * 3;
  // DT perna = (VIG + 3) * 3.
  const dtCabeca = (VIG + 3) * 4;
  const dtBraco = (VIG + 3) * 3;
  const dtPerna = (VIG + 3) * 3;
  const dtTorso = (VIG + FOR + 3) * 4;

  // HP total = soma das DTs de todos os membros * 4.
  const somaDTs = dtCabeca + dtTorso + dtBraco + dtPerna;
  const hpTotal = somaDTs * 4;

  // Inventário: Limite (FOR + VIG) * 4 kg
  const limiteInventario = (FOR + VIG) * 4;

  // aplicar efeitos de mental que afetam dados (retornar também snapshot para guardar)
  const mental_snapshot = {
    mentalValor: mentalEstado,
    efeitos: mentalEfeitos
  };

  return {
    intencoes,
    movimento,
    esquiva,
    dt_membros: {
      cabeca: dtCabeca,
      torso: dtTorso,
      braco: dtBraco,
      perna: dtPerna
    },
    hp_total: hpTotal,
    limite_inventario: limiteInventario,
    mental_estado_snapshot: mental_snapshot
  };
}

export function aplicarModificador(ficha, modificador) {
  // Pure function that returns a new ficha object with modificador applied.
  // modificador pode ser { tipo: 'atributo'|'temporal'|'permanente', campo: 'FOR'|'VIG'..., delta, duracao }
  const novo = JSON.parse(JSON.stringify(ficha || {}));
  if (!modificador || !modificador.campo) return novo;

  // Se modifica atributo principal
  if (!novo.atributos) novo.atributos = { QI:1, FOR:1, DEX:1, VIG:1 };
  const campo = modificador.campo;
  const delta = Number(modificador.delta || 0);

  if (["QI","FOR","DEX","VIG"].includes(campo)) {
    novo.atributos[campo] = Number((novo.atributos[campo] || 0)) + delta;
    // aplicar limites de jogo: -2 .. 6
    novo.atributos[campo] = Math.max(-2, Math.min(6, Math.round(novo.atributos[campo])));
    // recalcular derivados
    const derivados = calcularAtributosDerivados(novo);
    novo.dt_membros = derivados.dt_membros;
    novo.hp_total = derivados.hp_total;
    novo.intencoes = derivados.intencoes;
    novo.movimento = derivados.movimento;
    novo.esquiva = derivados.esquiva;
    novo.limite_inventario = derivados.limite_inventario;
  } else if (campo === "mental") {
    novo.mental = Number((novo.mental || 0)) + delta;
    // mental can go below -12; effects applied elsewhere
  } else {
    // outros campos: aplicar diretamente
    novo[campo] = modificador.valor ?? (novo[campo] + delta);
  }

  return novo;
}

/* Funções utilitárias para resolução de dano conforme especificação */

export function calcularDanoAplicadoAoMembro(valorDado, modificadores = 0, membroDT) {
  // valor d12 + modificadores = ST (soma total).
  // critico natural (12 no dado) add 50% do total final.
  // Aqui valorDado representa resultado do dado (1..12)
  let st = Number(valorDado || 0) + Number(modificadores || 0);
  let critico = (valorDado === 12);
  if (critico) {
    st = Math.round(st + Math.floor(st * 0.5));
  }
  // now determine damage and state
  if (st <= membroDT) {
    return { damage: st, estado: "completo", efeito: "dano aplicado igual ST" };
  } else if (st > membroDT && st < 3 * membroDT) {
    // dano dobrado e membro fica muito danificado
    return { damage: st * 2, estado: "muito danificado", efeito: "dano dobrado" };
  } else {
    // st >= 3*DT -> inutilizado
    return { damage: st * 3, estado: "inutilizado", efeito: "inutilizado imediatamente" };
  }
}

/* Exportação final obrigatória */
/* Já exportamos calcularAtributosDerivados, calcularDT, aplicarModificador acima via export function */

