// Modelo de simulação de decisão do PNIGP.
// Projeta o impacto de um plano de investimento (R$/habitante por área) sobre
// os índices (INVP, ICEB, IGP 360) e a posição no ranking.
//
// Modelo transparente (didático, não preditivo): investir numa área eleva seu
// desempenho com RETORNOS DECRESCENTES, limitado por um teto de referência.
// As áreas finalísticas (saúde, educação, segurança, social) movem o INVP;
// as estruturantes (fiscal, economia) movem o ICEB.

import type { AreaKey } from "./ui";

const TETO = 90; // teto de desempenho alcançável por área (0-100)
const TAU = 250; // R$/hab que rende ~63% do espaço de melhoria
const S_INVP = 0.45; // sensibilidade do INVP ao ganho finalístico
const S_ICEB = 0.35; // sensibilidade do ICEB ao ganho estruturante

const W_INVP: Partial<Record<AreaKey, number>> = {
  saude: 0.3,
  educacao: 0.3,
  seguranca: 0.2,
  social: 0.2,
};
const W_ICEB: Partial<Record<AreaKey, number>> = {
  fiscal: 0.5,
  economia: 0.5,
};

export type SimArea = { area: AreaKey; label: string; score: number };

export type SimInput = {
  areas: SimArea[];
  investPerCapita: Record<string, number>; // area -> R$/hab adicional
  indices: { iceb: number; invp: number; igp360: number };
  populacao: number;
  outrosIgp: number[]; // IGP 360 dos demais entes (para recalcular o ranking)
};

export type SimResult = {
  invp: number;
  iceb: number;
  igp360: number;
  dInvp: number;
  dIceb: number;
  dIgp: number;
  totalInvest: number;
  novaPos: number;
  deltasArea: Record<string, number>;
};

/** Plano sugerido: foca nas 2 áreas finalísticas mais fracas (R$300/hab cada). */
export function planoSugerido(areas: SimArea[]): Record<string, number> {
  const fin = areas
    .filter((a) => ["saude", "educacao", "seguranca", "social"].includes(a.area))
    .sort((x, y) => x.score - y.score)
    .slice(0, 2);
  return Object.fromEntries(fin.map((a) => [a.area, 300]));
}

export function simular(inp: SimInput): SimResult {
  const deltas: Record<string, number> = {};
  for (const a of inp.areas) {
    const inv = Math.max(0, inp.investPerCapita[a.area] ?? 0);
    const headroom = Math.max(0, TETO - a.score);
    deltas[a.area] = headroom * (1 - Math.exp(-inv / TAU));
  }

  let dInvp = 0;
  let dIceb = 0;
  for (const a of inp.areas) {
    dInvp += (W_INVP[a.area] ?? 0) * deltas[a.area];
    dIceb += (W_ICEB[a.area] ?? 0) * deltas[a.area];
  }
  dInvp *= S_INVP;
  dIceb *= S_ICEB;

  const invp = Math.min(100, inp.indices.invp + dInvp);
  const iceb = Math.min(100, inp.indices.iceb + dIceb);
  const igp360 = 0.5 * iceb + 0.5 * invp;

  const totalInvest =
    inp.areas.reduce((s, a) => s + Math.max(0, inp.investPerCapita[a.area] ?? 0), 0) *
    inp.populacao;

  const novaPos = 1 + inp.outrosIgp.filter((v) => v > igp360).length;

  return {
    invp,
    iceb,
    igp360,
    dInvp,
    dIceb,
    dIgp: igp360 - inp.indices.igp360,
    totalInvest,
    novaPos,
    deltasArea: deltas,
  };
}
