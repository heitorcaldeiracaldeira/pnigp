import "server-only";
import { query } from "./db";
import { fetchComprasPNCP } from "./pncp";
import { grupoFnde } from "./fnde-grupos";
import { fetchTransferenciasPortal, temChavePortal, type TransferenciasSC } from "./transferegov";

export const ANO_ATUAL = 2024;
export const ANO_BASE = 2022; // linha de base do PPA (2022–2025)
export const ANO_ANTERIOR = 2023;

export type Municipio = {
  id: number;
  codigo_ibge: string;
  nome: string;
  uf: string;
  regiao: string;
  populacao: number;
  porte: string;
  prefeito: string | null;
  pib_per_capita: number;
};

export type Indices = {
  ano: number;
  iceb: number;
  invp: number;
  igp360: number;
  cap_planejamento: number;
  cap_fiscal: number;
  cap_gestao: number;
  cap_transparencia: number;
};

export type IndicadorRow = {
  codigo: string;
  nome: string;
  area: string;
  unidade: string;
  fonte: string;
  direcao_melhor: "alta" | "baixa";
  valor: number;
  valor_anterior: number | null;
  media: number;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function getMunicipios(): Promise<Municipio[]> {
  const rows = await query<Municipio>(
    `SELECT id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito,
            pib_per_capita::float AS pib_per_capita
     FROM municipios ORDER BY nome`,
  );
  return rows.map((m) => ({ ...m, pib_per_capita: num(m.pib_per_capita) }));
}

export async function getMunicipio(codigo: string): Promise<Municipio | null> {
  const rows = await query<Municipio>(
    `SELECT id, codigo_ibge, nome, uf, regiao, populacao, porte, prefeito,
            pib_per_capita::float AS pib_per_capita
     FROM municipios WHERE codigo_ibge = $1`,
    [codigo],
  );
  if (!rows[0]) return null;
  return { ...rows[0], pib_per_capita: num(rows[0].pib_per_capita) };
}

export async function getIndicesSerie(municipioId: number): Promise<Indices[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao, cap_transparencia
     FROM indices_pnigp WHERE municipio_id = $1 ORDER BY ano`,
    [municipioId],
  );
  return rows.map((r) => ({
    ano: num(r.ano),
    iceb: num(r.iceb),
    invp: num(r.invp),
    igp360: num(r.igp360),
    cap_planejamento: num(r.cap_planejamento),
    cap_fiscal: num(r.cap_fiscal),
    cap_gestao: num(r.cap_gestao),
    cap_transparencia: num(r.cap_transparencia),
  }));
}

/** Indicadores do ano atual com valor anterior e média do mesmo porte (benchmark). */
export async function getIndicadores(
  municipioId: number,
  porte: string,
): Promise<IndicadorRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, i.nome, i.area, i.unidade, i.fonte, i.direcao_melhor,
            atual.valor                                   AS valor,
            ant.valor                                     AS valor_anterior,
            (SELECT AVG(v.valor)
               FROM indicador_valores v
               JOIN municipios m ON m.id = v.municipio_id
              WHERE v.indicador_id = i.id AND v.ano = $2 AND m.porte = $3) AS media
       FROM indicadores i
       JOIN indicador_valores atual
         ON atual.indicador_id = i.id AND atual.municipio_id = $1 AND atual.ano = $2
       LEFT JOIN indicador_valores ant
         ON ant.indicador_id = i.id AND ant.municipio_id = $1 AND ant.ano = $4
      ORDER BY i.area, i.nome`,
    [municipioId, ANO_ATUAL, porte, ANO_ANTERIOR],
  );
  return rows.map((r) => ({
    codigo: String(r.codigo),
    nome: String(r.nome),
    area: String(r.area),
    unidade: String(r.unidade),
    fonte: String(r.fonte),
    direcao_melhor: r.direcao_melhor as "alta" | "baixa",
    valor: num(r.valor),
    valor_anterior: r.valor_anterior == null ? null : num(r.valor_anterior),
    media: num(r.media),
  }));
}

export type RankingRow = {
  posicao: number;
  codigo_ibge: string;
  nome: string;
  uf: string;
  porte: string;
  igp360: number;
  iceb: number;
  invp: number;
};

export async function getRanking(): Promise<RankingRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT m.codigo_ibge, m.nome, m.uf, m.porte, ip.igp360, ip.iceb, ip.invp,
            RANK() OVER (ORDER BY ip.igp360 DESC) AS posicao
       FROM indices_pnigp ip
       JOIN municipios m ON m.id = ip.municipio_id
      WHERE ip.ano = $1
      ORDER BY ip.igp360 DESC`,
    [ANO_ATUAL],
  );
  return rows.map((r) => ({
    posicao: num(r.posicao),
    codigo_ibge: String(r.codigo_ibge),
    nome: String(r.nome),
    uf: String(r.uf),
    porte: String(r.porte),
    igp360: num(r.igp360),
    iceb: num(r.iceb),
    invp: num(r.invp),
  }));
}

export type Meta = {
  codigo: string;
  nome: string;
  area: string;
  unidade: string;
  direcao_melhor: "alta" | "baixa";
  valor_atual: number;
  valor_alvo: number;
  valor_base: number;
  ano_alvo: number;
  descricao: string;
};

export async function getMetas(municipioId: number): Promise<Meta[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, i.nome, i.area, i.unidade, i.direcao_melhor,
            mt.valor_alvo, mt.ano_alvo, mt.descricao,
            atual.valor AS valor_atual,
            base.valor  AS valor_base
       FROM metas mt
       JOIN indicadores i ON i.id = mt.indicador_id
       JOIN indicador_valores atual
         ON atual.indicador_id = i.id AND atual.municipio_id = mt.municipio_id AND atual.ano = $2
       JOIN indicador_valores base
         ON base.indicador_id = i.id AND base.municipio_id = mt.municipio_id AND base.ano = $3
      WHERE mt.municipio_id = $1
      ORDER BY i.area`,
    [municipioId, ANO_ATUAL, ANO_BASE],
  );
  return rows.map((r) => ({
    codigo: String(r.codigo),
    nome: String(r.nome),
    area: String(r.area),
    unidade: String(r.unidade),
    direcao_melhor: r.direcao_melhor as "alta" | "baixa",
    valor_atual: num(r.valor_atual),
    valor_alvo: num(r.valor_alvo),
    valor_base: num(r.valor_base),
    ano_alvo: num(r.ano_alvo),
    descricao: String(r.descricao),
  }));
}

/* ====================== CONTRATAÇÕES (PNCP) ================================ */

export type Contratacao = {
  id: number;
  numero: string;
  objeto: string;
  orgao: string;
  modalidade: string;
  valor_estimado: number;
  valor_contratado: number;
  economia_pct: number;
  fornecedor: string;
  data: string;
  situacao: string;
};

export async function getContratacoes(tipo: "M" | "E", id: number): Promise<Contratacao[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, numero, objeto, orgao, modalidade,
            valor_estimado::float   AS valor_estimado,
            valor_contratado::float AS valor_contratado,
            economia_pct::float     AS economia_pct,
            fornecedor,
            to_char(data, 'DD/MM/YYYY') AS data,
            situacao
       FROM contratacoes
      WHERE ente_tipo = $1 AND ente_id = $2
      ORDER BY valor_contratado DESC`,
    [tipo, id],
  );
  return rows.map((r) => ({
    id: num(r.id),
    numero: String(r.numero),
    objeto: String(r.objeto),
    orgao: String(r.orgao),
    modalidade: String(r.modalidade),
    valor_estimado: num(r.valor_estimado),
    valor_contratado: num(r.valor_contratado),
    economia_pct: num(r.economia_pct),
    fornecedor: String(r.fornecedor),
    data: String(r.data),
    situacao: String(r.situacao),
  }));
}

/* ====================== FINANÇAS (SICONFI/FINBRA) ========================== */

export type Financas = {
  ano: number;
  receita_total: number;
  rec_tributaria: number;
  rec_transferencias: number;
  rec_outras: number;
  despesa_total: number;
  desp_pessoal: number;
  desp_custeio: number;
  desp_investimento: number;
  desp_divida: number;
  func_saude: number;
  func_educacao: number;
  func_seguranca: number;
  func_assistencia: number;
  func_infraestrutura: number;
  func_administracao: number;
  func_outras: number;
};

const FIN_COLS = [
  "receita_total", "rec_tributaria", "rec_transferencias", "rec_outras",
  "despesa_total", "desp_pessoal", "desp_custeio", "desp_investimento", "desp_divida",
  "func_saude", "func_educacao", "func_seguranca", "func_assistencia",
  "func_infraestrutura", "func_administracao", "func_outras",
];

export async function getFinancas(
  tipo: "M" | "E",
  id: number,
): Promise<{ atual: Financas | null; anterior: Financas | null }> {
  const sel = FIN_COLS.map((c) => `${c}::float AS ${c}`).join(", ");
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, ${sel} FROM financas WHERE ente_tipo = $1 AND ente_id = $2 ORDER BY ano DESC`,
    [tipo, id],
  );
  const map = (r: Record<string, unknown>): Financas => {
    const o = { ano: num(r.ano) } as Financas;
    for (const c of FIN_COLS) (o as unknown as Record<string, number>)[c] = num(r[c]);
    return o;
  };
  return { atual: rows[0] ? map(rows[0]) : null, anterior: rows[1] ? map(rows[1]) : null };
}

/* ====================== COMPRAS PÚBLICAS (PNCP) ============================ */

export type Compras = {
  ano: number;
  valor_contratado_pc: number;
  pct_pregao_eletronico: number;
  pct_dispensa: number;
  economia_pregao: number;
  fornecedores_mil: number;
  prazo_medio_dias: number;
  pct_mpe: number;
  transparencia_pncp: number;
};

export async function getCompras(
  tipo: "M" | "E",
  id: number,
): Promise<{ atual: Compras | null; anterior: Compras | null }> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano,
            valor_contratado_pc::float   AS v,
            pct_pregao_eletronico::float AS p,
            pct_dispensa::float          AS d,
            economia_pregao::float       AS e,
            fornecedores_mil::float      AS f,
            prazo_medio_dias::float      AS pz,
            pct_mpe::float               AS mpe,
            transparencia_pncp::float    AS t
       FROM compras_publicas
      WHERE ente_tipo = $1 AND ente_id = $2
      ORDER BY ano DESC`,
    [tipo, id],
  );
  const map = (r: Record<string, unknown>): Compras => ({
    ano: num(r.ano),
    valor_contratado_pc: num(r.v),
    pct_pregao_eletronico: num(r.p),
    pct_dispensa: num(r.d),
    economia_pregao: num(r.e),
    fornecedores_mil: num(r.f),
    prazo_medio_dias: num(r.pz),
    pct_mpe: num(r.mpe),
    transparencia_pncp: num(r.t),
  });
  return { atual: rows[0] ? map(rows[0]) : null, anterior: rows[1] ? map(rows[1]) : null };
}

/** Série histórica completa por indicador (codigo -> valores por ano, asc). */
export async function getHistoricoIndicadores(
  municipioId: number,
): Promise<Record<string, { ano: number; valor: number }[]>> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, v.ano, v.valor
       FROM indicador_valores v
       JOIN indicadores i ON i.id = v.indicador_id
      WHERE v.municipio_id = $1
      ORDER BY i.codigo, v.ano`,
    [municipioId],
  );
  const out: Record<string, { ano: number; valor: number }[]> = {};
  for (const r of rows) {
    const cod = String(r.codigo);
    (out[cod] ??= []).push({ ano: num(r.ano), valor: num(r.valor) });
  }
  return out;
}

/* ====================== ESTADOS (Painel do Governador) ===================== */

export type Estado = {
  id: number;
  uf: string;
  nome: string;
  regiao: string;
  populacao: number;
  capital: string;
  governador: string | null;
  pib_per_capita: number;
};

export async function getEstados(): Promise<Estado[]> {
  const rows = await query<Estado>(
    `SELECT id, uf, nome, regiao, populacao, capital, governador,
            pib_per_capita::float AS pib_per_capita
     FROM estados ORDER BY nome`,
  );
  return rows.map((e) => ({ ...e, pib_per_capita: num(e.pib_per_capita) }));
}

export async function getEstado(uf: string): Promise<Estado | null> {
  const rows = await query<Estado>(
    `SELECT id, uf, nome, regiao, populacao, capital, governador,
            pib_per_capita::float AS pib_per_capita
     FROM estados WHERE uf = $1`,
    [uf.toUpperCase()],
  );
  if (!rows[0]) return null;
  return { ...rows[0], pib_per_capita: num(rows[0].pib_per_capita) };
}

export async function getIndicesSerieEstado(estadoId: number): Promise<Indices[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, iceb, invp, igp360, cap_planejamento, cap_fiscal, cap_gestao, cap_transparencia
     FROM indices_pnigp_estados WHERE estado_id = $1 ORDER BY ano`,
    [estadoId],
  );
  return rows.map((r) => ({
    ano: num(r.ano),
    iceb: num(r.iceb),
    invp: num(r.invp),
    igp360: num(r.igp360),
    cap_planejamento: num(r.cap_planejamento),
    cap_fiscal: num(r.cap_fiscal),
    cap_gestao: num(r.cap_gestao),
    cap_transparencia: num(r.cap_transparencia),
  }));
}

/** Indicadores estaduais com valor anterior e média da região (benchmark). */
export async function getIndicadoresEstado(
  estadoId: number,
  regiao: string,
): Promise<IndicadorRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, i.nome, i.area, i.unidade, i.fonte, i.direcao_melhor,
            atual.valor AS valor,
            ant.valor   AS valor_anterior,
            (SELECT AVG(v.valor)
               FROM estado_indicador_valores v
               JOIN estados e ON e.id = v.estado_id
              WHERE v.indicador_id = i.id AND v.ano = $2 AND e.regiao = $3) AS media
       FROM indicadores i
       JOIN estado_indicador_valores atual
         ON atual.indicador_id = i.id AND atual.estado_id = $1 AND atual.ano = $2
       LEFT JOIN estado_indicador_valores ant
         ON ant.indicador_id = i.id AND ant.estado_id = $1 AND ant.ano = $4
      ORDER BY i.area, i.nome`,
    [estadoId, ANO_ATUAL, regiao, ANO_ANTERIOR],
  );
  return rows.map((r) => ({
    codigo: String(r.codigo),
    nome: String(r.nome),
    area: String(r.area),
    unidade: String(r.unidade),
    fonte: String(r.fonte),
    direcao_melhor: r.direcao_melhor as "alta" | "baixa",
    valor: num(r.valor),
    valor_anterior: r.valor_anterior == null ? null : num(r.valor_anterior),
    media: num(r.media),
  }));
}

export type RankingEstadoRow = {
  posicao: number;
  uf: string;
  nome: string;
  regiao: string;
  igp360: number;
  iceb: number;
  invp: number;
};

export async function getRankingEstados(): Promise<RankingEstadoRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT e.uf, e.nome, e.regiao, ip.igp360, ip.iceb, ip.invp,
            RANK() OVER (ORDER BY ip.igp360 DESC) AS posicao
       FROM indices_pnigp_estados ip
       JOIN estados e ON e.id = ip.estado_id
      WHERE ip.ano = $1
      ORDER BY ip.igp360 DESC`,
    [ANO_ATUAL],
  );
  return rows.map((r) => ({
    posicao: num(r.posicao),
    uf: String(r.uf),
    nome: String(r.nome),
    regiao: String(r.regiao),
    igp360: num(r.igp360),
    iceb: num(r.iceb),
    invp: num(r.invp),
  }));
}

export async function getMetasEstado(estadoId: number): Promise<Meta[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, i.nome, i.area, i.unidade, i.direcao_melhor,
            mt.valor_alvo, mt.ano_alvo, mt.descricao,
            atual.valor AS valor_atual,
            base.valor  AS valor_base
       FROM metas_estados mt
       JOIN indicadores i ON i.id = mt.indicador_id
       JOIN estado_indicador_valores atual
         ON atual.indicador_id = i.id AND atual.estado_id = mt.estado_id AND atual.ano = $2
       JOIN estado_indicador_valores base
         ON base.indicador_id = i.id AND base.estado_id = mt.estado_id AND base.ano = $3
      WHERE mt.estado_id = $1
      ORDER BY i.area`,
    [estadoId, ANO_ATUAL, ANO_BASE],
  );
  return rows.map((r) => ({
    codigo: String(r.codigo),
    nome: String(r.nome),
    area: String(r.area),
    unidade: String(r.unidade),
    direcao_melhor: r.direcao_melhor as "alta" | "baixa",
    valor_atual: num(r.valor_atual),
    valor_alvo: num(r.valor_alvo),
    valor_base: num(r.valor_base),
    ano_alvo: num(r.ano_alvo),
    descricao: String(r.descricao),
  }));
}

export async function getHistoricoIndicadoresEstado(
  estadoId: number,
): Promise<Record<string, { ano: number; valor: number }[]>> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.codigo, v.ano, v.valor
       FROM estado_indicador_valores v
       JOIN indicadores i ON i.id = v.indicador_id
      WHERE v.estado_id = $1
      ORDER BY i.codigo, v.ano`,
    [estadoId],
  );
  const out: Record<string, { ano: number; valor: number }[]> = {};
  for (const r of rows) {
    const cod = String(r.codigo);
    (out[cod] ??= []).push({ ano: num(r.ano), valor: num(r.valor) });
  }
  return out;
}

/* ====================== DADOS OFICIAIS — SANTA CATARINA (SICONFI) ============ */

export const FONTE_SICONFI =
  "SICONFI / Tesouro Nacional (RREO 6º bimestre) — base oficial usada pelo TCE/SC";

export type EnteSC = { cod_ibge: string; nome: string; tipo: "M" | "E"; populacao: number };
export type FuncaoSC = { nome: string; dotacao: number; empenhado: number; filhos?: FuncaoSC[] };
export type ReceitaSC = { nome: string; previsto: number; arrecadado: number; filhos?: ReceitaSC[] };
export type FinancaSCAno = {
  ano: number;
  receita: number; receita_prevista: number; tributaria: number; transferencias: number; outras: number;
  despesa: number; resultado: number; pessoal: number; custeio: number; investimento: number; divida: number;
  saude: number; educacao: number; seguranca: number; assistencia: number; infraestrutura: number; administracao: number;
};

export async function getEntesSC(): Promise<EnteSC[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT cod_ibge, nome, tipo, populacao FROM entes_sc ORDER BY (tipo = 'E') DESC, nome`,
  );
  return rows.map((r) => ({ cod_ibge: String(r.cod_ibge), nome: String(r.nome), tipo: r.tipo as "M" | "E", populacao: num(r.populacao) }));
}

export async function getFinancasSC(
  cod: string,
): Promise<{ ente: EnteSC; serie: FinancaSCAno[]; funcoesLatest: FuncaoSC[]; receitasLatest: ReceitaSC[] } | null> {
  const er = await query<Record<string, unknown>>(`SELECT cod_ibge, nome, tipo, populacao FROM entes_sc WHERE cod_ibge = $1`, [cod]);
  if (!er.length) return null;
  const ente: EnteSC = { cod_ibge: String(er[0].cod_ibge), nome: String(er[0].nome), tipo: er[0].tipo as "M" | "E", populacao: num(er[0].populacao) };
  const rows = await query<Record<string, unknown>>(`SELECT * FROM financas_sc WHERE cod_ibge = $1 AND suspeito IS NOT TRUE ORDER BY ano`, [cod]);
  const serie: FinancaSCAno[] = rows.map((r) => ({
    ano: num(r.ano), receita: num(r.receita), receita_prevista: num(r.receita_prevista), tributaria: num(r.tributaria),
    transferencias: num(r.transferencias), outras: num(r.outras), despesa: num(r.despesa), resultado: num(r.resultado),
    pessoal: num(r.pessoal), custeio: num(r.custeio), investimento: num(r.investimento), divida: num(r.divida),
    saude: num(r.saude), educacao: num(r.educacao), seguranca: num(r.seguranca), assistencia: num(r.assistencia),
    infraestrutura: num(r.infraestrutura), administracao: num(r.administracao),
  }));
  const last = rows[rows.length - 1];
  const funcoesLatest = last && Array.isArray(last.funcoes) ? (last.funcoes as FuncaoSC[]) : [];
  const receitasLatest = last && Array.isArray(last.receitas) ? (last.receitas as ReceitaSC[]) : [];
  return { ente, serie, funcoesLatest, receitasLatest };
}

export type ComprasSC = {
  n_contratos: number; valor_estimado: number; valor_homologado: number;
  economia_pct: number; dispensa_pct: number;
  por_modalidade: { modalidade: string; n: number; valor: number }[];
  top: { objeto: string; modalidade: string; orgao: string; estimado: number; homologado: number; economia_pct: number | null; data: string; cnpj?: string; ano?: number; seq?: number }[];
};

export async function getComprasSC(cod: string): Promise<ComprasSC | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT n_contratos, valor_estimado, valor_homologado, economia_pct, dispensa_pct, por_modalidade, top
       FROM compras_sc WHERE cod_ibge = $1 ORDER BY ano DESC LIMIT 1`,
    [cod],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    n_contratos: num(r.n_contratos), valor_estimado: num(r.valor_estimado), valor_homologado: num(r.valor_homologado),
    economia_pct: num(r.economia_pct), dispensa_pct: num(r.dispensa_pct),
    por_modalidade: Array.isArray(r.por_modalidade) ? (r.por_modalidade as ComprasSC["por_modalidade"]) : [],
    top: Array.isArray(r.top) ? (r.top as ComprasSC["top"]) : [],
  };
}

/** Compras do ente: usa o cache (compras_sc); se não houver, busca no PNCP e grava (write-through). */
export async function getOrFetchComprasSC(cod: string): Promise<ComprasSC | null> {
  const cached = await getComprasSC(cod);
  if (cached) return cached;
  const er = await query<Record<string, unknown>>(`SELECT tipo FROM entes_sc WHERE cod_ibge = $1`, [cod]);
  if (!er.length) return null;
  const tipo = er[0].tipo as "M" | "E";
  const d = await fetchComprasPNCP(cod, tipo);
  if (d.n_contratos === 0) return d; // não cacheia vazio (pode ter sido rate limit) — tenta de novo na próxima
  await query(
    `INSERT INTO compras_sc (cod_ibge,ano,n_contratos,valor_estimado,valor_homologado,economia_pct,dispensa_pct,por_modalidade,top)
     VALUES ($1,2024,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (cod_ibge,ano) DO UPDATE SET n_contratos=EXCLUDED.n_contratos,valor_estimado=EXCLUDED.valor_estimado,valor_homologado=EXCLUDED.valor_homologado,economia_pct=EXCLUDED.economia_pct,dispensa_pct=EXCLUDED.dispensa_pct,por_modalidade=EXCLUDED.por_modalidade,top=EXCLUDED.top`,
    [cod, d.n_contratos, d.valor_estimado, d.valor_homologado, d.economia_pct, d.dispensa_pct, JSON.stringify(d.por_modalidade), JSON.stringify(d.top)],
  );
  return d;
}

export type ComprasAno = { ano: number; n_contratos: number; valor_homologado: number; economia_pct: number; dispensa_pct: number };

/** Série de compras por ano (todos os anos já no banco para o ente). */
export async function getComprasSerieSC(cod: string): Promise<ComprasAno[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, n_contratos, valor_homologado, economia_pct, dispensa_pct
       FROM compras_sc WHERE cod_ibge = $1 AND n_contratos > 0 ORDER BY ano`,
    [cod],
  );
  return rows.map((r) => ({
    ano: num(r.ano), n_contratos: num(r.n_contratos), valor_homologado: num(r.valor_homologado),
    economia_pct: num(r.economia_pct), dispensa_pct: num(r.dispensa_pct),
  }));
}

/** Compras do ente: garante o ano corrente (on-demand) e devolve detalhe do último ano + a série. */
export async function getComprasComEvolucao(cod: string): Promise<{ latest: ComprasSC | null; serie: ComprasAno[] }> {
  const latest = await getOrFetchComprasSC(cod);
  const serie = await getComprasSerieSC(cod);
  return { latest, serie };
}

/* ========= TRANSFERÊNCIAS DA UNIÃO / CONVÊNIOS (Transferegov via Portal da Transparência) ===== */

export async function getTransferenciasSC(cod: string): Promise<TransferenciasSC | null> {
  const rows = await query<Record<string, unknown>>(`SELECT * FROM transferencias_sc WHERE cod_ibge = $1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    n_instrumentos: num(r.n_instrumentos), valor_total: num(r.valor_total), valor_liberado: num(r.valor_liberado),
    por_situacao: Array.isArray(r.por_situacao) ? (r.por_situacao as TransferenciasSC["por_situacao"]) : [],
    por_orgao: Array.isArray(r.por_orgao) ? (r.por_orgao as TransferenciasSC["por_orgao"]) : [],
    por_ano: Array.isArray(r.por_ano) ? (r.por_ano as TransferenciasSC["por_ano"]) : [],
    top: Array.isArray(r.top) ? (r.top as TransferenciasSC["top"]) : [],
  };
}

/** Usa cache (transferencias_sc); se vazio e houver chave do Portal, busca e grava. */
export async function getOrFetchTransferenciasSC(cod: string): Promise<TransferenciasSC | null> {
  const cached = await getTransferenciasSC(cod);
  if (cached) return cached;
  if (!temChavePortal()) return null; // sem chave → seção fica oculta
  const d = await fetchTransferenciasPortal(cod);
  if (!d || d.n_instrumentos === 0) return d;
  await query(
    `INSERT INTO transferencias_sc (cod_ibge,n_instrumentos,valor_total,valor_liberado,por_situacao,por_orgao,por_ano,top)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (cod_ibge) DO UPDATE SET n_instrumentos=EXCLUDED.n_instrumentos,valor_total=EXCLUDED.valor_total,valor_liberado=EXCLUDED.valor_liberado,por_situacao=EXCLUDED.por_situacao,por_orgao=EXCLUDED.por_orgao,por_ano=EXCLUDED.por_ano,top=EXCLUDED.top`,
    [cod, d.n_instrumentos, d.valor_total, d.valor_liberado, JSON.stringify(d.por_situacao), JSON.stringify(d.por_orgao), JSON.stringify(d.por_ano), JSON.stringify(d.top)],
  );
  return d;
}

/* ===== CONTRATOS assinados (PNCP /contratos) conectados ao processo licitatório ===== */

export type ContratoProcesso = { fornecedor: string; ni: string; valor: number; vigInicio: string | null; vigFim: string | null; assinatura: string | null; objeto: string };

export async function getContratosDoProcesso(cnpj: string, ano: number, seq: number): Promise<ContratoProcesso[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT fornecedor, ni_fornecedor, valor_global,
            to_char(vig_inicio,'DD/MM/YYYY') AS vig_inicio,
            to_char(vig_fim,'DD/MM/YYYY')    AS vig_fim,
            to_char(assinatura,'DD/MM/YYYY') AS assinatura, objeto
       FROM contratos_sc WHERE cnpj_compra=$1 AND ano_compra=$2 AND seq_compra=$3
      ORDER BY valor_global DESC NULLS LAST`,
    [cnpj, ano, seq],
  ).catch(() => []);
  return rows.map((r) => ({
    fornecedor: String(r.fornecedor || "—"), ni: String(r.ni_fornecedor || ""),
    valor: num(r.valor_global),
    vigInicio: r.vig_inicio ? String(r.vig_inicio) : null, vigFim: r.vig_fim ? String(r.vig_fim) : null,
    assinatura: r.assinatura ? String(r.assinatura) : null, objeto: String(r.objeto || ""),
  }));
}

export type ContratosResumoSC = {
  n: number; valor_total: number;
  por_fornecedor: { nome: string; ni: string; n: number; valor: number; uf: string | null; municipio: string | null; empenhado: number; nfs: number; situacao: string | null }[];
  top: { objeto: string; fornecedor: string; valor: number; vigInicio: string | null; vigFim: string | null; assinatura: string | null }[];
  localidade: { scPct: number; foraPct: number; resolvidoPct: number; topUF: { uf: string; valor: number }[] } | null;
  execucao: { empenhoTotal: number; nfTotal: number } | null; // contadores; 0 enquanto SC não publica o ciclo
};

// PANORAMA estadual de compras — para onde vai o dinheiro (destino dos fornecedores) + categorias (CNAE)
export type ComprasDestinosSC = {
  totalResolvido: number; scValor: number; foraValor: number; coberturaPct: number;
  destinos: { municipio: string; uf: string; valor: number; fornecedores: number }[];
  categorias: { cnae: string; valor: number; fornecedores: number }[];
} | null;
export async function getComprasDestinosSC(cod?: string): Promise<ComprasDestinosSC> {
  const filtro = cod ? ` AND c.cod_ibge='${String(cod).replace(/\D/g, "")}'` : ""; // cod = só dígitos (rota)
  const J = `FROM contratos_sc c JOIN cnpj_loc cl ON cl.cnpj = regexp_replace(c.ni_fornecedor,'\\D','','g') WHERE c.valor_global IS NOT NULL${filtro}`;
  const dest = await query<Record<string, unknown>>(`SELECT cl.municipio, cl.uf, SUM(c.valor_global) v, COUNT(DISTINCT c.ni_fornecedor) nf ${J} AND cl.municipio IS NOT NULL GROUP BY cl.municipio, cl.uf ORDER BY v DESC LIMIT 10`).catch(() => []);
  if (!dest.length) return null;
  const cat = await query<Record<string, unknown>>(`SELECT cl.cnae, SUM(c.valor_global) v, COUNT(DISTINCT c.ni_fornecedor) nf ${J} AND cl.cnae IS NOT NULL GROUP BY cl.cnae ORDER BY v DESC LIMIT 5`).catch(() => []);
  const tot: Record<string, unknown> = (await query<Record<string, unknown>>(`SELECT SUM(c.valor_global) FILTER (WHERE cl.uf IS NOT NULL) resolvido, SUM(c.valor_global) FILTER (WHERE cl.uf='SC') sc, SUM(c.valor_global) tot ${J}`).catch(() => []))[0] || {};
  const resolvido = num(tot.resolvido), totalGeral = num(tot.tot), sc = num(tot.sc);
  return {
    totalResolvido: resolvido, scValor: sc, foraValor: resolvido - sc,
    coberturaPct: totalGeral > 0 ? Math.round((resolvido / totalGeral) * 1000) / 10 : 0,
    destinos: dest.map((r) => ({ municipio: String(r.municipio), uf: String(r.uf), valor: num(r.v), fornecedores: num(r.nf) })),
    categorias: cat.map((r) => ({ cnae: String(r.cnae), valor: num(r.v), fornecedores: num(r.nf) })),
  };
}

export async function getContratosResumoSC(cod: string): Promise<ContratosResumoSC | null> {
  const tot = await query<Record<string, unknown>>(`SELECT count(*) n, COALESCE(sum(valor_global),0) v FROM contratos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!tot.length || num(tot[0].n) === 0) return null;
  const forn = await query<Record<string, unknown>>(
    `SELECT c.fornecedor, c.ni_fornecedor, count(*) n, COALESCE(sum(c.valor_global),0) v, cl.uf, cl.municipio, cl.situacao
       FROM contratos_sc c LEFT JOIN cnpj_loc cl ON cl.cnpj = regexp_replace(c.ni_fornecedor,'\\D','','g')
       WHERE c.cod_ibge=$1 AND c.fornecedor IS NOT NULL GROUP BY c.fornecedor, c.ni_fornecedor, cl.uf, cl.municipio, cl.situacao ORDER BY v DESC LIMIT 8`, [cod]);
  const top = await query<Record<string, unknown>>(
    `SELECT objeto, fornecedor, valor_global, to_char(vig_inicio,'DD/MM/YYYY') vi, to_char(vig_fim,'DD/MM/YYYY') vf, to_char(assinatura,'DD/MM/YYYY') asn FROM contratos_sc WHERE cod_ibge=$1 ORDER BY valor_global DESC NULLS LAST LIMIT 12`, [cod]);
  // agregado de origem dos fornecedores (por valor) — SC vs fora, e top UFs de origem
  const locRows = await query<Record<string, unknown>>(
    `SELECT cl.uf, COALESCE(sum(c.valor_global),0) v FROM contratos_sc c LEFT JOIN cnpj_loc cl ON cl.cnpj = regexp_replace(c.ni_fornecedor,'\\D','','g')
       WHERE c.cod_ibge=$1 AND c.ni_fornecedor IS NOT NULL GROUP BY cl.uf`, [cod]).catch(() => []);
  // empenhado por fornecedor (empenhos_sc → contratos_sc) — 0 enquanto SC não publica o ciclo; preenche sozinho
  const empMap = new Map<string, number>();
  let empTot = 0, nfTot = 0;
  for (const r of await query<Record<string, unknown>>(
    `SELECT c.ni_fornecedor ni, COALESCE(sum(e.valor),0) emp FROM empenhos_sc e
       JOIN contratos_sc c ON c.cnpj_compra=e.cnpj_compra AND c.ano_compra=e.ano_compra AND c.seq_compra=e.seq_compra
       WHERE c.cod_ibge=$1 GROUP BY c.ni_fornecedor`, [cod]).catch(() => [])) { empMap.set(String(r.ni), num(r.emp)); empTot += num(r.emp); }
  nfTot = num((await query<Record<string, unknown>>(`SELECT count(*) n FROM nf_sc WHERE cod_ibge=$1`, [cod]).catch(() => [{ n: 0 }]))[0]?.n);
  let localidade: ContratosResumoSC["localidade"] = null;
  if (locRows.length) {
    const totalV = locRows.reduce((s, r) => s + num(r.v), 0);
    const resolvidoV = locRows.filter((r) => r.uf).reduce((s, r) => s + num(r.v), 0);
    const scV = locRows.filter((r) => r.uf === "SC").reduce((s, r) => s + num(r.v), 0);
    if (totalV > 0 && resolvidoV > 0) {
      localidade = {
        scPct: Math.round((scV / resolvidoV) * 1000) / 10,
        foraPct: Math.round(((resolvidoV - scV) / resolvidoV) * 1000) / 10,
        resolvidoPct: Math.round((resolvidoV / totalV) * 1000) / 10,
        topUF: locRows.filter((r) => r.uf && r.uf !== "SC").map((r) => ({ uf: String(r.uf), valor: num(r.v) })).sort((a, b) => b.valor - a.valor).slice(0, 5),
      };
    }
  }
  return {
    n: num(tot[0].n), valor_total: num(tot[0].v),
    por_fornecedor: forn.map((r) => ({ nome: String(r.fornecedor || "—"), ni: String(r.ni_fornecedor || ""), n: num(r.n), valor: num(r.v), uf: r.uf ? String(r.uf) : null, municipio: r.municipio ? String(r.municipio) : null, empenhado: empMap.get(String(r.ni_fornecedor || "")) || 0, nfs: 0, situacao: r.situacao ? String(r.situacao) : null })),
    top: top.map((r) => ({ objeto: String(r.objeto || ""), fornecedor: String(r.fornecedor || "—"), valor: num(r.valor_global), vigInicio: r.vi ? String(r.vi) : null, vigFim: r.vf ? String(r.vf) : null, assinatura: r.asn ? String(r.asn) : null })),
    localidade,
    execucao: { empenhoTotal: empTot, nfTotal: nfTot },
  };
}

/* ===== PCA — Plano Anual de Contratações (PNCP) — planejado × contratado ===== */

export type PcaResumoSC = {
  n_itens: number; valor_total: number;
  por_categoria: { nome: string; n: number; valor: number }[];
  por_ano: { nome: string; n: number; valor: number }[];
  top: { descricao: string; categoria: string; qtd: number; valor: number; dataDesejada: string | null; anoPca: number | null }[];
};

export async function getPcaResumoSC(cod: string): Promise<PcaResumoSC | null> {
  const rows = await query<Record<string, unknown>>(`SELECT n_itens, valor_total, por_categoria, por_ano, top FROM pca_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const r = rows[0];
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    n_itens: num(r.n_itens), valor_total: num(r.valor_total),
    por_categoria: arr(r.por_categoria) as PcaResumoSC["por_categoria"],
    por_ano: arr(r.por_ano) as PcaResumoSC["por_ano"],
    top: arr(r.top) as PcaResumoSC["top"],
  };
}

/* ===== METAS FISCAIS (LDO) reais — SICONFI RREO Anexo 06 ===== */

export type MetaFiscalAno = {
  ano: number;
  meta_primario: number | null; resultado_primario: number | null;
  meta_nominal: number | null; resultado_nominal: number | null;
  receita_prim_prev: number | null; receita_prim_real: number | null;
  despesa_prim_dot: number | null; despesa_prim_emp: number | null;
  dcl_inicio: number | null; dcl_fim: number | null;
};

export async function getMetasFiscaisSC(cod: string): Promise<{ latest: MetaFiscalAno; serie: MetaFiscalAno[] } | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, meta_primario, resultado_primario, meta_nominal, resultado_nominal,
            receita_prim_prev, receita_prim_real, despesa_prim_dot, despesa_prim_emp, dcl_inicio, dcl_fim
       FROM metas_fiscais_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const n = (v: unknown) => (v == null ? null : Number(v));
  const serie = rows.map((r) => ({
    ano: num(r.ano),
    meta_primario: n(r.meta_primario), resultado_primario: n(r.resultado_primario),
    meta_nominal: n(r.meta_nominal), resultado_nominal: n(r.resultado_nominal),
    receita_prim_prev: n(r.receita_prim_prev), receita_prim_real: n(r.receita_prim_real),
    despesa_prim_dot: n(r.despesa_prim_dot), despesa_prim_emp: n(r.despesa_prim_emp),
    dcl_inicio: n(r.dcl_inicio), dcl_fim: n(r.dcl_fim),
  }));
  return { latest: serie[serie.length - 1], serie };
}

/* ===== ÍNDICE FISCAL PNIGP (real) + ranking dos entes de SC ===== */

export type RankFiscalSC = {
  cod_ibge: string; nome: string; tipo: string; score: number; posicao: number;
  autonomia: number; investimento: number; equilibrio: number; pessoal: number; // % brutos p/ exibir
};

export async function getRankingFiscalSC(): Promise<RankFiscalSC[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge, e.nome, e.tipo,
            f.receita, f.tributaria, f.despesa, f.resultado, f.pessoal, f.investimento
       FROM financas_sc f JOIN entes_sc e ON e.cod_ibge = f.cod_ibge
      WHERE f.suspeito IS NOT TRUE
      ORDER BY f.cod_ibge, f.ano DESC`,
  ).catch(() => []);
  if (!rows.length) return [];
  const base = rows.map((r) => {
    const receita = num(r.receita) || 0; const despesa = num(r.despesa) || 0;
    return {
      cod_ibge: String(r.cod_ibge), nome: String(r.nome), tipo: String(r.tipo),
      autonomia: receita > 0 ? num(r.tributaria) / receita : 0,
      investimento: despesa > 0 ? num(r.investimento) / despesa : 0,
      equilibrio: receita > 0 ? num(r.resultado) / receita : 0,
      pessoal: receita > 0 ? num(r.pessoal) / receita : 0, // menor é melhor
    };
  });
  const n = base.length;
  // percentil de cada dimensão (0-100); pessoal invertido (menor = melhor)
  const pct = (vals: number[], invert = false) => {
    const idx = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const p = new Array(n).fill(0);
    idx.forEach((o, rank) => { p[o.i] = n > 1 ? (rank / (n - 1)) * 100 : 100; });
    return invert ? p.map((x) => 100 - x) : p;
  };
  const pA = pct(base.map((b) => b.autonomia));
  const pI = pct(base.map((b) => b.investimento));
  const pE = pct(base.map((b) => b.equilibrio));
  const pP = pct(base.map((b) => b.pessoal), true);
  const scored = base.map((b, i) => ({
    ...b, score: Math.round(((pA[i] + pI[i] + pE[i] + pP[i]) / 4) * 10) / 10,
    autonomia: Math.round(b.autonomia * 1000) / 10, investimento: Math.round(b.investimento * 1000) / 10,
    equilibrio: Math.round(b.equilibrio * 1000) / 10, pessoal: Math.round(b.pessoal * 1000) / 10,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s, posicao: i + 1 }));
}

/** PIB per capita real (IBGE) do ente, se coletado. */
export async function getPibPerCapitaSC(cod: string): Promise<number | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT valor FROM indicadores_sc WHERE cod_ibge=$1 AND codigo='pib_per_capita' ORDER BY ano DESC LIMIT 1`, [cod],
  ).catch(() => []);
  return rows.length ? num(rows[0].valor) : null;
}

/* ===== INDICADORES SETORIAIS reais (indicadores_sc) + benchmark SC ===== */

const IND_LABEL: Record<string, string> = {
  pib_per_capita: "PIB per capita",
  bpc_por_mil_hab: "BPC — beneficiários por mil hab.",
  transferencia_renda_por_mil_hab: "Bolsa Família / renda — benef. por mil hab.",
  seguro_defeso_por_mil_hab: "Seguro Defeso — beneficiários por mil hab.",
  taxa_alfabetizacao: "Taxa de alfabetização (15+ anos)",
  populacao: "População", area_km2: "Área territorial", densidade_hab_km2: "Densidade demográfica",
};
const AREA_LABEL: Record<string, string> = {
  economia: "Economia", social: "Social", saude: "Saúde", educacao: "Educação", seguranca: "Segurança", demografia: "Demografia",
};

export type IndicadorSetorial = { codigo: string; nome: string; area: string; areaLabel: string; valor: number; unidade: string; fonte: string; media: number };

export async function getIndicadoresSetoriaisSC(cod: string): Promise<IndicadorSetorial[]> {
  // último valor por indicador (DISTINCT ON codigo), com média de SC do mesmo ano
  const rows = await query<Record<string, unknown>>(
    `SELECT DISTINCT ON (i.codigo) i.codigo, i.area, i.valor, i.unidade, i.fonte, i.ano,
            (SELECT AVG(x.valor) FROM indicadores_sc x WHERE x.codigo=i.codigo AND x.ano=i.ano) AS media
       FROM indicadores_sc i WHERE i.cod_ibge=$1 ORDER BY i.codigo, i.ano DESC`, [cod],
  ).catch(() => []);
  return rows
    .map((r) => ({
      codigo: String(r.codigo), nome: IND_LABEL[String(r.codigo)] || String(r.codigo),
      area: String(r.area), areaLabel: AREA_LABEL[String(r.area)] || String(r.area),
      valor: num(r.valor), unidade: String(r.unidade || ""), fonte: String(r.fonte || ""), media: num(r.media),
    }))
    .sort((a, b) => a.area.localeCompare(b.area) || a.nome.localeCompare(b.nome));
}

/** Série histórica de um indicador (ex.: transferência de renda) por ano. */
export async function getSerieIndicadorSC(cod: string, codigo: string): Promise<{ ano: number; valor: number }[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano, valor FROM indicadores_sc WHERE cod_ibge=$1 AND codigo=$2 ORDER BY ano`, [cod, codigo],
  ).catch(() => []);
  return rows.map((r) => ({ ano: num(r.ano), valor: num(r.valor) }));
}

/** Todas as séries históricas dos indicadores do ente, agrupadas por código. */
export async function getSeriesIndicadoresSC(cod: string): Promise<Record<string, { ano: number; valor: number }[]>> {
  const rows = await query<Record<string, unknown>>(
    `SELECT codigo, ano, valor FROM indicadores_sc WHERE cod_ibge=$1 ORDER BY codigo, ano`, [cod],
  ).catch(() => []);
  const m: Record<string, { ano: number; valor: number }[]> = {};
  for (const r of rows) { const k = String(r.codigo); (m[k] ??= []).push({ ano: num(r.ano), valor: num(r.valor) }); }
  return m;
}

/** Itens persistidos (itens_sc) de um processo; vazio se ainda não coletado (cai p/ on-demand). */
export async function getItensPersistidosSC(cnpj: string, ano: number, seq: number) {
  const rows = await query<Record<string, unknown>>(
    `SELECT numero, descricao, unidade, quantidade, unit_estimado, unit_homologado,
            fornecedor, cnpj_fornecedor, porte_fornecedor, beneficio_lc, economia_pct
       FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY numero`, [cnpj, ano, seq],
  ).catch(() => []);
  return rows.map((r) => ({
    numero: num(r.numero), descricao: String(r.descricao || ""), unidade: String(r.unidade || ""),
    quantidade: num(r.quantidade), unitEstimado: num(r.unit_estimado), totalEstimado: num(r.unit_estimado) * num(r.quantidade),
    unitHomologado: r.unit_homologado == null ? null : num(r.unit_homologado),
    fornecedor: r.fornecedor ? String(r.fornecedor) : null,
    cnpjFornecedor: r.cnpj_fornecedor ? String(r.cnpj_fornecedor) : null,
    porteFornecedor: r.porte_fornecedor ? String(r.porte_fornecedor) : null,
    beneficioLC: r.beneficio_lc ? String(r.beneficio_lc) : null,
    economiaPct: r.economia_pct == null ? null : num(r.economia_pct),
  }));
}

// ===== Diagnóstico do Gestor — pontos de análise + sugestões ancorados em LRF/CF/TCE =====
export type DiagPonto = { titulo: string; valor: string; ref: string; alerta: boolean; sugestao: string };
export type DiagGestor = { ano: number; grupo: string; nAlertas: number; pontos: DiagPonto[] } | null;

const _faixa = (p: number) => (!p ? "sem população" : p >= 100000 ? "acima de 100 mil hab" : p >= 50000 ? "50–100 mil hab" : p >= 20000 ? "20–50 mil hab" : p >= 10000 ? "10–20 mil hab" : "até 10 mil hab");
const _fk = (p: number) => (!p ? "x" : p >= 100000 ? "a" : p >= 50000 ? "b" : p >= 20000 ? "c" : p >= 10000 ? "d" : "e");
const _median = (a: number[]) => { const s = a.filter((x) => isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const _pc = (n: number) => (n * 100).toFixed(1) + "%";
const _br = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

export async function getDiagnosticoGestorSC(cod: string): Promise<DiagGestor> {
  const fin = await query<Record<string, unknown>>(
    `SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge, f.ano, e.populacao,
       f.receita,f.tributaria,f.transferencias,f.despesa,f.resultado,f.pessoal,f.custeio,f.investimento
     FROM financas_sc f JOIN entes_sc e ON e.cod_ibge=f.cod_ibge
     WHERE f.suspeito IS NOT TRUE AND f.receita>0 AND f.ano<=2025 AND e.tipo='M'
     ORDER BY f.cod_ibge, f.ano DESC`).catch(() => []);
  const alvo = fin.find((x) => String(x.cod_ibge) === cod);
  if (!alvo) return null; // só municípios (Estado tem limites próprios — roadmap)

  const ratios = (x: Record<string, unknown>) => ({
    auto: num(x.tributaria) / num(x.receita),
    dep: num(x.transferencias) / num(x.receita),
    inv: num(x.despesa) > 0 ? num(x.investimento) / num(x.despesa) : 0,
    eq: num(x.resultado) / num(x.receita),
    rig: num(x.despesa) > 0 ? (num(x.pessoal) + num(x.custeio)) / num(x.despesa) : 0,
  });
  const gk = _fk(num(alvo.populacao));
  const pares = fin.filter((x) => _fk(num(x.populacao)) === gk).map(ratios);
  const med = { auto: _median(pares.map((x) => x.auto)), dep: _median(pares.map((x) => x.dep)), inv: _median(pares.map((x) => x.inv)), rig: _median(pares.map((x) => x.rig)) };
  const r = ratios(alvo);
  const ano = num(alvo.ano);

  const rg = (await query<Record<string, unknown>>(`SELECT ano,pessoal_pct,dcl_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY (ano=$2) DESC, ano DESC LIMIT 1`, [cod, ano]).catch(() => []))[0];
  const rc = (await query<Record<string, unknown>>(`SELECT ano,educacao_pct,educacao_min,fundeb_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY (ano=$2) DESC, ano DESC LIMIT 1`, [cod, ano]).catch(() => []))[0];
  const sd = (await query<Record<string, unknown>>(`SELECT ano,saude_pct FROM siops_sc WHERE cod_ibge=$1 AND saude_pct IS NOT NULL ORDER BY (ano=$2) DESC, ano DESC LIMIT 1`, [cod, ano]).catch(() => []))[0];
  const disp = (await query<Record<string, unknown>>(`SELECT dispensa_pct FROM compras_sc WHERE cod_ibge=$1 AND ano<=2025 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const meta = (await query<Record<string, unknown>>(`SELECT ano,meta_primario,resultado_primario FROM metas_fiscais_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];

  const low = (v: number, m: number) => m > 0 && v < m * 0.85;
  const high = (v: number, m: number) => m > 0 && v > m * 1.15;
  const P: DiagPonto[] = [];
  P.push({ titulo: "Autonomia tributária", valor: _pc(r.auto), ref: `pares ${_pc(med.auto)}`, alerta: low(r.auto, med.auto), sugestao: "Arrecadação própria abaixo dos pares — recuperar dívida ativa e atualizar a planta de valores (IPTU/ISS); reduz dependência de repasses." });
  P.push({ titulo: "Dependência de transferências", valor: _pc(r.dep), ref: `pares ${_pc(med.dep)}`, alerta: high(r.dep, med.dep), sugestao: "Dependência acima dos pares — diversificar receita própria; vulnerável a cortes de repasse." });
  if (rg?.pessoal_pct != null) { const pp = num(rg.pessoal_pct); P.push({ titulo: `Pessoal Executivo / RCL — oficial RGF ${num(rg.ano)}`, valor: _pc(pp / 100), ref: "LRF: alerta 48,6% · prudencial 51,3% · limite 54%", alerta: pp > 48.6, sugestao: pp > 54 ? "Acima do limite da LRF (54%) — recondução obrigatória (art. 23) e vedação a reajustes/contratações (art. 22)." : pp > 51.3 ? "Acima do limite prudencial (51,3%) — vedações da LRF já aplicáveis; conter pessoal." : "Na faixa de alerta da LRF (48,6%) — o TCE-SC notifica nessa faixa; monitorar." }); }
  P.push({ titulo: "Taxa de investimento", valor: _pc(r.inv), ref: `pares ${_pc(med.inv)}`, alerta: low(r.inv, med.inv), sugestao: "Investimento abaixo dos pares — revisar execução de obras e restos a pagar; baixo investimento reduz a entrega à população." });
  P.push({ titulo: "Rigidez da despesa (pessoal+custeio)", valor: _pc(r.rig), ref: `pares ${_pc(med.rig)}`, alerta: high(r.rig, med.rig), sugestao: "Despesa muito rígida — pouca margem para investir; buscar eficiência no custeio." });
  P.push({ titulo: "Resultado orçamentário", valor: _pc(r.eq), ref: _br(num(alvo.resultado)), alerta: r.eq < 0, sugestao: "Déficit no exercício — ajustar despesa corrente ou reforçar receita; déficits recorrentes pressionam a dívida." });
  if (rg?.dcl_pct != null) { const d = num(rg.dcl_pct); P.push({ titulo: `Dívida Consolidada Líquida / RCL — oficial RGF ${num(rg.ano)}`, valor: _pc(d / 100), ref: "limite 120% (Res. SF 40/2001)", alerta: d > 120, sugestao: "DCL acima do limite legal — recondução obrigatória e restrição a novas operações de crédito." }); }
  if (disp?.dispensa_pct != null) { const dp = num(disp.dispensa_pct) / 100; P.push({ titulo: "Compras sem licitação", valor: _pc(dp), ref: "valor por dispensa/inexigibilidade", alerta: dp > 0.30, sugestao: "Fatia alta sem licitação — ampliar pregão/concorrência aumenta competição e reduz preço." }); }
  if (meta?.meta_primario != null && meta?.resultado_primario != null) { const ok = num(meta.resultado_primario) >= num(meta.meta_primario); P.push({ titulo: `Meta de resultado primário — LDO ${num(meta.ano)}`, valor: ok ? "cumprida" : "não cumprida", ref: `meta ${_br(num(meta.meta_primario))} × real ${_br(num(meta.resultado_primario))}`, alerta: !ok, sugestao: "Meta da LDO descumprida — revisar programação financeira; impacto na prestação de contas ao TCE." }); }
  if (rc?.educacao_pct != null) { const mn = num(rc.educacao_min) || 25; const v = num(rc.educacao_pct); P.push({ titulo: "Aplicação em Educação (MDE · CF art. 212)", valor: _pc(v / 100), ref: `mínimo ${mn}% · ${num(rc.ano)}`, alerta: v < mn, sugestao: "Abaixo do mínimo constitucional de educação — risco de rejeição de contas pelo TCE; reforçar despesas de MDE." }); }
  if (rc?.fundeb_pct != null) { const v = num(rc.fundeb_pct); P.push({ titulo: "FUNDEB em remuneração (mín. 70%)", valor: _pc(v / 100), ref: `mínimo 70% · ${num(rc.ano)}`, alerta: v < 70, sugestao: "Abaixo de 70% do FUNDEB em remuneração de profissionais — descumprimento legal a corrigir." }); }
  if (sd?.saude_pct != null) { const v = num(sd.saude_pct); P.push({ titulo: "Aplicação em Saúde (ASPS · LC 141)", valor: _pc(v / 100), ref: `mínimo 15% · ${num(sd.ano)} (SIOPS)`, alerta: v < 15, sugestao: "Abaixo do mínimo constitucional de saúde (15%) — risco de rejeição de contas pelo TCE; reforçar despesas com ASPS." }); }

  return { ano, grupo: _faixa(num(alvo.populacao)), nAlertas: P.filter((p) => p.alerta).length, pontos: P };
}

// ===== Cruzamento Saúde: gasto (SIOPS) × rede (CNES) × população =====
export type SaudeSC = {
  pop: number; grupo: string;
  saudePct: number | null; saudeAno: number | null;
  estab: number; sus: number; hospitalar: number; cirurgico: number; temHospital: boolean;
  estabMil: number; susMil: number; estabMilPares: number; susMilPares: number;
  internMil: number; internMilPares: number; siaHab: number; siaHabPares: number; sihAno: number | null; siaAno: number | null;
  transfSaudeValor: number | null; transfUniaoValor: number | null; transfUniaoPct: number | null;
  popIndigena: number | null;
} | null;
export async function getSaudeSC(cod: string): Promise<SaudeSC> {
  const base = await query<Record<string, unknown>>(
    `SELECT c.cod_ibge, e.populacao, e.pop_indigena, c.total, c.sus_amb FROM cnes_sc c JOIN entes_sc e ON e.cod_ibge=c.cod_ibge WHERE e.tipo='M' AND e.populacao>0`,
  ).catch(() => []);
  const alvo = base.find((x) => String(x.cod_ibge) === cod);
  if (!alvo) return null;
  const mil = (v: number, pop: number) => (pop > 0 ? v / (pop / 1000) : 0);
  const gk = _fk(num(alvo.populacao));
  const pares = base.filter((x) => _fk(num(x.populacao)) === gk);
  const estabMilPares = _median(pares.map((x) => mil(num(x.total), num(x.populacao))));
  const susMilPares = _median(pares.map((x) => mil(num(x.sus_amb), num(x.populacao))));
  const cn = (await query<Record<string, unknown>>(`SELECT total,sus_amb,hospitalar,cirurgico FROM cnes_sc WHERE cod_ibge=$1`, [cod]))[0];
  const sd = (await query<Record<string, unknown>>(`SELECT ano,saude_pct,transf_saude_valor,transf_uniao_valor,transf_uniao_pct FROM siops_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const pop = num(alvo.populacao);
  // PRODUÇÃO (SIH/SIA) — último ano disponível por métrica, per capita, vs pares
  const prodBase = await query<Record<string, unknown>>(
    `SELECT e.cod_ibge, e.populacao,
        (SELECT internacoes FROM saude_producao_sc s WHERE s.cod_ibge=e.cod_ibge AND internacoes IS NOT NULL ORDER BY ano DESC LIMIT 1) inter,
        (SELECT sia_qtd FROM saude_producao_sc s WHERE s.cod_ibge=e.cod_ibge AND sia_qtd IS NOT NULL ORDER BY ano DESC LIMIT 1) sia
       FROM entes_sc e WHERE e.tipo='M' AND e.populacao>0`,
  ).catch(() => []);
  const imil = (x: Record<string, unknown>) => { const p = num(x.populacao); return p > 0 ? num(x.inter) / (p / 1000) : 0; };
  const shab = (x: Record<string, unknown>) => { const p = num(x.populacao); return p > 0 ? num(x.sia) / p : 0; };
  const pa = prodBase.find((x) => String(x.cod_ibge) === cod);
  const prodG = prodBase.filter((x) => _fk(num(x.populacao)) === gk);
  const internMilPares = _median(prodG.filter((x) => num(x.inter) > 0).map(imil));
  const siaHabPares = _median(prodG.filter((x) => num(x.sia) > 0).map(shab));
  const sihAno = (await query<Record<string, unknown>>(`SELECT ano FROM saude_producao_sc WHERE cod_ibge=$1 AND internacoes IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const siaAno = (await query<Record<string, unknown>>(`SELECT ano FROM saude_producao_sc WHERE cod_ibge=$1 AND sia_qtd IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  return {
    pop, grupo: _faixa(pop),
    saudePct: sd ? num(sd.saude_pct) : null, saudeAno: sd ? num(sd.ano) : null,
    estab: num(cn?.total), sus: num(cn?.sus_amb), hospitalar: num(cn?.hospitalar), cirurgico: num(cn?.cirurgico), temHospital: num(cn?.hospitalar) > 0,
    estabMil: mil(num(cn?.total), pop), susMil: mil(num(cn?.sus_amb), pop), estabMilPares, susMilPares,
    internMil: pa ? imil(pa) : 0, internMilPares, siaHab: pa ? shab(pa) : 0, siaHabPares,
    sihAno: sihAno ? num(sihAno.ano) : null, siaAno: siaAno ? num(siaAno.ano) : null,
    transfSaudeValor: sd && sd.transf_saude_valor != null ? num(sd.transf_saude_valor) : null,
    transfUniaoValor: sd && sd.transf_uniao_valor != null ? num(sd.transf_uniao_valor) : null,
    transfUniaoPct: sd && sd.transf_uniao_pct != null ? num(sd.transf_uniao_pct) : null,
    popIndigena: alvo.pop_indigena != null ? num(alvo.pop_indigena) : null,
  };
}

// ===== Cruzamento Educação: gasto MDE (insumo) × alfabetização (resultado) × FUNDEB =====
export type EducacaoSC = {
  pop: number; grupo: string;
  educPct: number | null; fundebPct: number | null; ano: number | null;
  alfab: number | null; alfabPares: number; educPares: number; pib: number | null;
} | null;
export async function getEducacaoSC(cod: string): Promise<EducacaoSC> {
  const base = await query<Record<string, unknown>>(
    `SELECT e.cod_ibge, e.populacao,
        (SELECT educacao_pct FROM rreo_const_sc r WHERE r.cod_ibge=e.cod_ibge AND educacao_pct IS NOT NULL ORDER BY ano DESC LIMIT 1) educ,
        (SELECT valor FROM indicadores_sc i WHERE i.cod_ibge=e.cod_ibge AND codigo='taxa_alfabetizacao' ORDER BY ano DESC LIMIT 1) alfab
       FROM entes_sc e WHERE e.tipo='M' AND e.populacao>0`,
  ).catch(() => []);
  const alvo = base.find((x) => String(x.cod_ibge) === cod);
  if (!alvo) return null;
  const gk = _fk(num(alvo.populacao));
  const pares = base.filter((x) => _fk(num(x.populacao)) === gk);
  const educPares = _median(pares.map((x) => num(x.educ)).filter((v) => v > 0));
  const alfabPares = _median(pares.map((x) => num(x.alfab)).filter((v) => v > 0));
  const rc = (await query<Record<string, unknown>>(`SELECT ano,educacao_pct,fundeb_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const pib = (await query<Record<string, unknown>>(`SELECT valor FROM indicadores_sc WHERE cod_ibge=$1 AND codigo='pib_per_capita' ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  return {
    pop: num(alvo.populacao), grupo: _faixa(num(alvo.populacao)),
    educPct: rc ? num(rc.educacao_pct) : (num(alvo.educ) || null), fundebPct: rc ? num(rc.fundeb_pct) : null, ano: rc ? num(rc.ano) : null,
    alfab: alvo.alfab == null ? null : num(alvo.alfab), alfabPares, educPares, pib: pib ? num(pib.valor) : null,
  };
}

// ===== Cruzamentos: compras (eficiência) · fiscal×economia · proteção social =====
export type Cruzamentos = {
  grupo: string;
  compras: { dispensaPct: number; dispensaPares: number; competPct: number; economiaUnit: number | null; itensCobertura: number } | null;
  fiscal: { autonomia: number; autonomiaPares: number; dependencia: number; dependenciaPares: number; pib: number | null; pibPares: number } | null;
  social: { transfRendaMil: number | null; transfPares: number; bpcMil: number | null } | null;
} | null;
export async function getCruzamentosSC(cod: string): Promise<Cruzamentos> {
  const ANO = new Date().getFullYear() - 1;
  const ente = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]))[0];
  if (!ente) return null;
  const gk = _fk(num(ente.populacao)), grupo = _faixa(num(ente.populacao));
  const pops = new Map((await query<Record<string, unknown>>(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M'`)).map((r) => [String(r.cod_ibge), num(r.populacao)]));
  const noGrupo = (c: string) => _fk(pops.get(c) || 0) === gk;
  const compet = (pm: unknown) => { if (!Array.isArray(pm)) return 0; let c = 0, t = 0; for (const m of pm) { t += num(m.valor); if (/preg|concorr/i.test(String(m.modalidade))) c += num(m.valor); } return t > 0 ? (c / t) * 100 : 0; };

  // FISCAL
  const fin = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, tributaria, transferencias, receita FROM financas_sc WHERE suspeito IS NOT TRUE AND receita>0 AND ano<=${ANO} ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const finG = fin.filter((x) => noGrupo(String(x.cod_ibge)));
  const fa = fin.find((x) => String(x.cod_ibge) === cod);
  const pibRows = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, valor FROM indicadores_sc WHERE codigo='pib_per_capita' ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const pibMap = new Map(pibRows.map((r) => [String(r.cod_ibge), num(r.valor)]));
  const fiscal = fa ? {
    autonomia: num(fa.tributaria) / num(fa.receita) * 100,
    autonomiaPares: _median(finG.map((x) => num(x.tributaria) / num(x.receita) * 100)),
    dependencia: num(fa.transferencias) / num(fa.receita) * 100,
    dependenciaPares: _median(finG.map((x) => num(x.transferencias) / num(x.receita) * 100)),
    pib: pibMap.get(cod) || null,
    pibPares: _median([...pibMap.entries()].filter(([c]) => noGrupo(c)).map(([, v]) => v).filter((v) => v > 0)),
  } : null;

  // COMPRAS
  const comp = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, dispensa_pct, por_modalidade FROM compras_sc ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const ca = comp.find((x) => String(x.cod_ibge) === cod);
  // economia unitária: ponderada por valor, EXCLUI outliers (homologado>estimado = erro de digitação unidade×total)
  const it = (await query<Record<string, unknown>>(
    `SELECT COALESCE(SUM(unit_estimado*quantidade),0) est, COALESCE(SUM(unit_homologado*quantidade),0) hom, COUNT(*) n
     FROM itens_sc WHERE cod_ibge=$1 AND unit_homologado IS NOT NULL AND unit_estimado IS NOT NULL AND unit_estimado>0 AND quantidade>0 AND unit_homologado<=unit_estimado`, [cod]).catch(() => []))[0];
  const itEst = num(it?.est);
  const compras = ca ? {
    dispensaPct: num(ca.dispensa_pct),
    dispensaPares: _median(comp.filter((x) => noGrupo(String(x.cod_ibge))).map((x) => num(x.dispensa_pct))),
    competPct: compet(ca.por_modalidade),
    economiaUnit: it && num(it.n) > 0 && itEst > 0 ? ((itEst - num(it.hom)) / itEst) * 100 : null,
    itensCobertura: num(it?.n),
  } : null;

  // SOCIAL
  const soc = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, valor FROM indicadores_sc WHERE codigo='transferencia_renda_por_mil_hab' ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const sa = soc.find((x) => String(x.cod_ibge) === cod);
  const bpc = (await query<Record<string, unknown>>(`SELECT valor FROM indicadores_sc WHERE cod_ibge=$1 AND codigo='bpc_por_mil_hab' ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const social = {
    transfRendaMil: sa ? num(sa.valor) : null,
    transfPares: _median(soc.filter((x) => noGrupo(String(x.cod_ibge))).map((x) => num(x.valor)).filter((v) => v > 0)),
    bpcMil: bpc ? num(bpc.valor) : null,
  };

  return { grupo, compras, fiscal, social };
}

// Diagnóstico do ESTADO (tipo E) — âncoras legais absolutas (sem pares; limites estaduais próprios)
export async function getDiagnosticoEstadoSC(cod: string): Promise<DiagGestor> {
  const e = (await query<Record<string, unknown>>(`SELECT tipo, populacao FROM entes_sc WHERE cod_ibge=$1`, [cod]))[0];
  if (!e || e.tipo !== "E") return null;
  const f = (await query<Record<string, unknown>>(`SELECT ano,receita,tributaria,transferencias,despesa,resultado,pessoal,investimento FROM financas_sc WHERE cod_ibge=$1 AND suspeito IS NOT TRUE ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!f) return null;
  const rg = (await query<Record<string, unknown>>(`SELECT ano,pessoal_pct,dcl_pct,limite_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const rc = (await query<Record<string, unknown>>(`SELECT ano,educacao_pct,fundeb_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const meta = (await query<Record<string, unknown>>(`SELECT ano,meta_primario,resultado_primario FROM metas_fiscais_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const rec = num(f.receita), P: DiagPonto[] = [];
  P.push({ titulo: "Autonomia tributária", valor: _pc(num(f.tributaria) / rec * 100 / 100), ref: "receita própria / receita total", alerta: false, sugestao: "" });
  if (rg?.pessoal_pct != null) {
    const pp = num(rg.pessoal_pct), lim = num(rg.limite_pct) || 49, prud = lim * 0.95, alerta = lim * 0.90;
    P.push({ titulo: `Pessoal Executivo / RCL — oficial RGF ${num(rg.ano)}`, valor: _pc(pp / 100), ref: `LRF estadual: alerta ${alerta.toFixed(1)}% · prud. ${prud.toFixed(1)}% · limite ${lim}%`, alerta: pp > alerta, sugestao: pp > lim ? "Acima do limite da LRF (Executivo estadual) — recondução obrigatória e vedações." : pp > prud ? "Acima do limite prudencial — vedações da LRF aplicáveis." : "Na faixa de alerta — monitorar." });
  }
  P.push({ titulo: "Taxa de investimento", valor: _pc(num(f.despesa) > 0 ? num(f.investimento) / num(f.despesa) : 0), ref: "investimento / despesa", alerta: false, sugestao: "" });
  P.push({ titulo: "Resultado orçamentário", valor: _pc(rec > 0 ? num(f.resultado) / rec : 0), ref: _br(num(f.resultado)), alerta: num(f.resultado) < 0, sugestao: "Déficit no exercício — ajustar despesa ou reforçar receita." });
  if (rg?.dcl_pct != null) { const d = num(rg.dcl_pct); P.push({ titulo: `Dívida Consolidada Líquida / RCL — RGF ${num(rg.ano)}`, valor: _pc(d / 100), ref: "limite 200% (estados, Res. SF 40/2001)", alerta: d > 200, sugestao: "DCL acima do limite legal — recondução obrigatória." }); }
  if (rc?.educacao_pct != null) { const v = num(rc.educacao_pct); P.push({ titulo: "Aplicação em Educação (MDE · CF art. 212)", valor: _pc(v / 100), ref: `mínimo 25% · ${num(rc.ano)}`, alerta: v < 25, sugestao: "Abaixo do mínimo constitucional de educação — risco de contas." }); }
  if (rc?.fundeb_pct != null) { const v = num(rc.fundeb_pct); P.push({ titulo: "FUNDEB em remuneração (mín. 70%)", valor: _pc(v / 100), ref: `mínimo 70% · ${num(rc.ano)}`, alerta: v < 70, sugestao: "Abaixo de 70% do FUNDEB em remuneração." }); }
  if (meta?.meta_primario != null && meta?.resultado_primario != null) { const ok = num(meta.resultado_primario) >= num(meta.meta_primario); P.push({ titulo: `Meta de resultado primário — LDO ${num(meta.ano)}`, valor: ok ? "cumprida" : "não cumprida", ref: `meta ${_br(num(meta.meta_primario))} × real ${_br(num(meta.resultado_primario))}`, alerta: !ok, sugestao: "Meta da LDO descumprida — revisar programação financeira." }); }
  return { ano: num(f.ano), grupo: "Estado (limites legais estaduais)", nAlertas: P.filter((p) => p.alerta).length, pontos: P };
}

// Previne Brasil — indicadores de desempenho da APS (última competência), vs pares de porte
export type PrevineSC = { competencia: string; grupo: string; indicadores: { nome: string; pct: number; paresPct: number }[] } | null;
export async function getPrevineSC(cod: string): Promise<PrevineSC> {
  const ent = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]))[0];
  if (!ent) return null;
  const ult = (await query<Record<string, unknown>>(`SELECT max(competencia) m FROM previne_sc`).catch(() => []))[0]?.m as string | undefined;
  if (!ult) return null;
  const rows = await query<Record<string, unknown>>(`SELECT p.cod_ibge, e.populacao, p.ind_nome, p.pct FROM previne_sc p JOIN entes_sc e ON e.cod_ibge=p.cod_ibge WHERE p.competencia=$1 AND p.pct IS NOT NULL`, [ult]).catch(() => []);
  const gk = _fk(num(ent.populacao));
  const nomes = [...new Set(rows.map((r) => String(r.ind_nome)))].sort();
  const indicadores = nomes.map((nome) => {
    const alvo = rows.find((r) => String(r.cod_ibge) === cod && String(r.ind_nome) === nome);
    const pares = rows.filter((r) => String(r.ind_nome) === nome && _fk(num(r.populacao)) === gk).map((r) => num(r.pct));
    return { nome, pct: alvo ? num(alvo.pct) : 0, paresPct: _median(pares) };
  });
  return { competencia: ult, grupo: _faixa(num(ent.populacao)), indicadores };
}

// Previne — Ficha do Indicador: série por competência + pares, por indicador (para a visão pedagógica)
export type PrevineFichaSC = {
  competenciaUlt: string; grupo: string;
  indicadores: { codigo: string; nome: string; pct: number; paresPct: number; numerador: number; denominador: number; serie: { competencia: string; pct: number; numerador: number; denominador: number }[] }[];
} | null;
export async function getPrevineFichaSC(cod: string): Promise<PrevineFichaSC> {
  const ent = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]))[0];
  if (!ent) return null;
  const ult = (await query<Record<string, unknown>>(`SELECT max(competencia) m FROM previne_sc`).catch(() => []))[0]?.m as string | undefined;
  if (!ult) return null;
  const gk = _fk(num(ent.populacao));
  const meus = await query<Record<string, unknown>>(`SELECT competencia, indicador, ind_nome, numerador, denominador, pct FROM previne_sc WHERE cod_ibge=$1 ORDER BY competencia`, [cod]).catch(() => []);
  if (!meus.length) return null;
  const pares = await query<Record<string, unknown>>(`SELECT p.indicador, p.pct, e.populacao FROM previne_sc p JOIN entes_sc e ON e.cod_ibge=p.cod_ibge WHERE p.competencia=$1 AND p.pct IS NOT NULL`, [ult]).catch(() => []);
  const codigos = [...new Set(meus.map((r) => String(r.indicador)))].sort((a, b) => Number(a) - Number(b));
  const indicadores = codigos.map((codigo) => {
    const linhas = meus.filter((r) => String(r.indicador) === codigo);
    const ultLinha = linhas.find((r) => String(r.competencia) === ult) || linhas[linhas.length - 1];
    const paresPct = _median(pares.filter((r) => String(r.indicador) === codigo && _fk(num(r.populacao)) === gk).map((r) => num(r.pct)));
    return {
      codigo, nome: String(ultLinha?.ind_nome || codigo),
      pct: num(ultLinha?.pct), paresPct, numerador: num(ultLinha?.numerador), denominador: num(ultLinha?.denominador),
      serie: linhas.map((r) => ({ competencia: String(r.competencia), pct: num(r.pct), numerador: num(r.numerador), denominador: num(r.denominador) })),
    };
  });
  return { competenciaUlt: ult, grupo: _faixa(num(ent.populacao)), indicadores };
}

// Série histórica anual do FNS (para a Série Explicada) — total + custeio + investimento por ano
export type FnsSerieSC = { ano: number; total: number; custeio: number; investimento: number }[];
export async function getFnsSerieSC(cod: string): Promise<FnsSerieSC> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ano,
            sum(vl_liquido) total,
            sum(vl_liquido) FILTER (WHERE bloco_cod=10) custeio,
            sum(vl_liquido) FILTER (WHERE bloco_cod=11) investimento
     FROM fns_repasse_sc WHERE cod_ibge=$1 AND area_cod=0 GROUP BY ano ORDER BY ano`,
    [cod]
  ).catch(() => []);
  return rows.map((r) => ({ ano: num(r.ano), total: num(r.total), custeio: num(r.custeio), investimento: num(r.investimento) }));
}

// Repasses de saúde por PROGRAMA (canônico) com série anual — para o molde Ficha (4 visões)
export type RepasseSaudeFichaSC = { anoUlt: number; totalUlt: number; programas: { key: string; serie: { ano: number; valor: number }[]; valorUlt: number; pctTotal: number }[] } | null;
export async function getRepassesSaudeFichaSC(cod: string): Promise<RepasseSaudeFichaSC> {
  const { canonRepasse } = await import("@/lib/saude-repasses-saber");
  const rows = await query<Record<string, unknown>>(`SELECT ano, area_nome, vl_liquido FROM fns_repasse_sc WHERE cod_ibge=$1 AND area_cod<>0 AND vl_liquido IS NOT NULL`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoUlt = Math.max(...rows.map((r) => num(r.ano)));
  const acc = new Map<string, Map<number, number>>(); // key -> ano -> valor
  for (const r of rows) {
    const k = canonRepasse(String(r.area_nome));
    if (!acc.has(k)) acc.set(k, new Map());
    const m = acc.get(k)!;
    const ano = num(r.ano);
    m.set(ano, (m.get(ano) || 0) + num(r.vl_liquido));
  }
  const programas = [...acc.entries()].map(([key, m]) => {
    const serie = [...m.entries()].map(([ano, valor]) => ({ ano, valor })).sort((a, b) => a.ano - b.ano);
    return { key, serie, valorUlt: m.get(anoUlt) || 0, pctTotal: 0 };
  }).filter((p) => p.valorUlt > 0);
  const totalUlt = programas.reduce((s, p) => s + p.valorUlt, 0);
  programas.forEach((p) => { p.pctTotal = totalUlt > 0 ? (p.valorUlt / totalUlt) * 100 : 0; });
  programas.sort((a, b) => b.valorUlt - a.valorUlt);
  return { anoUlt, totalUlt, programas };
}

// Conexão de receitas — entra (próprio×transferências) vs pares do mesmo porte (potencial de captação)
export type ReceitaConexaoSC = { transfPC: number; transfPCpares: number; propriaPct: number; propriaPctPares: number; receita: number } | null;
export async function getReceitaConexaoSC(cod: string): Promise<ReceitaConexaoSC> {
  const ent = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]))[0];
  if (!ent) return null;
  const gk = _fk(num(ent.populacao));
  const fin = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, receita, tributaria, transferencias FROM financas_sc ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const ent2 = await query<Record<string, unknown>>(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M' AND populacao>0`).catch(() => []);
  const pop = new Map(ent2.map((e) => [String(e.cod_ibge), num(e.populacao)]));
  const pares = fin.map((f) => { const c = String(f.cod_ibge); const p = pop.get(c) || 0; if (p <= 0 || _fk(p) !== gk) return null; return { cod: c, transfPC: num(f.transferencias) / p, propriaPct: num(f.receita) > 0 ? (num(f.tributaria) / num(f.receita)) * 100 : 0 }; }).filter(Boolean) as { cod: string; transfPC: number; propriaPct: number }[];
  const eu = pares.find((p) => p.cod === cod); const meuFin = fin.find((f) => String(f.cod_ibge) === cod);
  if (!eu || !meuFin) return null;
  return { transfPC: eu.transfPC, transfPCpares: _median(pares.map((p) => p.transfPC)), propriaPct: eu.propriaPct, propriaPctPares: _median(pares.map((p) => p.propriaPct)), receita: num(meuFin.receita) };
}

// IEGM (TCE-SC/IRB) — qualidade da gestão: 7 dimensões + nota final (calculada c/ pesos oficiais)
const PESO_IEGM: Record<string, number> = { "i-educ": 0.2, "i-saude": 0.2, "i-fiscal": 0.2, "i-plan": 0.1, "i-amb": 0.1, "i-cidade": 0.1, "i-gov ti": 0.1 };
export function faixaIegm(pct: number): string { return pct >= 0.9 ? "A" : pct >= 0.75 ? "B+" : pct >= 0.6 ? "B" : pct >= 0.5 ? "C+" : "C"; }
function finalIegm(dims: { nome: string; pct: number }[]): number {
  let soma = 0, peso = 0;
  for (const d of dims) { const w = PESO_IEGM[d.nome.toLowerCase()]; if (w && d.pct != null) { soma += d.pct * w; peso += w; } }
  return peso > 0 ? soma / peso : 0;
}
export type IegmSC = { ano: number; dimensoes: { nome: string; pct: number; faixa: string }[]; finalPct: number; finalFaixa: string; serie: { ano: number; pct: number }[]; pctil: number | null; totalPares: number } | null;
export async function getIegmSC(cod: string): Promise<IegmSC> {
  const ent = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1`, [cod]))[0];
  const meus = await query<Record<string, unknown>>(`SELECT ano, indicador, pct, faixa FROM iegm_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!meus.length) return null;
  const anoUlt = Math.max(...meus.map((r) => num(r.ano)));
  const dimensoes = meus.filter((r) => num(r.ano) === anoUlt).map((r) => ({ nome: String(r.indicador), pct: num(r.pct), faixa: String(r.faixa || "") }));
  const finalPct = finalIegm(dimensoes);
  // série: final por ano
  const anos = [...new Set(meus.map((r) => num(r.ano)))].sort();
  const serie = anos.map((a) => ({ ano: a, pct: finalIegm(meus.filter((r) => num(r.ano) === a).map((r) => ({ nome: String(r.indicador), pct: num(r.pct) }))) }));
  // percentil entre pares do mesmo porte (ano mais recente)
  let pctil: number | null = null, totalPares = 0;
  if (ent) {
    const gk = _fk(num(ent.populacao));
    const todos = await query<Record<string, unknown>>(`SELECT i.cod_ibge, i.indicador, i.pct, e.populacao FROM iegm_sc i JOIN entes_sc e ON e.cod_ibge=i.cod_ibge WHERE i.ano=$1`, [anoUlt]).catch(() => []);
    const porEnte = new Map<string, { nome: string; pct: number }[]>();
    for (const r of todos) { if (_fk(num(r.populacao)) !== gk) continue; const c = String(r.cod_ibge); (porEnte.get(c) || porEnte.set(c, []).get(c)!).push({ nome: String(r.indicador), pct: num(r.pct) }); }
    const finais = [...porEnte.values()].map((d) => finalIegm(d)).filter((x) => x > 0);
    totalPares = finais.length;
    if (finais.length) pctil = Math.round((finais.filter((x) => x <= finalPct).length / finais.length) * 100);
  }
  return { ano: anoUlt, dimensoes, finalPct, finalFaixa: faixaIegm(finalPct), serie, pctil, totalPares };
}

// Eficiência por porte — gasto (input) × resultado (output), percentil entre pares do mesmo porte
export type EficienciaSC = {
  grupo: string; totalPares: number;
  saude: { gastoPC: number; gastoPctil: number; resultado: number; resultadoPctil: number; eficiencia: number } | null;
  educacao: { gastoPC: number; gastoPctil: number; resultado: number; resultadoPctil: number; eficiencia: number } | null;
} | null;
export async function getEficienciaSC(cod: string): Promise<EficienciaSC> {
  const ent = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]))[0];
  if (!ent) return null;
  const gk = _fk(num(ent.populacao));
  const fin = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, saude, educacao FROM financas_sc ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const prod = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, internacoes FROM saude_producao_sc ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const alf = await query<Record<string, unknown>>(`SELECT DISTINCT ON (cod_ibge) cod_ibge, valor FROM indicadores_sc WHERE codigo='taxa_alfabetizacao' ORDER BY cod_ibge, ano DESC`).catch(() => []);
  const ent2 = await query<Record<string, unknown>>(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M' AND populacao>0`).catch(() => []);
  const pop = new Map(ent2.map((e) => [String(e.cod_ibge), num(e.populacao)]));
  const mProd = new Map(prod.map((p) => [String(p.cod_ibge), num(p.internacoes)]));
  const mAlf = new Map(alf.map((a) => [String(a.cod_ibge), num(a.valor)]));
  // pares do mesmo porte com dados
  const pares = fin.map((f) => {
    const c = String(f.cod_ibge); const p = pop.get(c) || 0;
    if (p <= 0 || _fk(p) !== gk) return null;
    return { cod: c, gSau: num(f.saude) / (p / 1000), gEdu: num(f.educacao) / (p / 1000), rSau: (mProd.get(c) || 0) / (p / 1000), rEdu: mAlf.get(c) ?? null };
  }).filter(Boolean) as { cod: string; gSau: number; gEdu: number; rSau: number; rEdu: number | null }[];
  const eu = pares.find((p) => p.cod === cod);
  if (!eu) return null;
  const pctil = (arr: number[], v: number) => arr.length ? Math.round((arr.filter((x) => x <= v).length / arr.length) * 100) : 0;
  const dim = (gArr: number[], rArr: number[], g: number, r: number) => {
    const gp = pctil(gArr, g), rp = pctil(rArr, r);
    return { gastoPC: g, gastoPctil: gp, resultado: r, resultadoPctil: rp, eficiencia: rp - gp }; // entrega alto gastando baixo = eficiente
  };
  const saudePares = pares.filter((p) => p.gSau > 0 && p.rSau > 0);
  const educPares = pares.filter((p) => p.gEdu > 0 && p.rEdu != null);
  return {
    grupo: _faixa(num(ent.populacao)), totalPares: pares.length,
    saude: eu.gSau > 0 && eu.rSau > 0 ? dim(saudePares.map((p) => p.gSau), saudePares.map((p) => p.rSau), eu.gSau, eu.rSau) : null,
    educacao: eu.gEdu > 0 && eu.rEdu != null ? dim(educPares.map((p) => p.gEdu), educPares.map((p) => p.rEdu as number), eu.gEdu, eu.rEdu) : null,
  };
}

// Educação — série anual de MDE (% e R$) + FUNDEB, para o molde Ficha
export type EducacaoSerieSC = { ano: number; educPct: number; educValor: number; fundebPct: number | null }[];
export async function getEducacaoSerieSC(cod: string): Promise<EducacaoSerieSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, educacao_pct, educacao_valor, fundeb_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY ano`, [cod]).catch(() => []);
  return rows.map((r) => ({ ano: num(r.ano), educPct: num(r.educacao_pct), educValor: num(r.educacao_valor), fundebPct: r.fundeb_pct != null ? num(r.fundeb_pct) : null }));
}

// Despesa por subfunção (drill da função) — último ano
export type DespesaSubfuncaoSC = { anoUlt: number; porFuncao: Record<string, { subfuncao: string; empenhado: number }[]>; dotacaoPorFuncao: Record<string, number> } | null;
export async function getDespesaSubfuncaoSC(cod: string): Promise<DespesaSubfuncaoSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, funcao, subfuncao, empenhado FROM despesa_subfuncao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  // escolhe o ano com MAIS detalhe real (subfunções distintas que não sejam "Demais") — evita ano corrente agregado
  const detalhePorAno = new Map<number, number>();
  for (const r of rows) { if (!/demais subfun/i.test(String(r.subfuncao))) { const a = num(r.ano); detalhePorAno.set(a, (detalhePorAno.get(a) || 0) + 1); } }
  const anoUlt = detalhePorAno.size
    ? [...detalhePorAno.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    : Math.max(...rows.map((r) => num(r.ano)));
  const porFuncao: Record<string, { subfuncao: string; empenhado: number }[]> = {};
  for (const r of rows.filter((r) => num(r.ano) === anoUlt)) {
    const f = String(r.funcao);
    (porFuncao[f] = porFuncao[f] || []).push({ subfuncao: String(r.subfuncao), empenhado: num(r.empenhado) });
  }
  for (const f of Object.keys(porFuncao)) porFuncao[f].sort((a, b) => b.empenhado - a.empenhado);
  // dotação por função no MESMO ano (financas_sc) — para o drill ser consistente (função = soma das subfunções)
  const dotacaoPorFuncao: Record<string, number> = {};
  const finRow = (await query<Record<string, unknown>>(`SELECT funcoes FROM financas_sc WHERE cod_ibge=$1 AND ano=$2`, [cod, anoUlt]).catch(() => []))[0];
  const fns = (finRow?.funcoes as { nome?: string; dotacao?: number }[] | undefined) || [];
  for (const f of fns) if (f?.nome) dotacaoPorFuncao[f.nome] = num(f.dotacao);
  return { anoUlt, porFuncao, dotacaoPorFuncao };
}

// Economicidade das compras — economia entre preço estimado e homologado (item-level, itens_sc)
// Atas de Registro de Preço — visão própria (preço registrado + quantidade máxima; gasto real = empenhos)
export type AtasSC = {
  total: number; vigentes: number; vencidas: number; canceladas: number; aVencer90: number;
  criticidade: { nivel: string; n: number }[]; // mesma metodologia dos contratos (por prazo, pois valor = qtd máx registrada)
  lista: { objeto: string; fornecedor: string | null; vigInicio: string | null; vigFim: string | null; dias: number | null; cancelada: boolean; score: number; itens: { descricao: string; quantidade: number; preco: number | null; est: number | null }[] }[];
} | null;
// criticidade por PRAZO (mesma escala/níveis dos contratos): score = 100×(1 − dias/365)
function critPrazo(dias: number) {
  const score = Math.max(0, Math.min(100, Math.round((1 - Math.min(dias, 365) / 365) * 100)));
  const nivel = dias <= 30 ? "Crítico" : dias <= 90 ? "Alto" : dias <= 180 ? "Médio" : "Baixo";
  return { score, nivel };
}
export async function getAtasSC(cod: string): Promise<AtasSC> {
  const rows = await query<Record<string, unknown>>(
    `SELECT numero_controle_compra, objeto, vigencia_inicio, vigencia_fim, cancelado, (vigencia_fim::date - CURRENT_DATE) AS dias, cnpj_orgao, ano_ata
     FROM atas_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  let vigentes = 0, vencidas = 0, canceladas = 0, aVencer90 = 0;
  const cont: Record<string, number> = { "Crítico": 0, "Alto": 0, "Médio": 0, "Baixo": 0 };
  for (const r of rows) {
    if (r.cancelado === true || String(r.cancelado) === "true") { canceladas++; continue; }
    const d = r.dias != null ? num(r.dias) : null;
    if (d == null) continue;
    if (d < 0) vencidas++; else { vigentes++; if (d <= 90) aVencer90++; if (d <= 365) cont[critPrazo(d).nivel]++; }
  }
  const criticidade = ["Crítico", "Alto", "Médio", "Baixo"].map((nivel) => ({ nivel, n: cont[nivel] }));
  // atas a vencer (vigentes), ordenadas por criticidade (menor prazo = mais crítico); com itens registrados
  const top = rows.filter((r) => !(r.cancelado === true) && r.dias != null && num(r.dias) >= 0)
    .sort((a, b) => num(a.dias) - num(b.dias)).slice(0, 12);
  const lista: NonNullable<AtasSC>["lista"] = [];
  for (const a of top) {
    const ncc = String(a.numero_controle_compra || "");
    const its = ncc ? await query<Record<string, unknown>>(
      `SELECT i.descricao, i.quantidade, i.unit_homologado, i.unit_estimado, i.fornecedor
       FROM processos_sc p JOIN itens_sc i ON i.cnpj=p.cnpj_orgao AND i.ano=p.ano AND i.seq=p.sequencial
       WHERE p.numero_controle=$1 ORDER BY i.unit_homologado DESC NULLS LAST LIMIT 8`, [ncc]).catch(() => []) : [];
    lista.push({
      objeto: String(a.objeto || ""), fornecedor: its[0] ? (its[0].fornecedor as string) || null : null,
      vigInicio: (a.vigencia_inicio as string) || null, vigFim: (a.vigencia_fim as string) || null,
      dias: a.dias != null ? num(a.dias) : null, cancelada: a.cancelado === true,
      score: a.dias != null && num(a.dias) >= 0 ? critPrazo(num(a.dias)).score : 0,
      itens: its.map((i) => ({ descricao: String(i.descricao), quantidade: num(i.quantidade), preco: i.unit_homologado != null ? num(i.unit_homologado) : null, est: i.unit_estimado != null ? num(i.unit_estimado) : null })),
    });
  }
  return { total: rows.length, vigentes, vencidas, canceladas, aVencer90, criticidade, lista };
}

// Vigências dos contratos — alerta de vencimento por faixa (gestão de contratos)
export type ContratosVencimentoSC = {
  faixas: { id: string; label: string; n: number; valor: number }[];
  aVencer: { objeto: string; fornecedor: string; valor: number; vigInicio: string | null; vigFim: string; dias: number }[];
  nCriticos: number; vencidos: number; totalAtivos: number;
} | null;
export async function getContratosVencimentoSC(cod: string): Promise<ContratosVencimentoSC> {
  const rows = await query<Record<string, unknown>>(
    `SELECT objeto, fornecedor, valor_global, vig_inicio, vig_fim, (vig_fim::date - CURRENT_DATE) AS dias
     FROM contratos_sc WHERE cod_ibge=$1 AND vig_fim IS NOT NULL`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const FAIXAS = [
    { id: "critico", label: "Crítico (< 30 dias)", min: 0, max: 30 },
    { id: "m1_2", label: "1–2 meses", min: 31, max: 60 },
    { id: "m2_3", label: "2–3 meses", min: 61, max: 90 },
    { id: "m3_6", label: "3–6 meses", min: 91, max: 180 },
    { id: "m6_12", label: "6–12 meses", min: 181, max: 365 },
  ];
  const faixas = FAIXAS.map((f) => ({ id: f.id, label: f.label, n: 0, valor: 0 }));
  const aVencer: NonNullable<ContratosVencimentoSC>["aVencer"] = [];
  let vencidos = 0, totalAtivos = 0, nCriticos = 0;
  for (const r of rows) {
    const dias = num(r.dias); const v = num(r.valor_global);
    if (dias < 0) { vencidos++; continue; }
    totalAtivos++;
    const fi = FAIXAS.findIndex((f) => dias >= f.min && dias <= f.max);
    if (fi >= 0) { faixas[fi].n++; faixas[fi].valor += v; }
    if (dias <= 30) nCriticos++;
    if (dias <= 365) aVencer.push({ objeto: String(r.objeto || ""), fornecedor: String(r.fornecedor || ""), valor: v, vigInicio: (r.vig_inicio as string) || null, vigFim: String(r.vig_fim), dias });
  }
  aVencer.sort((a, b) => a.dias - b.dias);
  return { faixas, aVencer: aVencer.slice(0, 60), nCriticos, vencidos, totalAtivos };
}

// FNDE — recursos da educação que o município recebeu (SIMAD liberações: PNAE, PNATE, FUNDEB, salário-educação…)
export type FndeEducacaoSC = {
  total: number; nLib: number; anoUlt: number; totalUlt: number;
  porPrograma: { programa: string; valor: number }[];
  serie: { ano: number; valor: number }[];
} | null;
export async function getFndeEducacaoSC(cod: string): Promise<FndeEducacaoSC> {
  const [tot, prog, serie] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor),0) total, max(ano) ult FROM fnde_simad_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT trim(programa) p, coalesce(sum(valor),0) v FROM fnde_simad_sc WHERE cod_ibge=$1 GROUP BY 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, coalesce(sum(valor),0) v FROM fnde_simad_sc WHERE cod_ibge=$1 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []),
  ]);
  if (!tot.length || num(tot[0]?.n) === 0) return null;
  const anoUlt = num(tot[0]?.ult);
  const totalUlt = num((serie.find((r) => num(r.ano) === anoUlt) || {}).v);
  // consolida os programas (fragmentados) em grupos canônicos com rótulo leigo
  const grupos = new Map<string, { rotulo: string; valor: number }>();
  for (const r of prog) { const g = grupoFnde(String(r.p)); const cur = grupos.get(g.chave) || { rotulo: g.rotulo, valor: 0 }; cur.valor += num(r.v); grupos.set(g.chave, cur); }
  const porPrograma = [...grupos.values()].map((g) => ({ programa: g.rotulo, valor: g.valor })).sort((a, b) => b.valor - a.valor);
  return {
    total: num(tot[0]?.total), nLib: num(tot[0]?.n), anoUlt, totalUlt,
    porPrograma,
    serie: serie.map((r) => ({ ano: num(r.ano), valor: num(r.v) })),
  };
}

// Captação de Recursos (Transferegov API viva) — o que o município JÁ captou (fundo a fundo), oportunidades
// ABERTAS hoje, e benchmark vs pares (o ponto cego: quanto deixou na mesa). Cruzável c/ receitas SICONFI.
export type CaptacaoSC = {
  totalCaptado: number; nPlanos: number;
  porOrgao: { orgao: string; valor: number; n: number }[];
  porAno: { ano: number; valor: number }[];
  lista: { nome: string; orgao: string; valor: number; situacao: string }[];
  abertos: { id: string; nome: string; orgao: string; objetivo: string; descricao: string; valor: number; modalidade: string; fundo: string; naturezaDespesa: string; acaoOrcamentaria: string; valorAcao: number; parcelas: number; situacao: string; ano: number; codigo: string; dtIni: string | null; dtFim: string | null; dias: number | null }[];
  benchmark: { media: number; max: number; melhores: { nome: string; valor: number }[] };
  universo: { nProgramas: number; nAbertos: number; totalSC: number; nMunicipios: number };
  analises: { posicao: number; totalEntes: number; gapMedia: number; gapMax: number; tendencia: { delta: number; ultimoAno: number } | null; naoCaptados: number; concentracaoTop: { orgao: string; pct: number } | null };
} | null;
export async function getCaptacaoTransferegovSC(cod: string): Promise<CaptacaoSC> {
  const [tot, porOrgao, porAno, lista, abertos, bench, melhores, uni, an] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor_total_repasse),0) total FROM captacao_transferegov_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT orgao_repassador o, count(*) n, coalesce(sum(valor_total_repasse),0) v FROM captacao_transferegov_sc WHERE cod_ibge=$1 GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 8`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT extract(year from dt_inicio)::int ano, coalesce(sum(valor_total_repasse),0) v FROM captacao_transferegov_sc WHERE cod_ibge=$1 AND dt_inicio IS NOT NULL GROUP BY 1 ORDER BY 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT c.valor_total_repasse v, c.situacao s, c.orgao_repassador o, p.nome FROM captacao_transferegov_sc c LEFT JOIN programas_transferegov p ON p.id_programa=c.id_programa WHERE c.cod_ibge=$1 ORDER BY v DESC NULLS LAST LIMIT 15`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT id_programa id, nome, orgao, objetivo, descricao, modalidade, coalesce(valor_global,0) valor, fundo, natureza_despesa, acao_orcamentaria, coalesce(valor_acao,0) valor_acao, coalesce(parcelas,0) parcelas, situacao, ano, codigo, to_char(dt_ini_vol,'YYYY-MM-DD') dt_ini_vol, to_char(dt_fim_vol,'YYYY-MM-DD') dt_fim_vol, (dt_fim_vol - CURRENT_DATE) dias FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE ORDER BY dt_fim_vol LIMIT 30`).catch(() => []),
    query<Record<string, unknown>>(`SELECT coalesce(avg(t),0) media, coalesce(max(t),0) maxv FROM (SELECT cod_ibge, sum(valor_total_repasse) t FROM captacao_transferegov_sc GROUP BY cod_ibge) s`).catch(() => []),
    query<Record<string, unknown>>(`SELECT e.nome, sum(c.valor_total_repasse) v FROM captacao_transferegov_sc c JOIN entes_sc e ON e.cod_ibge=c.cod_ibge GROUP BY e.nome ORDER BY v DESC NULLS LAST LIMIT 5`).catch(() => []),
    query<Record<string, unknown>>(`SELECT (SELECT count(*) FROM programas_transferegov) np, (SELECT count(*) FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE) na, (SELECT coalesce(sum(valor_total_repasse),0) FROM captacao_transferegov_sc) tsc, (SELECT count(distinct cod_ibge) FROM captacao_transferegov_sc) nm`).catch(() => []),
    query<Record<string, unknown>>(`SELECT (SELECT count(*)+1 FROM (SELECT cod_ibge, sum(valor_total_repasse) t FROM captacao_transferegov_sc GROUP BY cod_ibge) s WHERE t > (SELECT coalesce(sum(valor_total_repasse),0) FROM captacao_transferegov_sc WHERE cod_ibge=$1)) pos, (SELECT count(*) FROM programas_transferegov p WHERE dt_fim_vol >= CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM captacao_transferegov_sc c WHERE c.cod_ibge=$1 AND c.id_programa=p.id_programa)) naocap`, [cod]).catch(() => []),
  ]);
  const total = num(tot[0]?.total);
  if (!tot.length || (num(tot[0]?.n) === 0 && !abertos.length)) return null;
  const anos = porAno.map((r) => ({ ano: num(r.ano), valor: num(r.v) }));
  const media = num(bench[0]?.media), maxv = num(bench[0]?.maxv);
  const tendencia = anos.length >= 2 ? { delta: anos[anos.length - 1].valor - anos[anos.length - 2].valor, ultimoAno: anos[anos.length - 1].ano } : null;
  const concentracaoTop = porOrgao.length && total > 0 ? { orgao: String(porOrgao[0].o || "—"), pct: (num(porOrgao[0].v) / total) * 100 } : null;
  return {
    totalCaptado: total, nPlanos: num(tot[0]?.n),
    porOrgao: porOrgao.map((r) => ({ orgao: String(r.o || "—"), valor: num(r.v), n: num(r.n) })),
    porAno: anos,
    lista: lista.map((r) => ({ nome: String(r.nome || r.o || "Programa"), orgao: String(r.o || ""), valor: num(r.v), situacao: String(r.s || "") })),
    abertos: abertos.map((r) => ({ id: String(r.id), nome: String(r.nome || ""), orgao: String(r.orgao || ""), objetivo: String(r.objetivo || ""), descricao: String(r.descricao || ""), valor: num(r.valor), modalidade: String(r.modalidade || ""), fundo: String(r.fundo || ""), naturezaDespesa: String(r.natureza_despesa || ""), acaoOrcamentaria: String(r.acao_orcamentaria || ""), valorAcao: num(r.valor_acao), parcelas: num(r.parcelas), situacao: String(r.situacao || ""), ano: num(r.ano), codigo: String(r.codigo || ""), dtIni: (r.dt_ini_vol as string) || null, dtFim: (r.dt_fim_vol as string) || null, dias: r.dias != null ? num(r.dias) : null })),
    benchmark: { media: num(bench[0]?.media), max: num(bench[0]?.maxv), melhores: melhores.map((r) => ({ nome: String(r.nome), valor: num(r.v) })) },
    universo: { nProgramas: num(uni[0]?.np), nAbertos: num(uni[0]?.na), totalSC: num(uni[0]?.tsc), nMunicipios: num(uni[0]?.nm) },
    analises: {
      posicao: num(an[0]?.pos), totalEntes: num(uni[0]?.nm),
      gapMedia: Math.max(0, media - total), gapMax: Math.max(0, maxv - total),
      tendencia, naoCaptados: num(an[0]?.naocap), concentracaoTop,
    },
  };
}

// Oportunidades de Captação — catálogo de programas relevantes a municípios: ABERTOS (poderá acessar) e
// ENCERRADOS recentes (poderia ter acessado). Base do Radar (consciência da oportunidade).
export type OportunidadesSC = {
  totalAbertos: number; totalEncerrados: number;
  abertos: { id: string; nome: string; orgao: string; modalidade: string; dtFim: string | null; dias: number | null }[];
  encerrados: { id: string; nome: string; orgao: string; dtFim: string | null }[];
  porOrgao: { orgao: string; n: number }[];
} | null;
export async function getOportunidadesCaptacaoSC(): Promise<OportunidadesSC> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id_programa, nome_programa, orgao, modalidade, dt_fim_prop, (dt_fim_prop - CURRENT_DATE) AS dias
     FROM programas_catalogo WHERE dt_fim_prop IS NOT NULL`).catch(() => []);
  if (!rows.length) return null;
  const abertosR = rows.filter((r) => num(r.dias) >= 0).sort((a, b) => num(a.dias) - num(b.dias));
  const encR = rows.filter((r) => num(r.dias) < 0 && num(r.dias) >= -1095).sort((a, b) => num(b.dias) - num(a.dias)); // até 3 anos
  const orgMap = new Map<string, number>();
  for (const r of abertosR) { const o = String(r.orgao || "—"); orgMap.set(o, (orgMap.get(o) || 0) + 1); }
  return {
    totalAbertos: abertosR.length, totalEncerrados: encR.length,
    abertos: abertosR.slice(0, 40).map((r) => ({ id: String(r.id_programa), nome: String(r.nome_programa || ""), orgao: String(r.orgao || ""), modalidade: String(r.modalidade || ""), dtFim: (r.dt_fim_prop as string) || null, dias: num(r.dias) })),
    encerrados: encR.slice(0, 40).map((r) => ({ id: String(r.id_programa), nome: String(r.nome_programa || ""), orgao: String(r.orgao || ""), dtFim: (r.dt_fim_prop as string) || null })),
    porOrgao: [...orgMap.entries()].map(([orgao, n]) => ({ orgao, n })).sort((a, b) => b.n - a.n).slice(0, 8),
  };
}

// Radar de Captação — programas que o município PODE captar (elegibilidade SICONV) + janela de proposta
export type RadarCaptacaoSC = {
  total: number; abertos: number;
  porOrgao: { orgao: string; n: number }[];
  oportunidades: { nome: string; orgao: string; modalidade: string; dtFim: string | null; dias: number | null }[];
} | null;
export async function getRadarCaptacaoSC(cod: string): Promise<RadarCaptacaoSC> {
  const rows = await query<Record<string, unknown>>(
    `SELECT nome_programa, orgao, modalidade, dt_fim_prop, (dt_fim_prop - CURRENT_DATE) AS dias
     FROM radar_captacao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const total = rows.length;
  const abertasRows = rows.filter((r) => r.dias != null && num(r.dias) >= 0);
  const orgMap = new Map<string, number>();
  for (const r of rows) { const o = String(r.orgao || "—"); orgMap.set(o, (orgMap.get(o) || 0) + 1); }
  const porOrgao = [...orgMap.entries()].map(([orgao, n]) => ({ orgao, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const oportunidades = abertasRows
    .map((r) => ({ nome: String(r.nome_programa || ""), orgao: String(r.orgao || ""), modalidade: String(r.modalidade || ""), dtFim: (r.dt_fim_prop as string) || null, dias: r.dias != null ? num(r.dias) : null }))
    .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9)).slice(0, 30);
  return { total, abertos: abertasRows.length, porOrgao, oportunidades };
}

// Censo Escolar — matrículas por etapa (produção da cadeia educação) (INEP Sinopse)
export type CensoMatriculaSC = { ano: number; total: number; etapas: { etapa: string; matriculas: number }[] } | null;
export async function getCensoMatriculaSC(cod: string): Promise<CensoMatriculaSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, etapa, matriculas FROM censo_matricula_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ano = Math.max(...rows.map((r) => num(r.ano)));
  const doAno = rows.filter((r) => num(r.ano) === ano);
  const total = num(doAno.find((r) => String(r.etapa) === "Total")?.matriculas);
  const ORDEM = ["Educação Infantil", "Creche", "Pré-Escola", "Ensino Fundamental", "Anos Iniciais", "Anos Finais", "Ensino Médio", "Educação Profissional", "EJA", "Educação Especial"];
  const etapas = ORDEM.map((e) => { const r = doAno.find((x) => String(x.etapa) === e); return r ? { etapa: e, matriculas: num(r.matriculas) } : null; }).filter(Boolean) as { etapa: string; matriculas: number }[];
  return { ano, total, etapas };
}

// IDEB por etapa (Anos Iniciais/Finais/EM) — observado × meta + série histórica (INEP)
export type IdebSC = { etapas: { etapa: string; label: string; rede: string; atual: { ano: number; ideb: number; meta: number | null } | null; serie: { ano: number; ideb: number; meta: number | null }[]; cumpriu: boolean | null }[] } | null;
export async function getIdebSC(cod: string): Promise<IdebSC> {
  const rows = await query<Record<string, unknown>>(`SELECT etapa, rede, ano, ideb, meta FROM ideb_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const LBL: Record<string, string> = { AI: "Anos Iniciais (1º–5º)", AF: "Anos Finais (6º–9º)", EM: "Ensino Médio" };
  const PREF = ["Municipal", "Pública", "Estadual"]; // preferência de rede por etapa
  const etapas = ["AI", "AF", "EM"].map((et) => {
    const doEt = rows.filter((r) => String(r.etapa) === et);
    if (!doEt.length) return null;
    const rede = PREF.find((p) => doEt.some((r) => String(r.rede) === p)) || String(doEt[0].rede);
    const serie = doEt.filter((r) => String(r.rede) === rede).map((r) => ({ ano: num(r.ano), ideb: num(r.ideb), meta: r.meta != null ? num(r.meta) : null })).sort((a, b) => a.ano - b.ano);
    if (!serie.length) return null;
    const atual = serie[serie.length - 1];
    return { etapa: et, label: LBL[et], rede, atual, serie, cumpriu: atual.meta != null ? atual.ideb >= atual.meta : null };
  }).filter(Boolean) as NonNullable<IdebSC>["etapas"];
  return etapas.length ? { etapas } : null;
}

// Economicidade (preço unitário estimado → homologado). Métrica = MEDIANA por item (robusta a erros e a atas).
// Separada POR MODALIDADE (via join a processos): competição (pregão/concorrência) gera economia; dispensa/inexig. ~0.
// Exclui erros: homologado>estimado e economia>95% (estimado absurdo / homologado ≈ 0). Não somamos R$ absoluto
// (a base inclui registro de preço — quantidade máxima registrada ≠ efetivamente comprada).
export type EconomicidadeSC = { economiaMediana: number | null; nItens: number; nOutliers: number; porModalidade: { modalidade: string; mediana: number; n: number }[] } | null;
export async function getEconomicidadeSC(cod: string): Promise<EconomicidadeSC> {
  const COND = `i.unit_homologado IS NOT NULL AND i.unit_estimado IS NOT NULL AND i.unit_estimado>0 AND i.quantidade>0 AND i.unit_homologado<=i.unit_estimado AND (i.unit_estimado-i.unit_homologado)/i.unit_estimado <= 0.95`;
  const g = (await query<Record<string, unknown>>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (i.unit_estimado-i.unit_homologado)/i.unit_estimado*100) mediana, COUNT(*) n
     FROM itens_sc i WHERE i.cod_ibge=$1 AND ${COND}`, [cod]).catch(() => []))[0];
  if (!g || num(g.n) === 0) return null;
  const out = (await query<Record<string, unknown>>(`SELECT COUNT(*) n FROM itens_sc i WHERE i.cod_ibge=$1 AND i.unit_homologado IS NOT NULL AND i.unit_estimado>0 AND (i.unit_homologado>i.unit_estimado OR (i.unit_estimado-i.unit_homologado)/NULLIF(i.unit_estimado,0)>0.95)`, [cod]).catch(() => [{ n: 0 }]))[0];
  const mod = await query<Record<string, unknown>>(
    `SELECT p.modalidade, percentile_cont(0.5) WITHIN GROUP (ORDER BY (i.unit_estimado-i.unit_homologado)/i.unit_estimado*100) mediana, COUNT(*) n
     FROM itens_sc i JOIN processos_sc p ON p.cnpj_orgao=i.cnpj AND p.ano=i.ano AND p.sequencial=i.seq
     WHERE i.cod_ibge=$1 AND ${COND} GROUP BY p.modalidade HAVING COUNT(*)>=20 ORDER BY COUNT(*) DESC`, [cod]).catch(() => []);
  return {
    economiaMediana: g.mediana != null ? num(g.mediana) : null,
    nItens: num(g.n), nOutliers: num(out?.n),
    porModalidade: mod.map((m) => ({ modalidade: String(m.modalidade), mediana: num(m.mediana), n: num(m.n) })),
  };
}

// Itens vinculados aos maiores contratos (contrato → processo via cnpj/ano/seq → itens_sc)
export type ContratoComItens = { objeto: string; fornecedor: string; valor: number; assinatura: string | null; vigInicio: string | null; vigFim: string | null; itens: { descricao: string; quantidade: number; est: number | null; hom: number | null; situacao: string | null; lc123: boolean; porte: string | null; fornecedor: string | null }[] };
export async function getContratosComItensSC(cod: string): Promise<ContratoComItens[]> {
  const rows = await query<Record<string, unknown>>(
    `WITH topc AS (
       SELECT cnpj_compra, ano_compra, seq_compra, objeto, fornecedor, valor_global, assinatura, vig_inicio, vig_fim
       FROM contratos_sc WHERE cod_ibge=$1 AND cnpj_compra IS NOT NULL
       ORDER BY valor_global DESC NULLS LAST LIMIT 15)
     SELECT t.objeto, t.fornecedor, t.valor_global, t.assinatura, t.vig_inicio, t.vig_fim, t.cnpj_compra, t.ano_compra, t.seq_compra,
            i.descricao, i.quantidade, i.unit_homologado, i.unit_estimado, i.situacao, i.beneficio_lc, i.porte_fornecedor, i.fornecedor AS item_fornecedor
     FROM topc t LEFT JOIN itens_sc i ON i.cnpj=t.cnpj_compra AND i.ano=t.ano_compra AND i.seq=t.seq_compra
     ORDER BY t.valor_global DESC NULLS LAST, i.unit_homologado DESC NULLS LAST`, [cod]).catch(() => []);
  const map = new Map<string, ContratoComItens>();
  const lcBenef = (v: unknown) => { const s = String(v || "").toLowerCase(); return /me\/epp|micro|pequen|\bepp\b|\bme\b|cooperativa/.test(s); };
  for (const r of rows) {
    const k = `${r.cnpj_compra}-${r.ano_compra}-${r.seq_compra}`;
    if (!map.has(k)) map.set(k, { objeto: String(r.objeto || ""), fornecedor: String(r.fornecedor || ""), valor: num(r.valor_global), assinatura: (r.assinatura as string) || null, vigInicio: (r.vig_inicio as string) || null, vigFim: (r.vig_fim as string) || null, itens: [] });
    if (r.descricao && map.get(k)!.itens.length < 12) map.get(k)!.itens.push({ descricao: String(r.descricao), quantidade: num(r.quantidade), est: r.unit_estimado != null ? num(r.unit_estimado) : null, hom: r.unit_homologado != null ? num(r.unit_homologado) : null, situacao: (r.situacao as string) || null, lc123: lcBenef(r.beneficio_lc) || lcBenef(r.porte_fornecedor), porte: (r.porte_fornecedor as string) || null, fornecedor: (r.item_fornecedor as string) || null });
  }
  return [...map.values()];
}

// Padrões de compras (planejamento) — sazonalidade, modalidades, taxa de sucesso, série anual (processos_sc)
export type PadroesComprasSC = {
  totalN: number; totalValor: number;
  porModalidade: { modalidade: string; n: number; valor: number; pct: number }[];
  porMes: { mes: number; n: number }[];
  serieAnual: { ano: number; n: number; valor: number }[];
  dispensaPct: number; q4Pct: number; mesPico: number;
} | null;
export async function getPadroesComprasSC(cod: string): Promise<PadroesComprasSC> {
  const rows = await query<Record<string, unknown>>(`SELECT modalidade, valor_estimado, data_pub, ano FROM processos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const totalN = rows.length;
  const totalValor = rows.reduce((s, r) => s + num(r.valor_estimado), 0);
  const mod = new Map<string, { n: number; valor: number }>();
  const mes = new Map<number, number>();
  const ano = new Map<number, { n: number; valor: number }>();
  let dispensaN = 0, q4N = 0;
  for (const r of rows) {
    const m = String(r.modalidade || "—"); const v = num(r.valor_estimado);
    const cur = mod.get(m) || { n: 0, valor: 0 }; cur.n++; cur.valor += v; mod.set(m, cur);
    if (/dispensa|inexig/i.test(m)) dispensaN++;
    const a = num(r.ano); const ca = ano.get(a) || { n: 0, valor: 0 }; ca.n++; ca.valor += v; ano.set(a, ca);
    const d = r.data_pub ? new Date(String(r.data_pub)) : null;
    if (d && !isNaN(d.getTime())) { const mm = d.getUTCMonth() + 1; mes.set(mm, (mes.get(mm) || 0) + 1); if (mm >= 10) q4N++; }
  }
  const porModalidade = [...mod.entries()].map(([modalidade, x]) => ({ modalidade, n: x.n, valor: x.valor, pct: (x.n / totalN) * 100 })).sort((a, b) => b.n - a.n);
  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, n: mes.get(i + 1) || 0 }));
  const serieAnual = [...ano.entries()].map(([ano, x]) => ({ ano, n: x.n, valor: x.valor })).sort((a, b) => a.ano - b.ano);
  const mesPico = porMes.reduce((mx, c) => (c.n > mx.n ? c : mx), porMes[0]).mes;
  return { totalN, totalValor, porModalidade, porMes, serieAnual, dispensaPct: (dispensaN / totalN) * 100, q4Pct: (q4N / totalN) * 100, mesPico };
}

// Receitas detalhadas por item nominal (ICMS, FPM, IPTU, ISS, IPVA, ITR, FUNDEB) — série anual
// Análise de compras por ITEM (descritivo, sem CATMAT) — mais comprados + variação de preço vs pares de SC (sobrepreço/economia).
const _NORM_ITEM = `trim(regexp_replace(upper(regexp_replace(translate(descricao,'ÁÀÃÂÉÊÍÓÔÕÚÜÇáàãâéêíóôõúüç','AAAAEEIOOOUUCAAAAEEIOOOUUC'),'[^A-Za-z0-9 ]',' ','g')),'\\s+',' ','g'))`;
export type AnaliseComprasItens = {
  maisComprados: { item: string; unidade: string; valor: number; qtd: number; precoMun: number; mediana: number | null; nMuns: number | null; variacaoPct: number | null }[];
  sobrepreco: { item: string; unidade: string; qtd: number; precoMun: number; mediana: number; nMuns: number; acimaPct: number; economia: number }[];
  economiaTotal: number;
  atas: { nItens: number; valorRegistrado: number } | null;
  comparacao: { item: string; unidade: string; precoAta: number; precoEf: number; diffPct: number }[];
  sazonalidade: { mes: number; n: number; valor: number }[];
  tempo: { diasMedio: number; n: number; porModalidade: { modalidade: string; dias: number; n: number }[] } | null;
} | null;
// EXISTS de processo que gerou ata (registro de preço) — compra NÃO certa
const _ATA = `EXISTS (SELECT 1 FROM processos_ata_sc a WHERE a.cnpj=i.cnpj AND a.ano=i.ano AND a.seq=i.seq)`;
export async function getAnaliseComprasItensSC(cod: string): Promise<AnaliseComprasItens> {
  const [mais, sobre, atas, comp, saz, tempo] = await Promise.all([
    // 30 mais comprados (efetivadas) + variação de preço vs mediana SC
    query<Record<string, unknown>>(`WITH mi AS (
        SELECT ${_NORM_ITEM} k, unidade, sum(quantidade*unit_homologado) valor, sum(quantidade) qtd, sum(quantidade*unit_homologado)/NULLIF(sum(quantidade),0) preco_mun
        FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND descricao IS NOT NULL AND NOT ${_ATA}
        GROUP BY 1,2 ORDER BY valor DESC NULLS LAST LIMIT 30)
      SELECT mi.k, mi.unidade, mi.valor, mi.qtd, mi.preco_mun, r.mediana, r.n_muns,
        round((((mi.preco_mun-r.mediana)/NULLIF(r.mediana,0))*100)::numeric) variacao
      FROM mi LEFT JOIN precos_referencia_sc r ON r.k=mi.k AND r.unidade=mi.unidade ORDER BY mi.valor DESC`, [cod]).catch(() => []),
    // sobrepreço — efetivadas acima do p75 dos pares
    query<Record<string, unknown>>(`WITH mi AS (
        SELECT ${_NORM_ITEM} k, unidade, sum(quantidade) qtd, sum(quantidade*unit_homologado)/NULLIF(sum(quantidade),0) preco_mun
        FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND descricao IS NOT NULL AND NOT ${_ATA} GROUP BY 1,2)
      SELECT mi.k item, mi.unidade, mi.qtd, mi.preco_mun, r.mediana, r.n_muns,
        round((((mi.preco_mun-r.mediana)/NULLIF(r.mediana,0))*100)::numeric) acima_pct, ((mi.preco_mun-r.mediana)*mi.qtd) economia
      FROM mi JOIN precos_referencia_sc r ON r.k=mi.k AND r.unidade=mi.unidade
      WHERE mi.preco_mun > r.p75 AND (mi.preco_mun-r.mediana)*mi.qtd > 1000
      ORDER BY economia DESC NULLS LAST LIMIT 25`, [cod]).catch(() => []),
    // atas — registro de preço (grupo "não certa")
    query<Record<string, unknown>>(`SELECT count(distinct (${_NORM_ITEM}||'|'||unidade)) n_itens, sum(quantidade*unit_homologado) valor
      FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND descricao IS NOT NULL AND ${_ATA}`, [cod]).catch(() => []),
    // comparação ENTRE os dois grupos: mesmo item com preço em ATA e em EFETIVADA
    query<Record<string, unknown>>(`WITH ata AS (SELECT ${_NORM_ITEM} k, unidade, sum(quantidade*unit_homologado)/NULLIF(sum(quantidade),0) p_ata, sum(quantidade*unit_homologado) v FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND ${_ATA} GROUP BY 1,2),
        ef AS (SELECT ${_NORM_ITEM} k, unidade, sum(quantidade*unit_homologado)/NULLIF(sum(quantidade),0) p_ef FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND NOT ${_ATA} GROUP BY 1,2)
      SELECT a.k item, a.unidade, a.p_ata, e.p_ef, round((((e.p_ef-a.p_ata)/NULLIF(a.p_ata,0))*100)::numeric) diff
      FROM ata a JOIN ef e ON e.k=a.k AND e.unidade=a.unidade WHERE a.p_ata>0 AND e.p_ef>0 ORDER BY a.v DESC NULLS LAST LIMIT 12`, [cod]).catch(() => []),
    // sazonalidade — contratações efetivadas por mês (assinatura)
    query<Record<string, unknown>>(`SELECT extract(month from assinatura)::int mes, count(*) n, coalesce(sum(valor_global),0) valor
      FROM contratos_sc WHERE cod_ibge=$1 AND assinatura IS NOT NULL GROUP BY 1 ORDER BY 1`, [cod]).catch(() => []),
    // tempo do processo: publicação (processos_sc.data_pub) → contrato (contratos_sc.assinatura), por modalidade
    query<Record<string, unknown>>(`SELECT p.modalidade, round(avg(c.assinatura - p.data_pub)) dias, count(*) n
      FROM contratos_sc c JOIN processos_sc p ON p.numero_controle=c.numero_controle_compra
      WHERE c.cod_ibge=$1 AND c.assinatura IS NOT NULL AND p.data_pub IS NOT NULL AND c.assinatura >= p.data_pub AND (c.assinatura - p.data_pub) < 730
      GROUP BY 1 ORDER BY n DESC`, [cod]).catch(() => []),
  ]);
  if (!mais.length && !sobre.length && !comp.length) return null;
  const sobrepreco = sobre.map((r) => ({ item: String(r.item || ""), unidade: String(r.unidade || ""), qtd: num(r.qtd), precoMun: num(r.preco_mun), mediana: num(r.mediana), nMuns: num(r.n_muns), acimaPct: num(r.acima_pct), economia: num(r.economia) }));
  const a0 = atas[0];
  return {
    maisComprados: mais.map((r) => ({ item: String(r.k || ""), unidade: String(r.unidade || ""), valor: num(r.valor), qtd: num(r.qtd), precoMun: num(r.preco_mun), mediana: r.mediana != null ? num(r.mediana) : null, nMuns: r.n_muns != null ? num(r.n_muns) : null, variacaoPct: r.variacao != null ? num(r.variacao) : null })),
    sobrepreco, economiaTotal: sobrepreco.reduce((s, x) => s + x.economia, 0),
    atas: a0 && num(a0.n_itens) > 0 ? { nItens: num(a0.n_itens), valorRegistrado: num(a0.valor) } : null,
    comparacao: comp.map((r) => ({ item: String(r.item || ""), unidade: String(r.unidade || ""), precoAta: num(r.p_ata), precoEf: num(r.p_ef), diffPct: num(r.diff) })),
    sazonalidade: saz.map((r) => ({ mes: num(r.mes), n: num(r.n), valor: num(r.valor) })),
    tempo: tempo.length ? { diasMedio: Math.round(tempo.reduce((s, r) => s + num(r.dias) * num(r.n), 0) / Math.max(1, tempo.reduce((s, r) => s + num(r.n), 0))), n: tempo.reduce((s, r) => s + num(r.n), 0), porModalidade: tempo.map((r) => ({ modalidade: String(r.modalidade || ""), dias: num(r.dias), n: num(r.n) })) } : null,
  };
}

// Tendência histórica da rede municipal (Censo escola×ano) — matrículas, docentes, perfil ao longo dos anos.
export type CensoTendenciaSC = {
  pontos: { ano: number; escolas: number; matriculas: number; docentes: number; alunoPorDoc: number | null; negrosPct: number; especialPct: number; integralPct: number }[];
} | null;
export async function getCensoTendenciaSC(cod: string): Promise<CensoTendenciaSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, count(*) escolas, coalesce(sum(matriculas),0) mat, coalesce(sum(docentes),0) doc,
    coalesce(sum((perfil->>'preta')::int),0)+coalesce(sum((perfil->>'parda')::int),0) negros, coalesce(sum((perfil->>'especial')::int),0) esp, coalesce(sum((perfil->>'integral')::int),0) integ
    FROM escolas_hist_sc WHERE cod_ibge=$1 AND dependencia=3 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []);
  if (rows.length < 2) return null; // série só faz sentido com ≥2 anos
  const pontos = rows.map((r) => {
    const mat = num(r.mat), doc = num(r.doc);
    const pc = (v: number) => (mat > 0 ? Math.round((v / mat) * 1000) / 10 : 0);
    return { ano: num(r.ano), escolas: num(r.escolas), matriculas: mat, docentes: doc, alunoPorDoc: doc > 0 ? Math.round((mat / doc) * 10) / 10 : null, negrosPct: pc(num(r.negros)), especialPct: pc(num(r.esp)), integralPct: pc(num(r.integ)) };
  });
  return { pontos };
}

// Fornecedores do município (PNCP) — concentração, ME/EPP (fomento local), de fora do município/SC (vazamento), recorrentes.
export type FornecedoresSC = {
  total: number; nForn: number; concentracaoTop5: number; meEppPct: number; localPct: number; foraScPct: number;
  top: { nome: string; valor: number; processos: number; porte: string; origem: "local" | "sc" | "fora" | "?" }[];
} | null;
export async function getFornecedoresSC(cod: string): Promise<FornecedoresSC> {
  const enteNome = String((await query<Record<string, unknown>>(`SELECT nome FROM entes_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0]?.nome || "");
  const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
  const enteN = norm(enteNome);
  const rows = await query<Record<string, unknown>>(`SELECT i.cnpj_fornecedor cnpj, max(i.fornecedor) nome, max(i.porte_fornecedor) porte,
      sum(i.quantidade*i.unit_homologado) valor, count(distinct concat(i.cnpj,'-',i.ano,'-',i.seq)) proc, max(l.uf) uf, max(l.municipio) mun
    FROM itens_sc i LEFT JOIN cnpj_loc l ON l.cnpj=i.cnpj_fornecedor
    WHERE i.cod_ibge=$1 AND i.unit_homologado>0 AND i.quantidade>0 AND i.quantidade*i.unit_homologado<=200000000 AND i.cnpj_fornecedor IS NOT NULL AND i.cnpj_fornecedor<>''
    GROUP BY 1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + num(r.valor), 0);
  const origem = (r: Record<string, unknown>): "local" | "sc" | "fora" | "?" => { const uf = String(r.uf || ""); if (!uf) return "?"; if (uf !== "SC") return "fora"; return enteN && norm(String(r.mun || "")) === enteN ? "local" : "sc"; };
  const sorted = [...rows].sort((a, b) => num(b.valor) - num(a.valor));
  const top5 = sorted.slice(0, 5).reduce((s, r) => s + num(r.valor), 0);
  const meEpp = rows.filter((r) => /micro|pequen|epp|^me$/i.test(String(r.porte || ""))).reduce((s, r) => s + num(r.valor), 0);
  const local = rows.filter((r) => origem(r) === "local").reduce((s, r) => s + num(r.valor), 0);
  const fora = rows.filter((r) => origem(r) === "fora").reduce((s, r) => s + num(r.valor), 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return {
    total, nForn: rows.length, concentracaoTop5: pct(top5), meEppPct: pct(meEpp), localPct: pct(local), foraScPct: pct(fora),
    top: sorted.slice(0, 12).map((r) => ({ nome: String(r.nome || ""), valor: num(r.valor), processos: num(r.proc), porte: String(r.porte || ""), origem: origem(r) })),
  };
}

// Curva ABC (concentração do gasto) + dispersão de preço entre municípios (onde o "preço único" mais falha = oportunidade).
export type ComprasExtra = {
  abc: { totalItens: number; totalValor: number; a: { n: number; pct: number }; b: { n: number; pct: number }; c: { n: number; pct: number } } | null;
  dispersao: { item: string; unidade: string; p25: number; mediana: number; p75: number; ratio: number; nMuns: number }[];
} | null;
export async function getComprasExtraSC(cod: string): Promise<ComprasExtra> {
  const [itens, disp] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ${_NORM_ITEM} k, sum(quantidade*unit_homologado) valor
      FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND descricao IS NOT NULL AND NOT ${_ATA}
      GROUP BY 1 ORDER BY valor DESC NULLS LAST`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mi AS (SELECT ${_NORM_ITEM} k, unidade FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND NOT ${_ATA} GROUP BY 1,2)
      SELECT mi.k item, mi.unidade, r.p25, r.mediana, r.p75, r.n_muns, round((r.p75/NULLIF(r.p25,0))::numeric,1) ratio
      FROM mi JOIN precos_referencia_sc r ON r.k=mi.k AND r.unidade=mi.unidade WHERE r.p25>0 AND r.p75/r.p25 >= 1.5
      ORDER BY r.p75/NULLIF(r.p25,0) DESC NULLS LAST LIMIT 15`, [cod]).catch(() => []),
  ]);
  let abc = null;
  if (itens.length) {
    const total = itens.reduce((s, r) => s + num(r.valor), 0);
    let cum = 0, a = 0, b = 0, c = 0;
    for (const r of itens) { cum += num(r.valor); const p = cum / total; if (p <= 0.8) a++; else if (p <= 0.95) b++; else c++; }
    const n = itens.length;
    abc = { totalItens: n, totalValor: total, a: { n: a, pct: Math.round((a / n) * 100) }, b: { n: b, pct: Math.round((b / n) * 100) }, c: { n: c, pct: Math.round((c / n) * 100) } };
  }
  return {
    abc,
    dispersao: disp.map((r) => ({ item: String(r.item || ""), unidade: String(r.unidade || ""), p25: num(r.p25), mediana: num(r.mediana), p75: num(r.p75), ratio: num(r.ratio), nMuns: num(r.n_muns) })),
  };
}

// Pesquisa de PREÇO DE REFERÊNCIA (Lei 14.133) — gestor digita o item → preço justo (mediana SC + faixa) p/ o edital.
export type PesquisaPreco = { item: string; unidade: string; mediana: number; p25: number; p75: number; nMuns: number; nCompras: number; min: number; max: number }[];
export async function getPesquisaPrecoSC(termo: string): Promise<PesquisaPreco> {
  const t = String(termo || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const termos = t.split(" ").filter((w) => w.length >= 3).slice(0, 5);
  if (!termos.length) return [];
  const conds = termos.map((_, i) => `k ILIKE '%'||$${i + 1}||'%'`).join(" AND ");
  const rows = await query<Record<string, unknown>>(`SELECT k, unidade, mediana, p25, p75, n_muns, n_compras, preco_min, preco_max FROM precos_referencia_sc WHERE ${conds} ORDER BY n_compras DESC NULLS LAST LIMIT 40`, termos).catch(() => []);
  return rows.map((r) => ({ item: String(r.k || ""), unidade: String(r.unidade || ""), mediana: num(r.mediana), p25: num(r.p25), p75: num(r.p75), nMuns: num(r.n_muns), nCompras: num(r.n_compras), min: num(r.preco_min), max: num(r.preco_max) }));
}

// Sazonalidade de PREÇO por categoria (SC) — melhor mês de compra por grupo (índice relativo; 100 = preço típico).
export type SazonalidadePreco = { categoria: string; meses: { mes: number; indice: number; n: number }[]; melhorMes: number; melhorIndice: number }[];
export async function getSazonalidadePrecoSC(): Promise<SazonalidadePreco> {
  const rows = await query<Record<string, unknown>>(`SELECT categoria, mes, indice, n FROM sazonalidade_preco_sc WHERE n >= 10 ORDER BY categoria, mes`).catch(() => []);
  if (!rows.length) return [];
  const byCat = new Map<string, { mes: number; indice: number; n: number }[]>();
  for (const r of rows) { const c = String(r.categoria); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push({ mes: num(r.mes), indice: num(r.indice), n: num(r.n) }); }
  return [...byCat.entries()].map(([categoria, meses]) => {
    const best = [...meses].sort((a, b) => a.indice - b.indice)[0];
    return { categoria, meses, melhorMes: best.mes, melhorIndice: best.indice };
  }).sort((a, b) => a.melhorIndice - b.melhorIndice);
}

// Emendas parlamentares por município (SICONV/Transferegov — convênios). Valor, impositivas, por parlamentar.
export type EmendasSC = {
  total: number; n: number; impositivas: number; valorImpositivo: number;
  porParlamentar: { parlamentar: string; valor: number; n: number }[];
} | null;
export async function getEmendasSC(cod: string): Promise<EmendasSC> {
  const [tot, parl] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor_emenda),0) total, count(*) FILTER(WHERE impositivo) impos, coalesce(sum(valor_emenda) FILTER(WHERE impositivo),0) vimp FROM emendas_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT parlamentar, coalesce(sum(valor_emenda),0) valor, count(*) n FROM emendas_sc WHERE cod_ibge=$1 AND parlamentar<>'' GROUP BY 1 ORDER BY valor DESC NULLS LAST LIMIT 8`, [cod]).catch(() => []),
  ]);
  if (!tot.length || num(tot[0]?.n) === 0) return null;
  return {
    total: num(tot[0].total), n: num(tot[0].n), impositivas: num(tot[0].impos), valorImpositivo: num(tot[0].vimp),
    porParlamentar: parl.map((r) => ({ parlamentar: String(r.parlamentar || ""), valor: num(r.valor), n: num(r.n) })),
  };
}

// Estabelecimentos de saúde do município (CNES) — rede completa para regulação: cada unidade + composição da rede.
export type EstabSaudeSC = {
  total: number; comGeo: number;
  natureza: { publico: number; privado: number; filantropico: number };
  capacidade: { hospitalar: number; cirurgico: number; obstetrico: number; sus: number };
  porTipo: { tipo: string; n: number }[];
  lista: { nome: string; tipo: string; tipoCodigo: number; natureza: string; gestao: string; esfera: string; sus: boolean; hospitalar: boolean; cirurgico: boolean; obstetrico: boolean; lat: number | null; lon: number | null; bairro: string }[];
} | null;
export async function getEstabSaudeSC(cod: string): Promise<EstabSaudeSC> {
  const rows = await query<Record<string, unknown>>(`SELECT nome, tipo, tipo_codigo, natureza_grupo, gestao, esfera, sus_ambulatorial, hospitalar, centro_cirurgico, centro_obstetrico, latitude, longitude, bairro FROM estabelecimentos_saude_sc WHERE cod_ibge=$1 ORDER BY (natureza_grupo='Público') DESC, hospitalar DESC, nome`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const b = (v: unknown) => v === true;
  const porTipoMap = new Map<string, number>();
  for (const r of rows) { const t = String(r.tipo || "Outro"); porTipoMap.set(t, (porTipoMap.get(t) || 0) + 1); }
  return {
    total: rows.length, comGeo: rows.filter((r) => r.latitude != null).length,
    natureza: { publico: rows.filter((r) => r.natureza_grupo === "Público").length, privado: rows.filter((r) => r.natureza_grupo === "Privado").length, filantropico: rows.filter((r) => r.natureza_grupo === "Filantrópico").length },
    capacidade: { hospitalar: rows.filter((r) => b(r.hospitalar)).length, cirurgico: rows.filter((r) => b(r.centro_cirurgico)).length, obstetrico: rows.filter((r) => b(r.centro_obstetrico)).length, sus: rows.filter((r) => b(r.sus_ambulatorial)).length },
    porTipo: [...porTipoMap.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b2) => b2.n - a.n),
    lista: rows.map((r) => ({ nome: String(r.nome || ""), tipo: String(r.tipo || ""), tipoCodigo: num(r.tipo_codigo), natureza: String(r.natureza_grupo || ""), gestao: String(r.gestao || ""), esfera: String(r.esfera || ""), sus: b(r.sus_ambulatorial), hospitalar: b(r.hospitalar), cirurgico: b(r.centro_cirurgico), obstetrico: b(r.centro_obstetrico), lat: r.latitude != null ? num(r.latitude) : null, lon: r.longitude != null ? num(r.longitude) : null, bairro: String(r.bairro || "") })),
  };
}

// Perfil da rede de saúde (CNES) — estrutura por nível de atenção, público×privado e cobertura per capita.
export type PerfilSaudeSC = {
  total: number; populacao: number; sus: number;
  natureza: { publico: number; privado: number; filantropico: number };
  niveis: { nivel: string; n: number; pub: number }[];
  apsTotal: number; coberturaAPS: number | null; // unidades de atenção primária por 10 mil habitantes
} | null;
const NIVEL_SAUDE: { nivel: string; tipos: number[] }[] = [
  { nivel: "Atenção Primária (UBS/postos)", tipos: [1, 2, 45] },
  { nivel: "Urgência e Emergência (UPA/PS)", tipos: [15, 20, 21, 73] },
  { nivel: "Hospitalar", tipos: [5, 7, 62] },
  { nivel: "Psicossocial (CAPS)", tipos: [70] },
  { nivel: "Especializada e Diagnóstico", tipos: [4, 36, 39, 67, 69, 77, 61] },
];
export async function getPerfilSaudeSC(cod: string): Promise<PerfilSaudeSC> {
  const rows = await query<Record<string, unknown>>(`SELECT tipo_codigo, natureza_grupo, sus_ambulatorial FROM estabelecimentos_saude_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const pop = num((await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0]?.populacao);
  const niveis = NIVEL_SAUDE.map((nv) => {
    const sel = rows.filter((r) => nv.tipos.includes(num(r.tipo_codigo)));
    return { nivel: nv.nivel, n: sel.length, pub: sel.filter((r) => r.natureza_grupo === "Público").length };
  }).filter((x) => x.n > 0);
  const aps = rows.filter((r) => [1, 2, 45].includes(num(r.tipo_codigo))).length;
  return {
    total: rows.length, populacao: pop, sus: rows.filter((r) => r.sus_ambulatorial === true).length,
    natureza: { publico: rows.filter((r) => r.natureza_grupo === "Público").length, privado: rows.filter((r) => r.natureza_grupo === "Privado").length, filantropico: rows.filter((r) => r.natureza_grupo === "Filantrópico").length },
    niveis, apsTotal: aps, coberturaAPS: pop > 0 ? Math.round((aps / (pop / 10000)) * 10) / 10 : null,
  };
}

// Perfil da rede municipal de educação (Censo) — quem é atendido: sexo, raça/cor, idade, inclusão, integral, turmas, transporte.
export type PerfilEducacaoSC = {
  matriculas: number; turmas: number; alunoPorTurma: number | null;
  femPct: number; negrosPct: number; indigenaPct: number; especialPct: number; integralPct: number;
  transpPublico: number; transpMun: number;
  idade: { faixa: string; n: number }[];
} | null;
export async function getPerfilEducacaoSC(cod: string): Promise<PerfilEducacaoSC> {
  const r = (await query<Record<string, unknown>>(`SELECT
    coalesce(sum(matriculas),0) mat, coalesce(sum(n_turmas),0) tur, coalesce(sum(transp_publico),0) tp, coalesce(sum(transp_mun),0) tm,
    coalesce(sum((perfil->>'fem')::int),0) fem, coalesce(sum((perfil->>'preta')::int),0) preta, coalesce(sum((perfil->>'parda')::int),0) parda,
    coalesce(sum((perfil->>'indigena')::int),0) indig, coalesce(sum((perfil->>'especial')::int),0) esp, coalesce(sum((perfil->>'integral')::int),0) integ,
    coalesce(sum((perfil->>'i0_3')::int),0) i0, coalesce(sum((perfil->>'i4_5')::int),0) i1, coalesce(sum((perfil->>'i6_10')::int),0) i2,
    coalesce(sum((perfil->>'i11_14')::int),0) i3, coalesce(sum((perfil->>'i15_17')::int),0) i4, coalesce(sum((perfil->>'i18')::int),0) i5
    FROM escolas_sc WHERE cod_ibge=$1 AND dependencia=3 AND perfil IS NOT NULL`, [cod]).catch(() => []))[0];
  if (!r || num(r.mat) === 0) return null;
  const mat = num(r.mat); const pc = (v: number) => Math.round((v / mat) * 1000) / 10;
  return {
    matriculas: mat, turmas: num(r.tur), alunoPorTurma: num(r.tur) > 0 ? Math.round((mat / num(r.tur)) * 10) / 10 : null,
    femPct: pc(num(r.fem)), negrosPct: pc(num(r.preta) + num(r.parda)), indigenaPct: pc(num(r.indig)), especialPct: pc(num(r.esp)), integralPct: pc(num(r.integ)),
    transpPublico: num(r.tp), transpMun: num(r.tm),
    idade: [{ faixa: "0–3 (creche)", n: num(r.i0) }, { faixa: "4–5 (pré)", n: num(r.i1) }, { faixa: "6–10", n: num(r.i2) }, { faixa: "11–14", n: num(r.i3) }, { faixa: "15–17", n: num(r.i4) }, { faixa: "18+", n: num(r.i5) }].filter((x) => x.n > 0),
  };
}

// Escolas do município (INEP Censo) — drill escola a escola: matrículas + infraestrutura + lacunas. Rede municipal.
export type EscolasSC = {
  ano: number; total: number; matriculas: number; docentes: number; profissionais: number;
  alunoPorDocente: number | null; alunoPorProf: number | null; infraMedia: number;
  lacunas: { semInternet: number; semBiblioteca: number; semQuadra: number; semEsgoto: number; semAcessibilidade: number };
  lista: { nome: string; matriculas: number; docentes: number; profissionais: number; turmas: number; alunoPorTurma: number | null; etapas: { etapa: string; n: number }[]; series: { serie: string; mat: number; tur: number; alunoPorTurma: number | null }[]; especial: number; alunoPorDoc: number | null; infraScore: number; zona: number; lat: number | null; lon: number | null; bairro: string; infra: { agua: boolean; energia: boolean; esgoto: boolean; internet: boolean; biblioteca: boolean; labInfo: boolean; quadra: boolean; refeitorio: boolean; acessibilidade: boolean } }[];
} | null;
// Índice de Infraestrutura (0–100): essenciais pesam 2, complementares 1.
const _infraScore = (i: { agua: boolean; energia: boolean; esgoto: boolean; internet: boolean; biblioteca: boolean; labInfo: boolean; quadra: boolean; refeitorio: boolean; acessibilidade: boolean }) => {
  const W: [boolean, number][] = [[i.agua, 2], [i.energia, 2], [i.esgoto, 2], [i.acessibilidade, 2], [i.internet, 2], [i.biblioteca, 1], [i.quadra, 1], [i.labInfo, 1], [i.refeitorio, 1]];
  const tot = W.reduce((s, [, w]) => s + w, 0);
  return Math.round((W.reduce((s, [v, w]) => s + (v ? w : 0), 0) / tot) * 100);
};
export async function getEscolasSC(cod: string): Promise<EscolasSC> {
  const rows = await query<Record<string, unknown>>(`SELECT s.nome, coalesce(s.matriculas,0) matriculas, coalesce(s.docentes,0) docentes, coalesce(s.profissionais,0) profissionais, coalesce(s.n_turmas,0) n_turmas, s.localizacao, s.latitude, s.longitude, s.bairro, s.ano, s.tem_agua, s.tem_energia, s.tem_esgoto, s.tem_internet, s.tem_biblioteca, s.tem_lab_info, s.tem_quadra, s.tem_refeitorio, s.tem_acessibilidade, s.series, h.modalidade FROM escolas_sc s LEFT JOIN escolas_hist_sc h ON h.co_entidade=s.co_entidade AND h.ano=2025 WHERE s.cod_ibge=$1 AND s.dependencia=3 ORDER BY s.matriculas DESC NULLS LAST`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const b = (v: unknown) => v === true;
  const matriculas = rows.reduce((s, r) => s + num(r.matriculas), 0);
  const docentes = rows.reduce((s, r) => s + num(r.docentes), 0);
  const profissionais = rows.reduce((s, r) => s + num(r.profissionais), 0);
  // etapas REGULARES somam ao total de matrículas; "educação especial" é recorte sobreposto (inclusão) → separado, não somar.
  const ETAPA_LABEL: Record<string, string> = { creche: "Creche", pre: "Pré-escola", fund_ai: "Fundamental — anos iniciais", fund_af: "Fundamental — anos finais", medio: "Ensino Médio", eja: "EJA", prof: "Profissional" };
  const ETAPA_ORD = ["creche", "pre", "fund_ai", "fund_af", "medio", "eja", "prof"];
  const lista = rows.map((r) => {
    const infra = { agua: b(r.tem_agua), energia: b(r.tem_energia), esgoto: b(r.tem_esgoto), internet: b(r.tem_internet), biblioteca: b(r.tem_biblioteca), labInfo: b(r.tem_lab_info), quadra: b(r.tem_quadra), refeitorio: b(r.tem_refeitorio), acessibilidade: b(r.tem_acessibilidade) };
    const mod = (r.modalidade && typeof r.modalidade === "object" ? r.modalidade : {}) as Record<string, number>;
    const etapas = ETAPA_ORD.filter((k) => num(mod[k]) > 0).map((k) => ({ etapa: ETAPA_LABEL[k], n: num(mod[k]) }));
    const turmas = num(r.n_turmas);
    const serRaw = (Array.isArray(r.series) ? r.series : []) as { serie: string; mat: number; tur: number }[];
    const series = serRaw.map((s) => ({ serie: s.serie, mat: num(s.mat), tur: num(s.tur), alunoPorTurma: num(s.tur) > 0 ? Math.round((num(s.mat) / num(s.tur)) * 10) / 10 : null }));
    return { nome: String(r.nome || ""), matriculas: num(r.matriculas), docentes: num(r.docentes), profissionais: num(r.profissionais), turmas, alunoPorTurma: turmas > 0 ? Math.round((num(r.matriculas) / turmas) * 10) / 10 : null, etapas, series, especial: num(mod.especial), alunoPorDoc: num(r.docentes) > 0 ? Math.round((num(r.matriculas) / num(r.docentes)) * 10) / 10 : null, infraScore: _infraScore(infra), zona: num(r.localizacao), lat: r.latitude != null ? num(r.latitude) : null, lon: r.longitude != null ? num(r.longitude) : null, bairro: String(r.bairro || ""), infra };
  });
  return {
    ano: num(rows[0].ano), total: rows.length, matriculas, docentes, profissionais,
    alunoPorDocente: docentes > 0 ? Math.round((matriculas / docentes) * 10) / 10 : null,
    alunoPorProf: profissionais > 0 ? Math.round((matriculas / profissionais) * 10) / 10 : null,
    infraMedia: lista.length ? Math.round(lista.reduce((s, e) => s + e.infraScore, 0) / lista.length) : 0,
    lacunas: {
      semInternet: rows.filter((r) => !b(r.tem_internet)).length, semBiblioteca: rows.filter((r) => !b(r.tem_biblioteca)).length,
      semQuadra: rows.filter((r) => !b(r.tem_quadra)).length, semEsgoto: rows.filter((r) => !b(r.tem_esgoto)).length,
      semAcessibilidade: rows.filter((r) => !b(r.tem_acessibilidade)).length,
    },
    lista,
  };
}

// Índice de Eficiência (Educação) — custo por aluno × resultado (IDEB) vs pares de mesmo porte.
// Quadrante: gasta mais e entrega menos = potencial de economia; gasta menos e entrega mais = eficiente (referência).
export type EficienciaEducacaoSC = {
  ano: number; matriculas: number; custoAluno: number; medianaCusto: number; ideb: number | null; medianaIdeb: number | null;
  quadrante: "eficiente" | "alto_custo" | "investir" | "atencao"; potencialEconomia: number; nPares: number;
} | null;
export async function getEficienciaEducacaoSC(cod: string): Promise<EficienciaEducacaoSC> {
  const ano = num((await query<Record<string, unknown>>(`SELECT max(ano) m FROM despesa_subfuncao_sc WHERE funcao='Educação'`).catch(() => []))[0]?.m);
  if (!ano) return null;
  const desp = await query<Record<string, unknown>>(`SELECT cod_ibge, sum(empenhado) d FROM despesa_subfuncao_sc WHERE funcao='Educação' AND ano=$1 GROUP BY cod_ibge`, [ano]).catch(() => []);
  const mat = await query<Record<string, unknown>>(`SELECT cod_ibge, matriculas m FROM censo_matricula_sc WHERE etapa='Total' AND ano=(SELECT max(ano) FROM censo_matricula_sc)`).catch(() => []);
  const ideb = await query<Record<string, unknown>>(`SELECT cod_ibge, avg(ideb) i FROM (SELECT DISTINCT ON (cod_ibge,etapa) cod_ibge,etapa,ideb FROM ideb_sc WHERE ideb IS NOT NULL ORDER BY cod_ibge,etapa,ano DESC) s GROUP BY cod_ibge`).catch(() => []);
  const pops = await query<Record<string, unknown>>(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M'`).catch(() => []);
  const mDesp = new Map(desp.map((r) => [String(r.cod_ibge), num(r.d)]));
  const mMat = new Map(mat.map((r) => [String(r.cod_ibge), num(r.m)]));
  const mIdeb = new Map(ideb.map((r) => [String(r.cod_ibge), num(r.i)]));
  const mPop = new Map(pops.map((r) => [String(r.cod_ibge), num(r.populacao)]));
  const faixa = _fk(num(mPop.get(cod)));
  // custo-aluno + ideb por município (mesma faixa)
  const reg = [...mMat.entries()].filter(([c, m]) => m > 0 && mDesp.get(c) && _fk(num(mPop.get(c))) === faixa)
    .map(([c, m]) => ({ c, custo: num(mDesp.get(c)) / m, ideb: mIdeb.has(c) ? num(mIdeb.get(c)) : null }));
  if (!mMat.get(cod) || !mDesp.get(cod)) return null;
  const matriculas = num(mMat.get(cod));
  const custoAluno = num(mDesp.get(cod)) / matriculas;
  const idebMun = mIdeb.has(cod) ? num(mIdeb.get(cod)) : null;
  const med = (arr: number[]) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0;
  const medianaCusto = med(reg.map((r) => r.custo));
  const idebArr = reg.filter((r) => r.ideb != null).map((r) => r.ideb as number);
  const medianaIdeb = idebArr.length ? med(idebArr) : null;
  const caroCusto = custoAluno > medianaCusto;
  const idebBaixo = idebMun != null && medianaIdeb != null ? idebMun < medianaIdeb : false;
  const idebAlto = idebMun != null && medianaIdeb != null ? idebMun >= medianaIdeb : false;
  const quadrante = caroCusto && idebAlto ? "alto_custo" : caroCusto && idebBaixo ? "atencao" : !caroCusto && idebAlto ? "eficiente" : "investir";
  // potencial de economia: gasta acima da mediana E não entrega resultado acima → margem até a mediana
  const potencialEconomia = caroCusto && !idebAlto ? (custoAluno - medianaCusto) * matriculas : 0;
  return { ano, matriculas, custoAluno, medianaCusto, ideb: idebMun, medianaIdeb, quadrante, potencialEconomia, nPares: reg.length };
}

// Índice de Eficiência (Saúde) — gasto em saúde por habitante × resultado da APS (média Previne) vs pares.
export type EficienciaSaudeSC = {
  ano: number; pop: number; gastoHab: number; medianaGasto: number; resultado: number | null; medianaResultado: number | null;
  quadrante: "eficiente" | "alto_custo" | "investir" | "atencao"; potencialEconomia: number; nPares: number;
} | null;
export async function getEficienciaSaudeSC(cod: string): Promise<EficienciaSaudeSC> {
  const ano = num((await query<Record<string, unknown>>(`SELECT max(ano) m FROM despesa_subfuncao_sc WHERE funcao='Saúde'`).catch(() => []))[0]?.m);
  if (!ano) return null;
  const desp = await query<Record<string, unknown>>(`SELECT cod_ibge, sum(empenhado) d FROM despesa_subfuncao_sc WHERE funcao='Saúde' AND ano=$1 GROUP BY cod_ibge`, [ano]).catch(() => []);
  const pops = await query<Record<string, unknown>>(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M'`).catch(() => []);
  const prev = await query<Record<string, unknown>>(`SELECT cod_ibge, avg(pct) p FROM previne_sc WHERE competencia=(SELECT max(competencia) FROM previne_sc) AND pct IS NOT NULL GROUP BY cod_ibge`).catch(() => []);
  const mDesp = new Map(desp.map((r) => [String(r.cod_ibge), num(r.d)]));
  const mPop = new Map(pops.map((r) => [String(r.cod_ibge), num(r.populacao)]));
  const mPrev = new Map(prev.map((r) => [String(r.cod_ibge), num(r.p)]));
  const pop = num(mPop.get(cod));
  if (!pop || !mDesp.get(cod)) return null;
  const faixa = _fk(pop);
  const reg = [...mDesp.entries()].filter(([c]) => num(mPop.get(c)) > 0 && _fk(num(mPop.get(c))) === faixa)
    .map(([c, d]) => ({ c, gasto: d / num(mPop.get(c)), res: mPrev.has(c) ? num(mPrev.get(c)) : null }));
  const med = (arr: number[]) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0;
  const gastoHab = num(mDesp.get(cod)) / pop;
  const resultado = mPrev.has(cod) ? num(mPrev.get(cod)) : null;
  const medianaGasto = med(reg.map((r) => r.gasto));
  const resArr = reg.filter((r) => r.res != null).map((r) => r.res as number);
  const medianaResultado = resArr.length ? med(resArr) : null;
  const caro = gastoHab > medianaGasto;
  const resAlto = resultado != null && medianaResultado != null ? resultado >= medianaResultado : false;
  const quadrante = caro && resAlto ? "alto_custo" : caro && !resAlto ? "atencao" : !caro && resAlto ? "eficiente" : "investir";
  const potencialEconomia = caro && !resAlto ? (gastoHab - medianaGasto) * pop : 0;
  return { ano, pop, gastoHab, medianaGasto, resultado, medianaResultado, quadrante, potencialEconomia, nPares: reg.length };
}

// Otimizador de Receitas Próprias — IPTU/ISS/ITBI per capita vs pares de mesmo porte → potencial de arrecadação (R$)
export type OtimizadorReceitaSC = {
  ano: number; pop: number; nPares: number; potencialTotal: number;
  tributos: { tributo: string; valor: number; pc: number; medianaPc: number; potencial: number; abaixo: boolean; posicaoPct: number; acao: string }[];
} | null;
export async function getOtimizadorReceitaSC(cod: string): Promise<OtimizadorReceitaSC> {
  const ente = (await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1 AND tipo='M'`, [cod]).catch(() => []))[0];
  const pop = num(ente?.populacao);
  if (!pop) return null;
  const ano = num((await query<Record<string, unknown>>(`SELECT max(ano) m FROM receitas_detalhe_sc WHERE cod_ibge=$1 AND item IN ('IPTU','ISS','ITBI')`, [cod]).catch(() => []))[0]?.m);
  if (!ano) return null;
  const all = await query<Record<string, unknown>>(`SELECT r.cod_ibge, r.item, r.valor, e.populacao FROM receitas_detalhe_sc r JOIN entes_sc e ON e.cod_ibge=r.cod_ibge AND e.tipo='M' WHERE r.ano=$1 AND r.item IN ('IPTU','ISS','ITBI') AND e.populacao>0`, [ano]).catch(() => []);
  const faixa = _fk(pop);
  const ACAO: Record<string, string> = {
    IPTU: "Atualizar a Planta Genérica de Valores + recadastramento imobiliário (georreferenciamento) — a maior alavanca do IPTU.",
    ISS: "Nota fiscal de serviços eletrônica + fiscalização e cadastro de prestadores (construção civil, saúde, profissionais liberais).",
    ITBI: "Atualizar o valor venal de referência e integrar com cartórios para coibir subavaliação na transmissão.",
  };
  const NOME: Record<string, string> = { IPTU: "IPTU (imóveis)", ISS: "ISS (serviços)", ITBI: "ITBI (transmissão de imóveis)" };
  const tributos: NonNullable<OtimizadorReceitaSC>["tributos"] = [];
  let potencialTotal = 0, nPares = 0;
  for (const t of ["IPTU", "ISS", "ITBI"]) {
    const meu = all.find((r) => String(r.cod_ibge) === cod && String(r.item) === t);
    const valor = meu ? num(meu.valor) : 0;
    const pc = valor / pop;
    const paresPc = all.filter((r) => String(r.item) === t && _fk(num(r.populacao)) === faixa).map((r) => num(r.valor) / num(r.populacao)).filter((v) => v > 0).sort((a, b) => a - b);
    nPares = paresPc.length;
    const medianaPc = paresPc.length ? paresPc[Math.floor(paresPc.length / 2)] : 0;
    const potencial = Math.max(0, medianaPc - pc) * pop;
    const abaixoN = paresPc.filter((v) => v < pc).length;
    potencialTotal += potencial;
    tributos.push({ tributo: NOME[t], valor, pc, medianaPc, potencial, abaixo: pc < medianaPc, posicaoPct: paresPc.length ? Math.round((abaixoN / paresPc.length) * 100) : 0, acao: ACAO[t] });
  }
  return { ano, pop, nPares, potencialTotal, tributos };
}

export type ReceitasDetalheSC = { anoUlt: number; itens: { item: string; valor: number; serie: { ano: number; valor: number }[] }[] } | null;
export async function getReceitasDetalheSC(cod: string): Promise<ReceitasDetalheSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, item, valor FROM receitas_detalhe_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoUlt = Math.max(...rows.map((r) => num(r.ano)));
  const map = new Map<string, { ano: number; valor: number }[]>();
  for (const r of rows) { const it = String(r.item); if (!map.has(it)) map.set(it, []); map.get(it)!.push({ ano: num(r.ano), valor: num(r.valor) }); }
  const itens = [...map.entries()].map(([item, serie]) => ({ item, serie, valor: serie.find((s) => s.ano === anoUlt)?.valor ?? 0 })).filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  return { anoUlt, itens };
}

// Produção MAC (Média e Alta Complexidade) — série anual SIH (internações) + SIA (ambulatorial)
export type MacProducaoSC = { ano: number; internacoes: number; sihValor: number; siaQtd: number; siaValor: number }[];
export async function getMacProducaoSC(cod: string): Promise<MacProducaoSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, internacoes, valor_internacoes, sia_qtd, sia_valor FROM saude_producao_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  return rows.map((r) => ({ ano: num(r.ano), internacoes: num(r.internacoes), sihValor: num(r.valor_internacoes), siaQtd: num(r.sia_qtd), siaValor: num(r.sia_valor) }));
}

// Repasses federais do FNS por bloco/área (fundo-a-fundo) — último ano com dado
export type FnsSC = { ano: number; total: number; custeio: number; investimento: number; areas: { nome: string; valor: number }[] } | null;
export async function getFnsSC(cod: string): Promise<FnsSC> {
  const ult = (await query<Record<string, unknown>>(`SELECT max(ano) m FROM fns_repasse_sc WHERE cod_ibge=$1 AND vl_liquido>0`, [cod]).catch(() => []))[0]?.m;
  if (ult == null) return null;
  const ano = num(ult);
  const rows = await query<Record<string, unknown>>(`SELECT bloco_cod, area_cod, area_nome, vl_liquido FROM fns_repasse_sc WHERE cod_ibge=$1 AND ano=$2`, [cod, ano]).catch(() => []);
  const tops = rows.filter((r) => num(r.area_cod) === 0); // totais por bloco (10=Custeio, 11=Investimento)
  const custeio = tops.filter((r) => num(r.bloco_cod) === 10).reduce((s, r) => s + num(r.vl_liquido), 0);
  const investimento = tops.filter((r) => num(r.bloco_cod) === 11).reduce((s, r) => s + num(r.vl_liquido), 0);
  const total = tops.reduce((s, r) => s + num(r.vl_liquido), 0);
  const map = new Map<string, number>(); // consolida áreas (APS aparece em custeio e investimento)
  for (const r of rows.filter((x) => num(x.area_cod) !== 0)) {
    const nome = String(r.area_nome || "Outros");
    map.set(nome, (map.get(nome) || 0) + num(r.vl_liquido));
  }
  const areas = [...map.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  return { ano, total, custeio, investimento, areas };
}

// Previdência (RPPS) — RREO Anexo 04. null = ente sem RPPS (está no RGPS/INSS)
export type RppsSC = { ano: number; receita: number; despesa: number; resultado: number; contribSegurados: number; contribPatronais: number; aposentadorias: number; pensoes: number; coberturaPct: number; serie: { ano: number; resultado: number }[]; atuarial: { exercicio: number; deficit: number; ativos: number | null } | null } | null;
export async function getRppsSC(cod: string): Promise<RppsSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, receita, despesa, resultado, contrib_segurados, contrib_patronais, aposentadorias, pensoes FROM rpps_sc WHERE cod_ibge=$1 ORDER BY ano DESC`, [cod]).catch(() => []);
  const at = (await query<Record<string, unknown>>(`SELECT exercicio, deficit_atuarial, ativos FROM rpps_atuarial_sc WHERE cod_ibge=$1 ORDER BY exercicio DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const atuarial = at && at.deficit_atuarial != null ? { exercicio: num(at.exercicio), deficit: num(at.deficit_atuarial), ativos: at.ativos != null ? num(at.ativos) : null } : null;
  if (!rows.length) return atuarial ? { ano: atuarial.exercicio, receita: 0, despesa: 0, resultado: 0, contribSegurados: 0, contribPatronais: 0, aposentadorias: 0, pensoes: 0, coberturaPct: 0, serie: [], atuarial } : null;
  const r = rows[0];
  const benef = num(r.aposentadorias) + num(r.pensoes);
  const contrib = num(r.contrib_segurados) + num(r.contrib_patronais);
  return {
    ano: num(r.ano), receita: num(r.receita), despesa: num(r.despesa), resultado: num(r.resultado),
    contribSegurados: num(r.contrib_segurados), contribPatronais: num(r.contrib_patronais),
    aposentadorias: num(r.aposentadorias), pensoes: num(r.pensoes),
    coberturaPct: benef > 0 ? Math.round((contrib / benef) * 1000) / 10 : 0, // contribuições cobrem quanto dos benefícios
    serie: rows.map((x) => ({ ano: num(x.ano), resultado: num(x.resultado) })).reverse(),
    atuarial,
  };
}

// CAUC — regularidade fiscal para transferências voluntárias (Tesouro; lê CADIN diariamente)
export type CaucSC = { dataPesquisa: string | null; apto: boolean; nPendencias: number; pendencias: string[]; grupos: string[] } | null;
export async function getCaucSC(cod: string): Promise<CaucSC> {
  const r = (await query<Record<string, unknown>>(`SELECT to_char(data_pesquisa,'DD/MM/YYYY') dp, apto, n_pendencias, pendencias, grupos_pendentes FROM cauc_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { dataPesquisa: r.dp ? String(r.dp) : null, apto: !!r.apto, nPendencias: num(r.n_pendencias), pendencias: Array.isArray(r.pendencias) ? (r.pendencias as string[]) : [], grupos: Array.isArray(r.grupos_pendentes) ? (r.grupos_pendentes as string[]) : [] };
}

export type RgfResumo = { ano: number; pessoalPct: number; rclAjustada: number; dclPct: number | null } | null;
export async function getRgfResumoSC(cod: string): Promise<RgfResumo> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, pessoal_pct, rcl_ajustada, dcl_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { ano: num(r.ano), pessoalPct: num(r.pessoal_pct), rclAjustada: num(r.rcl_ajustada), dclPct: r.dcl_pct == null ? null : num(r.dcl_pct) };
}
