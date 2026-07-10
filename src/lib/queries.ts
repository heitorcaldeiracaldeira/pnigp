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
  pctAutonomia: number; pctInvestimento: number; pctEquilibrio: number; pctPessoal: number; // percentis 0-100 que formam o score (transparência "ver cálculo")
};

// Data de extração por fonte (etl_catalogo.ultima_exec) — alimenta o carimbo "fonte · competência · extraído em".
export async function getCatalogoExtracao(): Promise<Record<string, string>> {
  const rows = await query<Record<string, unknown>>(`SELECT id, to_char(ultima_exec,'YYYY-MM-DD') d FROM etl_catalogo WHERE ultima_exec IS NOT NULL`).catch(() => []);
  const m: Record<string, string> = {};
  for (const r of rows) if (r.d) m[String(r.id)] = String(r.d);
  return m;
}

export async function getRankingFiscalSC(): Promise<RankFiscalSC[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge, e.nome, e.tipo,
            f.receita, f.tributaria, f.despesa, f.resultado, f.pessoal, f.investimento
       FROM financas_sc f JOIN entes_sc e ON e.cod_ibge = f.cod_ibge
      WHERE f.suspeito IS NOT TRUE AND e.tipo='M'
      ORDER BY f.cod_ibge, f.ano DESC`,
  ).catch(() => []); // só municípios: o Estado (cod '42', tipo 'E') não entra no ranking municipal nem nos percentis
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
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const scored = base.map((b, i) => ({
    ...b, score: r1((pA[i] + pI[i] + pE[i] + pP[i]) / 4),
    autonomia: Math.round(b.autonomia * 1000) / 10, investimento: Math.round(b.investimento * 1000) / 10,
    equilibrio: Math.round(b.equilibrio * 1000) / 10, pessoal: Math.round(b.pessoal * 1000) / 10,
    pctAutonomia: r1(pA[i]), pctInvestimento: r1(pI[i]), pctEquilibrio: r1(pE[i]), pctPessoal: r1(pP[i]),
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
            (SELECT AVG(x.valor) FROM indicadores_sc x WHERE x.codigo=i.codigo AND x.ano=i.ano AND length(x.cod_ibge)=7) AS media
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

/** Localidade (UF/município) dos fornecedores por CNPJ (cnpj_loc, CNPJ→localidade da Receita). */
export async function getLocalidadesCNPJ(cnpjs: string[]): Promise<Record<string, { uf: string | null; municipio: string | null }>> {
  const lista = [...new Set(cnpjs.filter(Boolean))];
  if (!lista.length) return {};
  const rows = await query<Record<string, unknown>>(`SELECT cnpj, uf, municipio FROM cnpj_loc WHERE cnpj = ANY($1)`, [lista]).catch(() => []);
  const map: Record<string, { uf: string | null; municipio: string | null }> = {};
  for (const r of rows) map[String(r.cnpj)] = { uf: r.uf ? String(r.uf) : null, municipio: r.municipio ? String(r.municipio) : null };
  return map;
}

// resolve a localidade de 1 CNPJ ao vivo (minhareceita.org — base Receita); usado p/ fornecedores fora do cache
async function fetchLocalidadeReceita(cnpj: string): Promise<{ uf: string | null; municipio: string | null; razao: string | null; situacao: string | null } | null> {
  try {
    const r = await fetch(`https://minhareceita.org/${cnpj}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    return { uf: (j.uf as string) || null, municipio: (j.municipio as string) || null, razao: (j.razao_social as string) || (j.nome as string) || null, situacao: (j.descricao_situacao_cadastral as string) || null };
  } catch { return null; }
}

/** Como getLocalidadesCNPJ, mas AUTO-RECUPERÁVEL: resolve ao vivo os CNPJs ausentes do cache e os grava
 *  (limitado por requisição p/ não estourar latência/rate-limit). Ideal p/ fornecedores on-demand (PNCP). */
export async function resolverLocalidadesCNPJ(cnpjs: string[]): Promise<Record<string, { uf: string | null; municipio: string | null }>> {
  const lista = [...new Set(cnpjs.filter((c) => c && c.length === 14))];
  if (!lista.length) return {};
  const map = await getLocalidadesCNPJ(lista);
  const faltam = lista.filter((c) => !map[c]);
  for (const c of faltam.slice(0, 8)) { // teto por requisição
    const loc = await fetchLocalidadeReceita(c);
    if (loc && (loc.uf || loc.municipio)) {
      map[c] = { uf: loc.uf, municipio: loc.municipio };
      await query(`INSERT INTO cnpj_loc (cnpj,razao_social,municipio,uf,situacao) VALUES ($1,$2,$3,$4,$5)
                   ON CONFLICT (cnpj) DO UPDATE SET municipio=COALESCE(cnpj_loc.municipio,EXCLUDED.municipio), uf=COALESCE(cnpj_loc.uf,EXCLUDED.uf), situacao=COALESCE(EXCLUDED.situacao,cnpj_loc.situacao), atualizado=now()`,
        [c, loc.razao, loc.municipio, loc.uf, loc.situacao]).catch(() => {});
    }
  }
  return map;
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
// Série SIOPS (saúde) — % aplicado em ASPS, mínimo constitucional (15%) e transferências, por ano. Para a ficha/CSV.
export type SiopsSerieSC = { ano: number; saudePct: number; saudeMin: number; saudeValor: number; transfSaudeValor: number; transfUniaoValor: number }[];
export async function getSiopsSerieSC(cod: string): Promise<SiopsSerieSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, saude_pct, saude_min, saude_valor, transf_saude_valor, transf_uniao_valor FROM siops_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  return rows.map((r) => ({ ano: num(r.ano), saudePct: num(r.saude_pct), saudeMin: num(r.saude_min), saudeValor: num(r.saude_valor), transfSaudeValor: num(r.transf_saude_valor), transfUniaoValor: num(r.transf_uniao_valor) }));
}

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
  abertos: { id: string; nome: string; orgao: string; objetivo: string; descricao: string; valor: number; modalidade: string; fundo: string; naturezaDespesa: string; acaoOrcamentaria: string; valorAcao: number; parcelas: number; situacao: string; ano: number; codigo: string; dtIni: string | null; dtFim: string | null; dias: number | null; tipoJanela: string; area: string; elegivel: boolean; temLista: boolean }[];
  benchmark: { media: number; max: number; melhores: { nome: string; valor: number }[] };
  universo: { nProgramas: number; nAbertos: number; totalSC: number; nMunicipios: number };
  analises: { posicao: number; totalEntes: number; gapMedia: number; gapMax: number; tendencia: { delta: number; ultimoAno: number } | null; naoCaptados: number; concentracaoTop: { orgao: string; pct: number } | null };
} | null;
// Perfil de NECESSIDADE do município por área — déficit objetivo vs mediana de SC (base do casamento com a oportunidade).
// Sinais inequívocos (mais = melhor → abaixo da mediana = carência): atenção básica (UBS/posto por 10 mil hab) e IDEB AI.
export type PerfilNecessidade = {
  saude: { deficit: boolean; motivo: string } | null;
  educacao: { deficit: boolean; motivo: string } | null;
  assistencia: { deficit: boolean; motivo: string } | null;
  infraestrutura: { deficit: boolean; motivo: string } | null;
  habitacao: { deficit: boolean; motivo: string } | null;
  cultura: { deficit: boolean; motivo: string } | null;
  esporte: { deficit: boolean; motivo: string } | null;
  agricultura: { deficit: boolean; motivo: string } | null;
};
export async function getPerfilNecessidadeSC(cod: string): Promise<PerfilNecessidade> {
  const [ub, id, ass, esg, hab, mun] = await Promise.all([
    query<Record<string, unknown>>(`WITH u AS (
        SELECT e.cod_ibge, (count(s.codigo_cnes)::numeric / NULLIF(e.populacao,0)) * 10000 dens
        FROM entes_sc e LEFT JOIN estabelecimentos_saude_sc s ON s.cod_ibge=e.cod_ibge AND s.tipo_codigo IN (1,2)
        WHERE e.tipo='M' AND e.populacao>0 GROUP BY e.cod_ibge, e.populacao)
      SELECT (SELECT dens FROM u WHERE cod_ibge=$1) minha, percentile_cont(0.5) WITHIN GROUP (ORDER BY dens) mediana FROM u`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH ult AS (SELECT cod_ibge, max(ano) ano FROM ideb_sc WHERE etapa='AI' AND rede='Municipal' AND ideb>0 GROUP BY 1),
        v AS (SELECT i.cod_ibge, i.ideb FROM ideb_sc i JOIN ult ON ult.cod_ibge=i.cod_ibge AND ult.ano=i.ano WHERE i.etapa='AI' AND i.rede='Municipal' AND i.ideb>0)
      SELECT (SELECT ideb FROM v WHERE cod_ibge=$1) minha, percentile_cont(0.5) WITHIN GROUP (ORDER BY ideb) mediana FROM v`, [cod]).catch(() => []),
    // assistência: habitantes por CRAS vs referência MDS (1 CRAS por 20 mil hab)
    query<Record<string, unknown>>(`SELECT cras, populacao, hab_por_cras FROM suas_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    // infraestrutura/saneamento: esgotamento sanitário adequado (Censo 2022) vs mediana de SC
    query<Record<string, unknown>>(`WITH e AS (SELECT cod_ibge, pct::numeric p FROM saneamento_sc WHERE indicador='esgoto_adeq' AND pct IS NOT NULL)
      SELECT (SELECT p FROM e WHERE cod_ibge=$1) minha, percentile_cont(0.5) WITHIN GROUP (ORDER BY p) mediana FROM e`, [cod]).catch(() => []),
    // habitação: penetração do MCMV (unidades por 1.000 hab) vs mediana de SC — baixa = demanda habitacional não atendida
    query<Record<string, unknown>>(`WITH h AS (SELECT m.cod_ibge, m.uh_financiadas/NULLIF(e.populacao,0)*1000 dens FROM mcmv_sc m JOIN entes_sc e ON e.cod_ibge=m.cod_ibge WHERE e.populacao>0)
      SELECT (SELECT round(dens::numeric,1) FROM h WHERE cod_ibge=$1) minha, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dens)::numeric,1) mediana FROM h`, [cod]).catch(() => []),
    // cultura/esporte/agricultura: déficit ESTRUTURAL = não tem o conselho da área (bloqueia acesso a verba federal). Fonte: MUNIC.
    query<Record<string, unknown>>(`SELECT
        bool_or(label ~* 'Conselho Municipal de Cultura' AND tem) tem_cult, (count(*) FILTER (WHERE label ~* 'cultura'))>0 has_cult,
        bool_or(label ~* 'Conselho.*Esporte' AND tem) tem_esp, (count(*) FILTER (WHERE label ~* 'esporte'))>0 has_esp,
        bool_or(label ~* 'Desenvolvimento Rural' AND tem) tem_agr, (count(*) FILTER (WHERE label ~* 'rural|agropec'))>0 has_agr
      FROM munic_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  const sMin = ub[0]?.minha != null ? num(ub[0].minha) : null, sMed = num(ub[0]?.mediana);
  const eMin = id[0]?.minha != null ? num(id[0].minha) : null, eMed = num(id[0]?.mediana);
  const a0 = ass[0]; const cras = a0 ? num(a0.cras) : null, hpc = a0?.hab_por_cras != null ? num(a0.hab_por_cras) : null, pop = a0 ? num(a0.populacao) : 0;
  const REF_CRAS = 20000; // NOB-SUAS: 1 CRAS por ~20 mil hab
  let assistencia: { deficit: boolean; motivo: string } | null = null;
  if (a0 != null) {
    if (cras === 0 && pop > 0) assistencia = { deficit: true, motivo: `nenhum CRAS para ${pop.toLocaleString("pt-BR")} habitantes (referência MDS: 1 por 20 mil)` };
    else if (hpc != null && hpc > 0) assistencia = { deficit: hpc > REF_CRAS, motivo: `1 CRAS para ${Math.round(hpc).toLocaleString("pt-BR")} habitantes (${cras} CRAS; referência MDS: 1 por 20 mil)` };
  }
  const ifMin = esg[0]?.minha != null ? num(esg[0].minha) : null, ifMed = num(esg[0]?.mediana);
  const hMin = hab[0]?.minha != null ? num(hab[0].minha) : null, hMed = num(hab[0]?.mediana);
  const m0 = mun[0];
  return {
    saude: sMin != null && sMed > 0 ? { deficit: sMin < sMed, motivo: `${sMin.toFixed(1)} UBS/posto por 10 mil hab. (mediana de SC: ${sMed.toFixed(1)})` } : null,
    educacao: eMin != null && eMed > 0 ? { deficit: eMin < eMed, motivo: `IDEB dos anos iniciais ${eMin.toFixed(1)} (mediana de SC: ${eMed.toFixed(1)})` } : null,
    assistencia,
    infraestrutura: ifMin != null && ifMed > 0 ? { deficit: ifMin < ifMed, motivo: `esgotamento sanitário adequado em ${ifMin.toFixed(0)}% dos domicílios (mediana de SC: ${ifMed.toFixed(0)}%)` } : null,
    habitacao: hMin != null && hMed > 0 ? { deficit: hMin < hMed, motivo: `${hMin.toFixed(1)} unidades MCMV por mil hab. (mediana de SC: ${hMed.toFixed(1)}) — baixa penetração indica demanda habitacional a atender` } : null,
    cultura: m0 && m0.has_cult ? { deficit: !m0.tem_cult, motivo: m0.tem_cult ? "possui Conselho Municipal de Cultura" : "sem Conselho Municipal de Cultura — instrumento que viabiliza o acesso a recursos federais de cultura" } : null,
    esporte: m0 && m0.has_esp ? { deficit: !m0.tem_esp, motivo: m0.tem_esp ? "possui Conselho Municipal de Esporte" : "sem Conselho Municipal de Esporte — instrumento que viabiliza o acesso a recursos federais de esporte" } : null,
    agricultura: m0 && m0.has_agr ? { deficit: !m0.tem_agr, motivo: m0.tem_agr ? "possui Conselho Mun. de Desenvolvimento Rural" : "sem Conselho Municipal de Desenvolvimento Rural — instrumento de acesso a recursos da agricultura familiar" } : null,
  };
}
// Registro curado de programas federais (saúde/educação) que o município pode pleitear — com proveniência (link oficial).
// FNS/FNDE não têm feed de "janela aberta"; aberturas saem por portaria. Alimenta o casamento oportunidade×carência.
export type ProgramaFederal = { id: string; area: string; nome: string; objeto: string; orgao: string; fonte: string; link: string; elegibilidade: string; janela: string };
export async function getProgramasFederaisSC(): Promise<ProgramaFederal[]> {
  const rows = await query<Record<string, unknown>>(`SELECT id, area, nome, objeto, orgao, fonte, link, elegibilidade, janela FROM programas_federais_sc ORDER BY area, nome`).catch(() => []);
  return rows.map((r) => ({ id: String(r.id), area: String(r.area || ""), nome: String(r.nome || ""), objeto: String(r.objeto || ""), orgao: String(r.orgao || ""), fonte: String(r.fonte || ""), link: String(r.link || ""), elegibilidade: String(r.elegibilidade || ""), janela: String(r.janela || "") }));
}
// classifica a oportunidade por ÁREA/objeto (base do casamento com a necessidade do município)
function areaOportunidade(nome: string, orgao: string, fundo: string): string {
  const s = `${nome} ${orgao} ${fundo}`.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/SAUDE|\bUBS\b|HOSPITAL|\bSUS\b|SAMU|FARMAC|VIGILANCIA SANIT|ATENCAO (BASICA|PRIMARIA)|UPA/.test(s)) return "saude";
  if (/EDUCA|ESCOLA|CRECHE|ENSINO|\bFNDE\b|MERENDA|PROFESSOR/.test(s)) return "educacao";
  if (/HABITA|MORADIA|MINHA CASA|UNIDADE HABITAC/.test(s)) return "habitacao";
  if (/PAVIMENTA|ESTRADA|\bOBRA|INFRAESTRUTURA|SANEAMENTO|CIDADES|MOBILIDADE|DRENAGEM|PONTE/.test(s)) return "infraestrutura";
  if (/SEGURANC|PENITENC|\bDEPEN\b|GUARDA MUNICIPAL|BOMBEIRO|VIOLENC|CRIMINAL/.test(s)) return "seguranca";
  if (/ASSISTENCIA SOCIAL|\bCRAS\b|\bCREAS\b|\bSUAS\b|ACOLHIMENTO|VULNERAB/.test(s)) return "assistencia";
  if (/ESPORTE|DESPORTO|LAZER|GINASIO|QUADRA POLIESP/.test(s)) return "esporte";
  if (/CULTURA|TURISMO|PATRIMONIO|MUSEU|BIBLIOTECA|\bLIC\b/.test(s)) return "cultura";
  if (/TRABALHO|EMPREGO|QUALIFICA|RENDA|PROFISSIONAL/.test(s)) return "trabalho";
  if (/AGRICUL|RURAL|\bPESCA\b|ABASTECIMENTO|PRODUTOR/.test(s)) return "agricultura";
  return "outros";
}
export async function getCaptacaoTransferegovSC(cod: string): Promise<CaptacaoSC> {
  const [tot, porOrgao, porAno, lista, abertos, bench, melhores, uni, an] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor_total_repasse),0) total FROM captacao_transferegov_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT orgao_repassador o, count(*) n, coalesce(sum(valor_total_repasse),0) v FROM captacao_transferegov_sc WHERE cod_ibge=$1 GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 8`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT extract(year from dt_inicio)::int ano, coalesce(sum(valor_total_repasse),0) v FROM captacao_transferegov_sc WHERE cod_ibge=$1 AND dt_inicio IS NOT NULL GROUP BY 1 ORDER BY 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT c.valor_total_repasse v, c.situacao s, c.orgao_repassador o, p.nome FROM captacao_transferegov_sc c LEFT JOIN programas_transferegov p ON p.id_programa=c.id_programa WHERE c.cod_ibge=$1 ORDER BY v DESC NULLS LAST LIMIT 15`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT x.*,
        to_char(x.di,'YYYY-MM-DD') dt_ini_vol, to_char(x.df,'YYYY-MM-DD') dt_fim_vol, (x.df - CURRENT_DATE) dias,
        EXISTS (SELECT 1 FROM programa_beneficiario_sc b WHERE b.id_programa = x.id AND b.cod_ibge = $1) elegivel,
        EXISTS (SELECT 1 FROM programa_beneficiario_sc b WHERE b.id_programa = x.id) tem_lista
      FROM (
        SELECT id_programa id, nome, orgao, objetivo, descricao, modalidade, coalesce(valor_global,0) valor, fundo, natureza_despesa, acao_orcamentaria, coalesce(valor_acao,0) valor_acao, coalesce(parcelas,0) parcelas, situacao, ano, codigo, 'voluntaria' tipo_janela, dt_ini_vol di, dt_fim_vol df FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE
        UNION ALL
        SELECT id_programa, nome, orgao, objetivo, descricao, modalidade, coalesce(valor_global,0), fundo, natureza_despesa, acao_orcamentaria, coalesce(valor_acao,0), coalesce(parcelas,0), situacao, ano, codigo, 'especifica', dt_ini_esp, dt_fim_esp FROM programas_transferegov WHERE dt_fim_esp >= CURRENT_DATE
        UNION ALL
        SELECT id_programa, nome, orgao, objetivo, descricao, modalidade, coalesce(valor_global,0), fundo, natureza_despesa, acao_orcamentaria, coalesce(valor_acao,0), coalesce(parcelas,0), situacao, ano, codigo, 'emenda', dt_ini_emenda, dt_fim_emenda FROM programas_transferegov WHERE dt_fim_emenda >= CURRENT_DATE
      ) x ORDER BY (x.df - CURRENT_DATE) ASC LIMIT 50`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT coalesce(avg(t),0) media, coalesce(max(t),0) maxv FROM (SELECT cod_ibge, sum(valor_total_repasse) t FROM captacao_transferegov_sc WHERE esfera='municipal' AND cod_ibge IS NOT NULL GROUP BY cod_ibge) s`).catch(() => []),
    query<Record<string, unknown>>(`SELECT e.nome, sum(c.valor_total_repasse) v FROM captacao_transferegov_sc c JOIN entes_sc e ON e.cod_ibge=c.cod_ibge GROUP BY e.nome ORDER BY v DESC NULLS LAST LIMIT 5`).catch(() => []),
    query<Record<string, unknown>>(`SELECT (SELECT count(*) FROM programas_transferegov) np, (SELECT count(*) FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE OR dt_fim_esp >= CURRENT_DATE OR dt_fim_emenda >= CURRENT_DATE) na, (SELECT coalesce(sum(valor_total_repasse),0) FROM captacao_transferegov_sc WHERE esfera='municipal' AND cod_ibge IS NOT NULL) tsc, (SELECT count(distinct cod_ibge) FROM captacao_transferegov_sc WHERE esfera='municipal' AND cod_ibge IS NOT NULL) nm`).catch(() => []),
    query<Record<string, unknown>>(`SELECT (SELECT count(*)+1 FROM (SELECT cod_ibge, sum(valor_total_repasse) t FROM captacao_transferegov_sc WHERE esfera='municipal' AND cod_ibge IS NOT NULL GROUP BY cod_ibge) s WHERE t > (SELECT coalesce(sum(valor_total_repasse),0) FROM captacao_transferegov_sc WHERE cod_ibge=$1 AND esfera='municipal')) pos, (SELECT count(*) FROM programas_transferegov p WHERE (dt_fim_vol >= CURRENT_DATE OR dt_fim_esp >= CURRENT_DATE OR dt_fim_emenda >= CURRENT_DATE) AND NOT EXISTS (SELECT 1 FROM captacao_transferegov_sc c WHERE c.cod_ibge=$1 AND c.id_programa=p.id_programa)) naocap`, [cod]).catch(() => []),
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
    abertos: abertos.map((r) => ({ id: String(r.id), nome: String(r.nome || ""), orgao: String(r.orgao || ""), objetivo: String(r.objetivo || ""), descricao: String(r.descricao || ""), valor: num(r.valor), modalidade: String(r.modalidade || ""), fundo: String(r.fundo || ""), naturezaDespesa: String(r.natureza_despesa || ""), acaoOrcamentaria: String(r.acao_orcamentaria || ""), valorAcao: num(r.valor_acao), parcelas: num(r.parcelas), situacao: String(r.situacao || ""), ano: num(r.ano), codigo: String(r.codigo || ""), dtIni: (r.dt_ini_vol as string) || null, dtFim: (r.dt_fim_vol as string) || null, dias: r.dias != null ? num(r.dias) : null, tipoJanela: String(r.tipo_janela || "voluntaria"), area: areaOportunidade(String(r.nome || ""), String(r.orgao || ""), String(r.fundo || "")), elegivel: r.elegivel === true, temLista: r.tem_lista === true })),
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

// Obras do município (ObrasGov) — detalhe por obra: resumo + por situação + as maiores. Fonte: obras_sc.
export async function getObrasSC(cod: string): Promise<{ total: number; valorTotal: number; porSituacao: { situacao: string; n: number; valor: number }[]; porOrigem: { origem: string; n: number; valor: number }[]; publico: { n: number; valor: number }; privado: { n: number; valor: number }; maiores: { nome: string; situacao: string; especie: string; valor: number; origem: string; vinculo: string; prazo: string | null }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT nome, situacao, especie, valor, origem, vinculo, data_fim, atualizado FROM obras_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const valorTotal = rows.reduce((s, r) => s + num(r.valor), 0);
  const sm: Record<string, { n: number; valor: number }> = {};
  for (const r of rows) { const k = String(r.situacao || "—"); (sm[k] ||= { n: 0, valor: 0 }); sm[k].n++; sm[k].valor += num(r.valor); }
  const porSituacao = Object.entries(sm).map(([situacao, v]) => ({ situacao, ...v })).sort((a, b) => b.n - a.n);
  // contadores por ORIGEM do recurso (uma obra pode ter mais de uma origem)
  const ESF = ["Federal", "Estadual", "Municipal", "Privado"];
  const om: Record<string, { n: number; valor: number }> = {}; for (const e of ESF) om[e] = { n: 0, valor: 0 };
  const pub = { n: 0, valor: 0 }, priv = { n: 0, valor: 0 };
  for (const r of rows) { const origs = String(r.origem || "").split("/").filter(Boolean); const v = num(r.valor);
    for (const o of origs) if (om[o]) { om[o].n++; om[o].valor += v; }
    if (origs.some((o) => o !== "Privado")) { pub.n++; pub.valor += v; }
    if (origs.includes("Privado")) { priv.n++; priv.valor += v; }
  }
  const porOrigem = ESF.map((e) => ({ origem: e, ...om[e] })).filter((x) => x.n > 0);
  const maiores = [...rows].sort((a, b) => num(b.valor) - num(a.valor)).slice(0, 10).map((r) => ({ nome: String(r.nome || ""), situacao: String(r.situacao || "—"), especie: String(r.especie || ""), valor: num(r.valor), origem: String(r.origem || ""), vinculo: String(r.vinculo || ""), prazo: r.data_fim ? String(r.data_fim).slice(0, 4) : null }));
  return { total: rows.length, valorTotal, porSituacao, porOrigem, publico: pub, privado: priv, maiores, extraido: dExtr(rows[0].atualizado) };
}

// PONTO CEGO da captação: o município capta transferências VOLUNTÁRIAS (a parte captável) acima/abaixo dos pares de mesmo porte?
// "Dinheiro na mesa" = quanto a mais receberia se captasse na mediana dos pares. Fonte: transferencias_cgu_sc.
export async function getCaptacaoRelativaSC(cod: string): Promise<{ ano: string; voluntarias: number; perCapita: number; paresMediana: number; posicao: "acima" | "na média" | "abaixo"; percentil: number; dinheiroNaMesa: number; faixa: string; nPares: number; gaps: { funcao: string; gap: number }[]; areas: { area: string; munPc: number; medPc: number; posicao: string; gap: number }[]; extraido: string | null } | null> {
  const anoR = (await query<Record<string, unknown>>(`SELECT substring(ano_mes,1,4) ano FROM transferencias_cgu_sc GROUP BY 1 HAVING count(DISTINCT ano_mes)>=12 ORDER BY 1 DESC LIMIT 1`).catch(() => []))[0];
  const ano = anoR ? String(anoR.ano) : null; if (!ano) return null;
  const NC = "tipo_transferencia <> 'Constitucionais e Royalties'"; // só voluntárias/legais (captáveis)
  const rows = await query<Record<string, unknown>>(`SELECT t.cod_ibge, e.populacao pop, sum(t.valor) vol FROM transferencias_cgu_sc t JOIN entes_sc e ON e.cod_ibge=t.cod_ibge WHERE substring(t.ano_mes,1,4)=$1 AND ${NC} AND e.tipo='M' AND e.populacao>0 GROUP BY 1,2`, [ano]).catch(() => []);
  const alvo = rows.find((r) => r.cod_ibge === cod); if (!alvo || !num(alvo.pop)) return null;
  const gk = _fk(num(alvo.pop));
  const pares = rows.filter((r) => _fk(num(r.pop)) === gk);
  const pc = (r: Record<string, unknown>) => num(r.vol) / num(r.pop);
  const munPc = pc(alvo);
  const paresPc = pares.map(pc);
  const mediana = _median(paresPc);
  const percentil = paresPc.length ? Math.round((paresPc.filter((v) => v <= munPc).length / paresPc.length) * 100) : 0;
  const posicao = munPc >= mediana * 1.1 ? "acima" : munPc <= mediana * 0.9 ? "abaixo" : "na média";
  const dinheiroNaMesa = Math.max(0, mediana - munPc) * num(alvo.pop);
  // por função: onde os pares captam mais (alvos de ação)
  const fRows = await query<Record<string, unknown>>(`SELECT t.cod_ibge, e.populacao pop, t.funcao, sum(t.valor) v FROM transferencias_cgu_sc t JOIN entes_sc e ON e.cod_ibge=t.cod_ibge WHERE substring(t.ano_mes,1,4)=$1 AND ${NC} AND e.tipo='M' AND e.populacao>0 AND t.funcao NOT IN ('Sem informação','—') GROUP BY 1,2,3`, [ano]).catch(() => []);
  const paresCods = new Set(pares.map((r) => String(r.cod_ibge)));
  const funcs = [...new Set(fRows.map((r) => String(r.funcao)))];
  const gaps = funcs.map((f) => {
    const fr = fRows.filter((r) => String(r.funcao) === f);
    const mun = fr.find((r) => r.cod_ibge === cod); const munPcF = mun ? num(mun.v) / num(alvo.pop) : 0;
    const medF = _median(fr.filter((r) => paresCods.has(String(r.cod_ibge))).map((r) => num(r.v) / num(r.pop)));
    return { funcao: f, gap: Math.max(0, medF - munPcF) * num(alvo.pop) };
  }).filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 4);
  // benchmark dedicado por ÁREA (Saúde e Educação) — sempre exibido, mesmo sem lacuna
  const areaCalc = (fnome: string) => {
    const fr = fRows.filter((r) => String(r.funcao) === fnome);
    const mun = fr.find((r) => r.cod_ibge === cod); const mp = mun ? num(mun.v) / num(alvo.pop) : 0;
    const medF = _median(fr.filter((r) => paresCods.has(String(r.cod_ibge))).map((r) => num(r.v) / num(r.pop)));
    return { area: fnome, munPc: mp, medPc: medF, posicao: mp >= medF * 1.1 ? "acima" : mp <= medF * 0.9 ? "abaixo" : "na média", gap: Math.max(0, medF - mp) * num(alvo.pop) };
  };
  const areas = ["Saúde", "Educação"].map(areaCalc);
  return { ano, voluntarias: num(alvo.vol), perCapita: munPc, paresMediana: mediana, posicao, percentil, dinheiroNaMesa, faixa: _faixa(num(alvo.pop)), nPares: pares.length, gaps, areas, extraido: null };
}

// Transferências federais recebidas pelo GOVERNO MUNICIPAL (CGU/Portal da Transparência, download em massa). Só administração pública municipal.
export async function getTransferenciasCguSC(cod: string): Promise<{ ano: string; total: number; serie: { ano: string; total: number; constitucionais: number; voluntarias: number }[]; parcial: { ano: string; meses: number; total: number } | null; porTipo: { tipo: string; valor: number }[]; porOrgao: { orgao: string; valor: number }[]; porFuncao: { funcao: string; valor: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT tipo_transferencia, orgao, funcao, valor, ano_mes, atualizado FROM transferencias_cgu_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoDe = (r: Record<string, unknown>) => String(r.ano_mes || "").slice(0, 4);
  // série anual (só anos com 12 meses completos entram como comparáveis; aqui somamos o que há)
  const mesesPorAno: Record<string, Set<string>> = {};
  for (const r of rows) { (mesesPorAno[anoDe(r)] ||= new Set()).add(String(r.ano_mes)); }
  const anosCompletos = Object.entries(mesesPorAno).filter(([, s]) => s.size >= 12).map(([a]) => a);
  const serieMap: Record<string, { total: number; constitucionais: number; voluntarias: number }> = {};
  for (const r of rows) { const a = anoDe(r); if (!anosCompletos.includes(a)) continue; const s = (serieMap[a] ||= { total: 0, constitucionais: 0, voluntarias: 0 }); const v = num(r.valor); s.total += v; if (/constituc/i.test(String(r.tipo_transferencia))) s.constitucionais += v; else s.voluntarias += v; }
  const serie = Object.entries(serieMap).map(([ano, v]) => ({ ano, ...v })).sort((a, b) => a.ano.localeCompare(b.ano));
  // ano corrente PARCIAL (mais recente com < 12 meses) — mostrado à parte, sem entrar na comparação anual
  const parciais = Object.entries(mesesPorAno).filter(([, s]) => s.size < 12 && s.size > 0).map(([a, s]) => ({ ano: a, meses: s.size })).sort((a, b) => b.ano.localeCompare(a.ano));
  const parcial = parciais.length ? { ...parciais[0], total: rows.filter((r) => anoDe(r) === parciais[0].ano).reduce((s, r) => s + num(r.valor), 0) } : null;
  const ano = anosCompletos.sort().slice(-1)[0] || anoDe(rows[0]);
  const rowsAno = rows.filter((r) => anoDe(r) === ano);
  const grp = (campo: string, src: Record<string, unknown>[], relabel?: (v: string) => string) => {
    const m: Record<string, number> = {};
    for (const r of src) { let k = String(r[campo] || "—"); if (relabel) k = relabel(k); m[k] = (m[k] || 0) + num(r.valor); }
    return Object.entries(m).map(([k, valor]) => ({ k, valor })).sort((a, b) => b.valor - a.valor);
  };
  const orgaoLbl = (o: string) => /sem informa/i.test(o) ? "Constitucionais (FPM/FUNDEB/cota-partes)" : o.replace(/ - Unidades com vínculo direto/i, "");
  return {
    ano, total: rowsAno.reduce((s, r) => s + num(r.valor), 0), serie, parcial,
    porTipo: grp("tipo_transferencia", rowsAno).map((x) => ({ tipo: x.k, valor: x.valor })),
    porOrgao: grp("orgao", rowsAno, orgaoLbl).slice(0, 8).map((x) => ({ orgao: x.k, valor: x.valor })),
    porFuncao: grp("funcao", rowsAno).filter((x) => x.k !== "—" && x.k !== "Sem informação").slice(0, 8).map((x) => ({ funcao: x.k, valor: x.valor })),
    extraido: dExtr(rows[0].atualizado),
  };
}

// BANCO DE PREÇOS — busca por descrição sobre preços de referência (compras municipais SC + Banco de Preços em Saúde).
export async function getBancoPrecosSC(q: string): Promise<{ item: string; unidade: string | null; mediana: number; faixaMin: number | null; faixaMax: number | null; n: number; nMunis: number | null; fonte: string; catmat: string | null; nacMediana: number | null; nacN: number | null; indicioPct: number | null; avulso: number | null; escala: number | null; escalaN: number | null; escalaEconomiaPct: number | null }[]> {
  const termo = (q || "").trim(); if (termo.length < 2) return [];
  const like = "%" + termo.replace(/\s+/g, "%") + "%";
  const ref = await query<Record<string, unknown>>(`SELECT r.chave, r.unidade, r.mediana, r.p25, r.p75, r.n_itens, r.n_munis, r.catmat_pdm, r.catmat_cod FROM precos_referencia_sc r WHERE r.chave ILIKE $1 ORDER BY r.n_itens DESC LIMIT 12`, [like]).catch(() => []);
  // referência nacional quebrada por forma de aquisição (avulso × escala) — Painel de Preços
  const pdms = [...new Set(ref.map((r) => r.catmat_cod).filter((x) => x != null))];
  const nacRows = pdms.length ? await query<Record<string, unknown>>(`SELECT codigo_pdm, unidade, forma, mediana, n_obs FROM precos_nacional_ref WHERE codigo_pdm = ANY($1)`, [pdms]).catch(() => []) : [];
  const bps = await query<Record<string, unknown>>(`SELECT cod_catmat, descricao, mediana, media, minimo FROM bps_precos_ref WHERE descricao ILIKE $1 ORDER BY length(descricao) LIMIT 10`, [like]).catch(() => []);
  const a = ref.map((r) => {
    const med = num(r.mediana);
    const nrs = nacRows.filter((n) => String(n.codigo_pdm) === String(r.catmat_cod) && String(n.unidade) === String(r.unidade));
    const av = nrs.find((n) => n.forma === "avulso"); const es = nrs.find((n) => n.forma === "escala");
    const avPrec = av ? num(av.mediana) : null; const esPrec = es ? num(es.mediana) : null;
    // referência nacional p/ o indício = a forma avulsa (comparável ao preço unitário municipal); cai p/ escala se só houver ela
    const nac = avPrec ?? esPrec; const nacN = av ? num(av.n_obs) : (es ? num(es.n_obs) : null);
    const econRaw = avPrec && esPrec && avPrec > 0 ? Math.round((1 - esPrec / avPrec) * 1000) / 10 : null;
    // guarda de plausibilidade: economia de escala crível fica ≤85%; unidades contínuas (grama/mililitro) têm
    // lançamento avulso não confiável (produto inteiro lançado como 1g) → suprimimos o comparativo nesses casos
    const contInstavel = ["grama", "mililitro"].includes(String(r.unidade || ""));
    const escalaEconomiaPct = econRaw != null && !contInstavel && Math.abs(econRaw) <= 85 ? econRaw : null;
    return { item: String(r.catmat_pdm || r.chave || ""), unidade: r.unidade ? String(r.unidade) : null, mediana: med, faixaMin: r.p25 != null ? num(r.p25) : null, faixaMax: r.p75 != null ? num(r.p75) : null, n: num(r.n_itens), nMunis: r.n_munis != null ? num(r.n_munis) : null, fonte: "Compras municipais (SC)", catmat: r.catmat_pdm ? String(r.catmat_pdm) : null, nacMediana: nac, nacN, indicioPct: nac && nac > 0 ? Math.round(((med / nac) - 1) * 1000) / 10 : null, avulso: avPrec, escala: esPrec, escalaN: es ? num(es.n_obs) : null, escalaEconomiaPct };
  });
  const b = bps.map((r) => ({ item: String(r.descricao || ""), unidade: null as string | null, mediana: num(r.mediana), faixaMin: r.minimo != null ? num(r.minimo) : null, faixaMax: r.media != null ? num(r.media) : null, n: 0, nMunis: null as number | null, fonte: "Banco de Preços em Saúde (BPS/Min. Saúde)", catmat: r.cod_catmat ? String(r.cod_catmat) : null, nacMediana: null as number | null, nacN: null as number | null, indicioPct: null as number | null, avulso: null as number | null, escala: null as number | null, escalaN: null as number | null, escalaEconomiaPct: null as number | null }));
  return [...a, ...b].filter((x) => x.mediana > 0).slice(0, 20);
}

// Salário-Educação (cota municipal) + total FNDE, por município. Fonte: SICONFI DCA I-C (salario_educacao_sc).
export async function getSalarioEducacaoSC(cod: string): Promise<{ ano: number; salarioEducacao: number | null; fndeTotal: number | null; pctFnde: number | null; serie: { ano: number; se: number | null; fnde: number | null }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, salario_educacao, fnde_total, atualizado FROM salario_educacao_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const serie = rows.map((r) => ({ ano: num(r.ano), se: r.salario_educacao != null ? num(r.salario_educacao) : null, fnde: r.fnde_total != null ? num(r.fnde_total) : null }));
  const ult = serie[serie.length - 1];
  const pctFnde = ult.se != null && ult.fnde ? Math.round((ult.se / ult.fnde) * 1000) / 10 : null;
  return { ano: ult.ano, salarioEducacao: ult.se, fndeTotal: ult.fnde, pctFnde, serie, extraido: dExtr(rows[0].atualizado) };
}

// SAEB — proficiência em Português e Matemática (escala SAEB) por etapa, série + comparação com a mediana de SC. Fonte: saeb_sc.
export async function getSaebSC(cod: string): Promise<{ ano: number; etapas: { etapa: string; label: string; rede: string; mat: number | null; port: number | null; matMedSC: number | null; portMedSC: number | null; serie: { ano: number; mat: number | null; port: number | null }[]; tend: string }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, etapa, rede, matematica, portugues, atualizado FROM saeb_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoMax = Math.max(...rows.map((r) => num(r.ano)));
  const scRows = await query<Record<string, unknown>>(`SELECT etapa, matematica, portugues FROM saeb_sc WHERE ano=$1 AND cod_ibge LIKE '42%' AND rede IN ('Municipal','Pública')`, [anoMax]).catch(() => []);
  const medOf = (et: string, disc: string) => { const v = _median(scRows.filter((r) => r.etapa === et && num(r[disc]) > 0).map((r) => num(r[disc]))); return v || null; };
  const tend = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x != null); if (v.length < 2) return "sd"; const d = v[v.length - 1] - v[0]; return d > 1 ? "subiu" : d < -1 ? "caiu" : "estável"; };
  const pref = ["Municipal", "Pública", "Estadual"]; const LBL: Record<string, string> = { AI: "Anos Iniciais (5º ano)", AF: "Anos Finais (9º ano)", EM: "Ensino Médio" };
  const etapas = ["AI", "AF", "EM"].map((et) => {
    const doEt = rows.filter((r) => r.etapa === et); if (!doEt.length) return null;
    const rede = pref.find((p) => doEt.some((r) => r.rede === p)) || String(doEt[0].rede);
    const serie = doEt.filter((r) => r.rede === rede).map((r) => ({ ano: num(r.ano), mat: num(r.matematica) || null, port: num(r.portugues) || null })).filter((x) => x.mat || x.port).sort((a, b) => a.ano - b.ano);
    if (!serie.length) return null;
    const at = serie[serie.length - 1];
    return { etapa: et, label: LBL[et], rede, mat: at.mat, port: at.port, matMedSC: medOf(et, "matematica"), portMedSC: medOf(et, "portugues"), serie, tend: tend(serie.map((s) => s.port ?? s.mat)) };
  }).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getSaebSC>>>["etapas"];
  if (!etapas.length) return null;
  return { ano: anoMax, etapas, extraido: dExtr(rows[0].atualizado) };
}

// Trajetória histórica das metas de educação — "estamos melhorando?" (IDEB + aplicação MDE). Fontes: ideb_sc, rreo_const_sc.
export async function getEducacaoTrajetoriaSC(cod: string): Promise<{ ideb: { ano: number; ai: number | null; af: number | null }[]; mde: { ano: number; pct: number }[]; tendIdeb: string; tendMde: string; extraido: string | null } | null> {
  const idebRows = await query<Record<string, unknown>>(`SELECT ano, etapa, rede, ideb FROM ideb_sc WHERE cod_ibge=$1 AND etapa IN ('AI','AF') ORDER BY ano`, [cod]).catch(() => []);
  const pref = ["Municipal", "Pública", "Estadual"];
  const pick = (ano: number, et: string) => { const cand = idebRows.filter((r) => num(r.ano) === ano && r.etapa === et); for (const rd of pref) { const r = cand.find((x) => x.rede === rd); if (r) return num(r.ideb); } return null; };
  const anos = [...new Set(idebRows.map((r) => num(r.ano)))].sort((a, b) => a - b);
  const ideb = anos.map((ano) => ({ ano, ai: pick(ano, "AI"), af: pick(ano, "AF") }));
  const mdeRows = await query<Record<string, unknown>>(`SELECT ano, educacao_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY ano`, [cod]).catch(() => []);
  const mde = mdeRows.map((r) => ({ ano: num(r.ano), pct: Math.round(num(r.educacao_pct) * 10) / 10 }));
  const tend = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x != null); if (v.length < 2) return "sd"; const d = v[v.length - 1] - v[0]; return d > 0.05 ? "melhorando" : d < -0.05 ? "piorando" : "estável"; };
  if (!ideb.length && !mde.length) return null;
  return { ideb, mde, tendIdeb: tend(ideb.map((x) => x.ai ?? x.af)), tendMde: tend(mde.map((x) => x.pct)), extraido: null };
}

// Valorização dos profissionais da educação (PNE Metas 15-18) — formação (AFD/INEP) + planos de carreira (MUNIC).
export async function getValorizacaoMagisterioSC(cod: string): Promise<{ formacaoAI: number | null; formacaoAF: number | null; superiorAI: number | null; superiorAF: number | null; temPlanoDocente: boolean | null; temPlanoNaoDocente: boolean | null; extraido: string | null } | null> {
  const afd = (await query<Record<string, unknown>>(`SELECT fun_ai, fun_af, atualizado FROM indicadores_inep_sc WHERE cod_ibge=$1 AND indicador='AFD' ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const dsu = (await query<Record<string, unknown>>(`SELECT fun_ai, fun_af FROM indicadores_inep_sc WHERE cod_ibge=$1 AND indicador='DSU' ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const munic = await query<Record<string, unknown>>(`SELECT indicador, tem FROM munic_sc WHERE cod_ibge=$1 AND indicador IN ('MEDU16','MEDU21')`, [cod]).catch(() => []);
  const temM = (id: string) => { const r = munic.find((x) => x.indicador === id); return r ? r.tem === true : null; };
  if (!afd && !dsu && !munic.length) return null;
  return { formacaoAI: afd ? num(afd.fun_ai) : null, formacaoAF: afd ? num(afd.fun_af) : null, superiorAI: dsu ? num(dsu.fun_ai) : null, superiorAF: dsu ? num(dsu.fun_af) : null, temPlanoDocente: temM("MEDU16"), temPlanoNaoDocente: temM("MEDU21"), extraido: afd ? dExtr(afd.atualizado) : null };
}

// ===== DIAGNÓSTICO DA EDUCAÇÃO MUNICIPAL alinhado ao PNE (base: Diagnóstico da Educação Nacional/MEC 2025) =====
// Espelha as Metas do Plano Nacional de Educação com os dados municipais que temos, organizadas pelos Eixos do documento.
export type PneMeta = { meta: string; titulo: string; indicador: string; valor: number | null; unidade: string; referencia: string; refNum: number | null; maior_melhor: boolean; situacao: "atingida" | "evolucao" | "distante" | "sd"; aprox?: boolean; nota?: string };
export type PneEixo = { n: number; titulo: string; metas: PneMeta[] };
export type DiagnosticoPne = { temPme: boolean | null; eixos: PneEixo[]; resumo: { atingida: number; evolucao: number; distante: number; sd: number }; extraido: string | null } | null;
export async function getDiagnosticoEducacaoPneSC(cod: string): Promise<DiagnosticoPne> {
  const mat = (await query<Record<string, unknown>>(`SELECT creche,creche_int,pre,pre_int,fund_ai,fund_af,medio,total,total_int,atualizado FROM fundeb_matriculas_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!mat) return null;
  const pf = (await query<Record<string, unknown>>(`SELECT faixas FROM populacao_faixa_sc WHERE cod_ibge=$1 LIMIT 1`, [cod]).catch(() => []))[0];
  const fx = (pf?.faixas || {}) as Record<string, number>;
  const p04 = num(fx["0-4"]), p59 = num(fx["5-9"]), p1014 = num(fx["10-14"]);
  // matrículas de TODAS as redes por etapa (Censo Escolar) — cobertura real, não só a rede municipal
  const cm = await query<Record<string, unknown>>(`SELECT etapa, matriculas FROM censo_matricula_sc WHERE cod_ibge=$1 ORDER BY ano DESC`, [cod]).catch(() => []);
  const cmMap: Record<string, number> = {}; for (const r of cm) { const e = String(r.etapa); if (!(e in cmMap)) cmMap[e] = num(r.matriculas); }
  const matCreche = cmMap["Creche"] ?? num(mat.creche);
  const matPre = cmMap["Pré-Escola"] ?? num(mat.pre);
  const matFund = cmMap["Ensino Fundamental"] || (num(mat.fund_ai) + num(mat.fund_af));
  const matEsp = cmMap["Educação Especial"] ?? null;
  const pctEsp = matEsp != null && cmMap["Total"] ? Math.round((matEsp / cmMap["Total"]) * 1000) / 10 : null;
  const inep = await query<Record<string, unknown>>(`SELECT indicador, fun_ai, fun_af, medio FROM indicadores_inep_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  const ind = (nome: string) => inep.find((r) => r.indicador === nome);
  const ideb = await query<Record<string, unknown>>(`SELECT etapa, rede, ideb, meta FROM ideb_sc WHERE cod_ibge=$1 ORDER BY ano DESC`, [cod]).catch(() => []);
  const idebDe = (et: string) => { const pref = ["Municipal", "Pública", "Estadual"]; for (const rd of pref) { const r = ideb.find((x) => x.etapa === et && x.rede === rd); if (r) return { ideb: num(r.ideb), meta: r.meta != null ? num(r.meta) : null }; } return null; };
  const alfab = num((await query<Record<string, unknown>>(`SELECT taxa FROM alfabetizacao_sc WHERE cod_ibge=$1 LIMIT 1`, [cod]).catch(() => []))[0]?.taxa) || null;
  const mde = (await query<Record<string, unknown>>(`SELECT educacao_pct FROM rreo_const_sc WHERE cod_ibge=$1 AND educacao_pct IS NOT NULL ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const munic = await query<Record<string, unknown>>(`SELECT indicador, tem FROM munic_sc WHERE cod_ibge=$1 AND indicador IN ('MEDU14','MEDU16','MEDU22')`, [cod]).catch(() => []);
  const temM = (id: string) => { const r = munic.find((x) => x.indicador === id); return r ? r.tem === true : null; };

  const sit = (v: number | null, ref: number, maior: boolean, tolPct = 0.9): PneMeta["situacao"] => { if (v == null) return "sd"; if (maior) return v >= ref ? "atingida" : v >= ref * tolPct ? "evolucao" : "distante"; return v <= ref ? "atingida" : v <= ref / tolPct ? "evolucao" : "distante"; };
  const cob = (m: number, den: number) => den > 0 ? Math.round((m / den) * 1000) / 10 : null;

  const capCob = (m: number, den: number) => { const v = cob(m, den); return v == null ? null : Math.min(100, v); };
  // denominador EXATO por idade individual (populacao_idade_sc); fallback = aproximação por faixa de 5 anos
  const pi = (await query<Record<string, unknown>>(`SELECT creche_0_3, pre_4_5, fund_6_14 FROM populacao_idade_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  const exato = !!(pi && num(pi.creche_0_3) > 0);
  const den03 = exato ? num(pi.creche_0_3) : p04 * 0.8;
  const den45 = exato ? num(pi.pre_4_5) : p04 * 0.2 + p59 * 0.2;
  const den614 = exato ? num(pi.fund_6_14) : p59 * 0.8 + p1014;
  const crecheCob = cob(matCreche, den03); // meta 50%, não precisa cap
  const preCob = capCob(matPre, den45);
  const fundCob = capCob(matFund, den614);
  const integralCob = num(mat.total) > 0 ? Math.round((num(mat.total_int) / num(mat.total)) * 1000) / 10 : null;
  const afdAI = num(ind("AFD")?.fun_ai) || null, afdAF = num(ind("AFD")?.fun_af) || null;
  const afd = afdAI != null && afdAF != null ? Math.round(((afdAI + afdAF) / 2) * 10) / 10 : (afdAI ?? afdAF);
  const tdiAF = num(ind("TDI")?.fun_af) || null;
  const idAI = idebDe("AI"), idAF = idebDe("AF");
  const mdePct = mde ? num(mde.educacao_pct) : null;

  const M = (meta: string, titulo: string, indicador: string, valor: number | null, unidade: string, referencia: string, refNum: number | null, maior: boolean, extra?: Partial<PneMeta>): PneMeta => ({ meta, titulo, indicador, valor, unidade, referencia, refNum, maior_melhor: maior, situacao: refNum == null ? (valor == null ? "sd" : "atingida") : sit(valor, refNum, maior), ...extra });
  const bool = (meta: string, titulo: string, indicador: string, v: boolean | null): PneMeta => ({ meta, titulo, indicador, valor: null, unidade: "", referencia: "exigido pelo PNE", refNum: null, maior_melhor: true, situacao: v == null ? "sd" : v ? "atingida" : "distante", nota: v == null ? undefined : v ? "possui" : "não possui" });

  const eixos: PneEixo[] = [
    { n: 1, titulo: "O PNE no município — instrumento de planejamento", metas: [
      bool("PME", "Plano Municipal de Educação vigente", "IBGE MUNIC", temM("MEDU14")),
    ] },
    { n: 2, titulo: "Garantia do direito à educação (acesso e trajetória)", metas: [
      M("M1", "Creche — atendimento de 0 a 3 anos (todas as redes)", "matrículas ÷ população", crecheCob, "%", "50% (PNE)", 50, true, { aprox: !exato, nota: "taxa bruta: matrículas de todas as redes ÷ população de 0 a 3 anos" + (exato ? " (idade exata, Censo 2022)" : " (aprox. por faixa de 5 anos)") }),
      M("M1", "Pré-escola — atendimento de 4 e 5 anos (todas as redes)", "matrículas ÷ população", preCob, "%", "100% (PNE)", 100, true, { aprox: !exato, nota: "taxa bruta (todas as redes ÷ população de 4-5 anos" + (exato ? ", idade exata" : ", aprox.") + "); próximo de 100% = pré-escola universalizada" }),
      M("M2", "Ensino fundamental — atendimento de 6 a 14 anos (todas as redes)", "matrículas ÷ população", fundCob, "%", "≈universal", 95, true, { aprox: !exato, nota: "taxa bruta (todas as redes ÷ população de 6-14 anos" + (exato ? ", idade exata" : ", aprox.") + "); próximo de 100% = fundamental universalizado" }),
      M("M6", "Educação em tempo integral", "% das matrículas", integralCob, "%", "25% (PNE)", 25, true),
      M("M9", "Alfabetização da população adulta (15+)", "taxa de alfabetização", alfab, "%", "93,5% (PNE)", 93.5, true),
    ] },
    { n: 3, titulo: "Educação, direitos humanos, inclusão e diversidade", metas: [
      M("M4", "Educação especial — matrículas (inclusão)", "matrículas (todas as redes)", matEsp, "", "atendimento universal", null, true, { nota: (pctEsp != null ? `${pctEsp}% do total de matrículas do município · ` : "") + "o percentual incluído em classe comum exige recorte específico do INEP (indisponível em dado aberto)" }),
    ] },
    { n: 4, titulo: "Gestão democrática e qualidade da educação", metas: [
      M("M7", "IDEB — anos iniciais do fundamental", "IDEB", idAI?.ideb ?? null, "", idAI?.meta ? `meta ${idAI.meta}` : "6,0 (PNE)", idAI?.meta ?? 6.0, true),
      M("M7", "IDEB — anos finais do fundamental", "IDEB", idAF?.ideb ?? null, "", idAF?.meta ? `meta ${idAF.meta}` : "5,5 (PNE)", idAF?.meta ?? 5.5, true),
      M("M2", "Distorção idade-série — anos finais", "% em distorção", tdiAF, "%", "reduzir (quanto menor, melhor)", 15, false),
      bool("M19", "Conselho Municipal de Educação instituído", "IBGE MUNIC", temM("MEDU22")),
    ] },
    { n: 5, titulo: "Valorização dos profissionais da educação", metas: [
      M("M15", "Formação adequada dos docentes", "% com formação na área", afd, "%", "100% (PNE)", 100, true, { nota: "média anos iniciais e finais" }),
      bool("M18", "Plano de Carreira do Magistério", "IBGE MUNIC", temM("MEDU16")),
    ] },
    { n: 6, titulo: "Financiamento da educação", metas: [
      M("M20", "Aplicação em Manutenção e Desenvolvimento do Ensino", "% da receita de impostos", mdePct, "%", "mínimo 25% (CF)", 25, true),
    ] },
  ];
  const flat = eixos.flatMap((e) => e.metas);
  const resumo = { atingida: flat.filter((m) => m.situacao === "atingida").length, evolucao: flat.filter((m) => m.situacao === "evolucao").length, distante: flat.filter((m) => m.situacao === "distante").length, sd: flat.filter((m) => m.situacao === "sd").length };
  return { temPme: temM("MEDU14"), eixos, resumo, extraido: dExtr(mat.atualizado) };
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

// Gasto efetivado por categoria oficial CATMAT/CATSER (classe), cruzando itens_sc × itens_classificacao_sc.
// Read-only sobre as compras. Mostra para onde vai o dinheiro por categoria do catálogo federal (eixo nacional).
export type ComprasCategorias = {
  totalEfetivado: number;            // gasto efetivado total (efetivadas, com cap de outlier)
  classificado: number;              // parcela com categoria CATMAT/CATSER
  pctClassificado: number;           // % do valor classificado
  nClasses: number;                  // nº de categorias distintas
  categorias: { classe: string; tipo: string; valor: number; pct: number; conf: string; nDescr: number }[];
} | null;
export async function getComprasCategoriasSC(cod: string): Promise<ComprasCategorias> {
  const ITCTE = `it AS (
    SELECT ${_NORM_ITEM} k, i.tipo, sum(quantidade*unit_homologado) valor
    FROM itens_sc i WHERE cod_ibge=$1 AND unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND descricao IS NOT NULL AND NOT ${_ATA}
    GROUP BY 1,2)`;
  const [tot, cats] = await Promise.all([
    query<Record<string, unknown>>(`WITH ${ITCTE}
      SELECT round(sum(it.valor)) total,
             round(sum(it.valor) FILTER (WHERE c.cat_cod IS NOT NULL)) classificado,
             count(distinct c.cat_classe) FILTER (WHERE c.cat_cod IS NOT NULL) n_classes
      FROM it LEFT JOIN itens_classificacao_sc c ON c.descr_norm=it.k AND c.tipo=it.tipo`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH ${ITCTE}
      SELECT c.cat_classe classe, it.tipo, round(sum(it.valor)) valor, count(*) n_descr,
             mode() WITHIN GROUP (ORDER BY c.confianca) conf
      FROM it JOIN itens_classificacao_sc c ON c.descr_norm=it.k AND c.tipo=it.tipo
      WHERE c.cat_cod IS NOT NULL AND c.cat_classe IS NOT NULL
      GROUP BY 1,2 ORDER BY valor DESC NULLS LAST LIMIT 15`, [cod]).catch(() => []),
  ]);
  const t0 = tot[0];
  if (!t0 || num(t0.total) === 0 || !cats.length) return null;
  const total = num(t0.total), classificado = num(t0.classificado);
  return {
    totalEfetivado: total, classificado, pctClassificado: total > 0 ? Math.round((classificado / total) * 100) : 0,
    nClasses: num(t0.n_classes),
    categorias: cats.map((r) => ({ classe: String(r.classe || ""), tipo: String(r.tipo || ""), valor: num(r.valor), pct: classificado > 0 ? Math.round((num(r.valor) / classificado) * 100) : 0, conf: String(r.conf || "sem"), nDescr: num(r.n_descr) })),
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

// Convênios / contratos de repasse do município (SICONV/Transferegov) — captado, executado, por situação. Tom neutro.
export type ConveniosSC = {
  n: number; repasse: number; desembolsado: number; execPct: number;
  porSituacao: { situacao: string; n: number; valor: number }[];
} | null;
export async function getConveniosSC(cod: string): Promise<ConveniosSC> {
  // Fonte: convenios_captados_sc (Portal da Transparência por codigoIBGE, SÓ convenente de administração MUNICIPAL).
  // Evita a contaminação da base SICONV (convenios_sc), onde propostas do ente ESTADUAL — sede na capital —
  // eram atribuídas ao município da capital pelo COD_MUNIC_IBGE do proponente.
  const [tot, sit] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor),0) repasse, coalesce(sum(valor_liberado),0) desemb FROM convenios_captados_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT coalesce(NULLIF(situacao,''),'(sem situação)') situacao, count(*) n, coalesce(sum(valor),0) valor FROM convenios_captados_sc WHERE cod_ibge=$1 GROUP BY 1 ORDER BY valor DESC NULLS LAST LIMIT 8`, [cod]).catch(() => []),
  ]);
  if (!tot.length || num(tot[0]?.n) === 0) return null;
  const repasse = num(tot[0].repasse), desemb = num(tot[0].desemb);
  return {
    n: num(tot[0].n), repasse, desembolsado: desemb, execPct: repasse > 0 ? Math.round((desemb / repasse) * 100) : 0,
    porSituacao: sit.map((r) => ({ situacao: String(r.situacao || ""), n: num(r.n), valor: num(r.valor) })),
  };
}

// Resumo do sistema de notificações do município — alertas ativos (delta no log), escalonados (crítico sem tratar
// há +30 dias, sobe de nível) e o painel de IMPACTO (o ROI: resolvidos, recurso destravado/captado). Serviço i10.
export type NotificacaoResumoSC = {
  ativos: number; criticosAtivos: number; escalonados: number; cadastrados: number;
  impacto: { tipo: string; n: number; valor: number }[]; valorImpacto: number;
} | null;
export async function getNotificacaoResumoSC(cod: string): Promise<NotificacaoResumoSC> {
  const [log, cad, imp] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) FILTER (WHERE resolvido_em IS NULL) ativos,
      count(*) FILTER (WHERE resolvido_em IS NULL AND severidade='critico') criticos,
      count(*) FILTER (WHERE resolvido_em IS NULL AND severidade='critico' AND enviado_em < now() - interval '30 days') escalonados
      FROM notificacao_log WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n FROM notificacao_cadastro WHERE cod_ibge=$1 AND ativo`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT tipo_impacto tipo, count(*) n, coalesce(sum(valor),0) valor FROM notificacao_impacto WHERE cod_ibge=$1 GROUP BY 1`, [cod]).catch(() => []),
  ]);
  const l = log[0] || {};
  const impacto = imp.map((r) => ({ tipo: String(r.tipo || ""), n: num(r.n), valor: num(r.valor) }));
  return {
    ativos: num(l.ativos), criticosAtivos: num(l.criticos), escalonados: num(l.escalonados), cadastrados: num(cad[0]?.n),
    impacto, valorImpacto: impacto.reduce((s, x) => s + x.valor, 0),
  };
}

// Convênios A REGULARIZAR — situações que travam NOVAS transferências voluntárias da União (ligam ao CAUC).
// Crítico: inadimplente / prestação rejeitada. Atenção: inadimplência suspensa / aguardando ou complementar prestação.
export type ConveniosRiscoSC = {
  criticoN: number; criticoValor: number; atencaoN: number; atencaoValor: number;
  itens: { objeto: string; orgao: string; situacao: string; valor: number; ano: number; classe: "critico" | "atencao" }[];
} | null;
const CONV_CRIT = ["INADIMPLENTE", "PRESTAÇÃO DE CONTAS REJEITADA"];
const CONV_ATEN = ["INADIMPLÊNCIA SUSPENSA", "AGUARDANDO PRESTAÇÃO DE CONTAS", "PRESTAÇÃO DE CONTAS EM COMPLEMENTAÇÃO"];
export async function getConveniosRiscoSC(cod: string): Promise<ConveniosRiscoSC> {
  const crit = `situacao = ANY($2)`, aten = `situacao = ANY($3)`;
  const [agg, itens] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) FILTER (WHERE ${crit}) cn, coalesce(sum(valor) FILTER (WHERE ${crit}),0) cv,
      count(*) FILTER (WHERE ${aten}) an, coalesce(sum(valor) FILTER (WHERE ${aten}),0) av
      FROM convenios_captados_sc WHERE cod_ibge=$1`, [cod, CONV_CRIT, CONV_ATEN]).catch(() => []),
    query<Record<string, unknown>>(`SELECT objeto, orgao, situacao, valor, ano FROM convenios_captados_sc
      WHERE cod_ibge=$1 AND (${crit} OR ${aten}) ORDER BY valor DESC NULLS LAST LIMIT 10`, [cod, CONV_CRIT, CONV_ATEN]).catch(() => []),
  ]);
  const a = agg[0]; if (!a || (num(a.cn) === 0 && num(a.an) === 0)) return null;
  return {
    criticoN: num(a.cn), criticoValor: num(a.cv), atencaoN: num(a.an), atencaoValor: num(a.av),
    itens: itens.map((r) => ({ objeto: String(r.objeto || ""), orgao: String(r.orgao || ""), situacao: String(r.situacao || ""), valor: num(r.valor), ano: num(r.ano), classe: CONV_CRIT.includes(String(r.situacao)) ? "critico" as const : "atencao" as const })),
  };
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
  // execução orçamentária federal (Portal da Transparência) — null enquanto o coletor de execução não rodar
  execucao: { empenhado: number; pago: number; restoPagar: number; ano: number | null; n: number } | null;
} | null;
export async function getEmendasSC(cod: string): Promise<EmendasSC> {
  // INDICAÇÃO (SICONV): quem destinou e quanto · EXECUÇÃO (Portal): empenhado×pago → "recurso na mesa". Tabelas separadas.
  const [tot, parl, exec] = await Promise.all([
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor_emenda),0) total, count(*) FILTER(WHERE impositivo) impos, coalesce(sum(valor_emenda) FILTER(WHERE impositivo),0) vimp FROM emendas_indicacao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT parlamentar, coalesce(sum(valor_emenda),0) valor, count(*) n FROM emendas_indicacao_sc WHERE cod_ibge=$1 AND parlamentar<>'' GROUP BY 1 ORDER BY valor DESC NULLS LAST LIMIT 8`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT coalesce(sum(empenhado),0) emp, coalesce(sum(pago),0) pago, coalesce(sum(greatest(empenhado-pago,0)),0) resto, max(ano) ano, count(*) n FROM emendas_execucao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!tot.length || num(tot[0]?.n) === 0) return null;
  const e0 = exec[0];
  const temExec = e0 && num(e0.n) > 0;
  return {
    total: num(tot[0].total), n: num(tot[0].n), impositivas: num(tot[0].impos), valorImpositivo: num(tot[0].vimp),
    porParlamentar: parl.map((r) => ({ parlamentar: String(r.parlamentar || ""), valor: num(r.valor), n: num(r.n) })),
    execucao: temExec ? { empenhado: num(e0.emp), pago: num(e0.pago), restoPagar: num(e0.resto), ano: e0.ano != null ? num(e0.ano) : null, n: num(e0.n) } : null,
  };
}

// CAPTAÇÃO DE EMENDAS — o "como pedir": bancada federal (quem procurar) × histórico, recurso na mesa, janelas abertas.
export type CaptacaoEmendasSC = {
  eleitores: number;
  bancada: { nome: string; casa: "camara" | "senado"; partido: string; email: string | null; telefone: string | null; foto: string | null; pagina: string | null; jaMunicipio: number; nMunicipio: number; aliado: boolean; votos: number; votosPct: number }[];
  recursoNaMesa: number; recursoItens: { autor: string; empenhado: number; pago: number; naMesa: number; naBancada: boolean }[];
  jaRecebido: number; indicadoTotal: number; impositivasN: number;
  janelas: { nome: string; orgao: string; valorGlobal: number; dtFim: string }[];
  execucaoFuncao: { funcao: string; pago: number; naMesa: number; restoAReceber: number; subfuncoes: { subfuncao: string; pago: number; naMesa: number }[] }[];
} | null;
export async function getCaptacaoEmendasSC(cod: string): Promise<CaptacaoEmendasSC> {
  const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const [banc, porMuni, exec, indic, janelas, votos, elei, execFunc] = await Promise.all([
    query<Record<string, unknown>>(`SELECT id, nome, casa, partido, email, telefone, foto_url, pagina_url FROM bancada_federal_sc WHERE uf='SC' ORDER BY nome`).catch(() => []),
    // aliados = quem EXECUTOU emenda (empenhado) no município nos últimos 4 anos — a indicação 2026 ainda está no prazo (não entregue) e tem ano nulo
    query<Record<string, unknown>>(`SELECT autor parlamentar, coalesce(sum(empenhado),0) v, count(*) n FROM emendas_execucao_sc WHERE cod_ibge=$1 AND autor<>'' AND ano >= extract(year from current_date)::int - 3 GROUP BY 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT autor, coalesce(sum(empenhado),0) emp, coalesce(sum(pago),0) pago FROM emendas_execucao_sc WHERE cod_ibge=$1 AND autor<>'' GROUP BY 1 ORDER BY (sum(empenhado)-sum(pago)) DESC NULLS LAST`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT coalesce(sum(valor_emenda),0) total, count(*) FILTER(WHERE impositivo) impos, coalesce(sum(desembolsado),0) desembolsado, coalesce(sum(empenhado),0) empenhado, count(*) n FROM emendas_indicacao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT nome, orgao, coalesce(valor_global,0) vg, to_char(dt_fim_emenda,'YYYY-MM-DD') df FROM programas_transferegov WHERE dt_fim_emenda >= CURRENT_DATE ORDER BY dt_fim_emenda LIMIT 12`).catch(() => []),
    query<Record<string, unknown>>(`SELECT bancada_id, votos FROM votos_bancada_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT eleitores FROM eleitorado_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    // o que a emenda federal FINANCIOU no município, por função (área) e subfunção — dado que estava coletado e não exibido
    query<Record<string, unknown>>(`SELECT coalesce(nullif(funcao,''),'Não classificado') funcao, coalesce(nullif(subfuncao,''),'—') subfuncao,
      coalesce(sum(pago),0) pago, coalesce(sum(greatest(empenhado-pago,0)),0) namesa, coalesce(sum(greatest(resto_inscrito-resto_pago,0)),0) resto
      FROM emendas_execucao_sc WHERE cod_ibge=$1 GROUP BY 1,2 ORDER BY 1, sum(pago) DESC`, [cod]).catch(() => []),
  ]);
  if (!banc.length) return null;
  const eleitores = num(elei[0]?.eleitores);
  const mMuni = new Map<string, { v: number; n: number }>(); for (const r of porMuni) mMuni.set(norm(r.parlamentar), { v: num(r.v), n: num(r.n) });
  const mVotos = new Map<string, number>(); for (const r of votos) mVotos.set(String(r.bancada_id), num(r.votos));
  const bancada = banc.map((b) => {
    const k = norm(b.nome); const mm = mMuni.get(k); const vt = mVotos.get(String(b.id)) || 0;
    return { nome: String(b.nome), casa: (String(b.casa) === "senado" ? "senado" : "camara") as "camara" | "senado", partido: String(b.partido || ""), email: (b.email as string) || null, telefone: (b.telefone as string) || null, foto: (b.foto_url as string) || null, pagina: (b.pagina_url as string) || null, jaMunicipio: mm?.v || 0, nMunicipio: mm?.n || 0, aliado: (mm?.v || 0) > 0, votos: vt, votosPct: eleitores > 0 ? Math.round((vt / eleitores) * 1000) / 10 : 0 };
  }).sort((a, b) => (a.casa === b.casa ? 0 : a.casa === "senado" ? -1 : 1) || a.nome.localeCompare(b.nome, "pt-BR")); // senadores (A-Z) depois deputados (A-Z)
  const benchNorm = new Set(banc.map((b) => norm(b.nome)));
  const recursoItens = exec.map((r) => ({ autor: String(r.autor || ""), empenhado: num(r.emp), pago: num(r.pago), naMesa: Math.max(0, num(r.emp) - num(r.pago)), naBancada: benchNorm.has(norm(r.autor)) })).filter((r) => r.naMesa > 0);
  const recursoNaMesa = recursoItens.reduce((s, r) => s + r.naMesa, 0);
  const jaRecebido = exec.reduce((s, r) => s + num(r.pago), 0);
  const funcMap = new Map<string, { funcao: string; pago: number; naMesa: number; restoAReceber: number; subfuncoes: { subfuncao: string; pago: number; naMesa: number }[] }>();
  for (const r of execFunc) {
    const f = String(r.funcao); if (!funcMap.has(f)) funcMap.set(f, { funcao: f, pago: 0, naMesa: 0, restoAReceber: 0, subfuncoes: [] });
    const g = funcMap.get(f)!; g.pago += num(r.pago); g.naMesa += num(r.namesa); g.restoAReceber += num(r.resto);
    g.subfuncoes.push({ subfuncao: String(r.subfuncao), pago: num(r.pago), naMesa: num(r.namesa) });
  }
  const execucaoFuncao = [...funcMap.values()].sort((a, b) => (b.pago + b.naMesa + b.restoAReceber) - (a.pago + a.naMesa + a.restoAReceber));
  return {
    bancada, eleitores, recursoNaMesa, recursoItens,
    jaRecebido, indicadoTotal: num(indic[0]?.total), impositivasN: num(indic[0]?.impos),
    janelas: janelas.map((r) => ({ nome: String(r.nome || ""), orgao: String(r.orgao || ""), valorGlobal: num(r.vg), dtFim: String(r.df || "") })),
    execucaoFuncao,
  };
}

// EMENDAS ESTADUAIS — bancada estadual (deputados ALESC eleitos) + votos/% no município. Execução (SEF-SC) é Power BI → pendente.
export type EmendasEstaduaisSC = {
  eleitores: number; execPago: number;
  bench: { nome: string; partido: string; votos: number; votosPct: number; emendasTotal: number; foto: string | null; email: string | null; telefone: string | null; pagina: string | null }[];
} | null;
export async function getEmendasEstaduaisSC(cod: string): Promise<EmendasEstaduaisSC> {
  const [banc, elei, exec] = await Promise.all([
    query<Record<string, unknown>>(`SELECT b.nome, b.partido, coalesce(v.votos,0) votos, coalesce(b.emendas_total,0) emendas_total, b.foto_url, b.email, b.telefone, b.pagina_url FROM bancada_estadual_sc b LEFT JOIN votos_estadual_sc v ON v.bancada_id=b.id AND v.cod_ibge=$1 ORDER BY b.nome`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT eleitores FROM eleitorado_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT valor_pago FROM emendas_estaduais_exec_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!banc.length) return null;
  const eleitores = num(elei[0]?.eleitores);
  return {
    eleitores, execPago: num(exec[0]?.valor_pago),
    bench: banc.map((b) => { const vt = num(b.votos); return { nome: String(b.nome), partido: String(b.partido || ""), votos: vt, votosPct: eleitores > 0 ? Math.round((vt / eleitores) * 1000) / 10 : 0, emendasTotal: num(b.emendas_total), foto: (b.foto_url as string) || null, email: (b.email as string) || null, telefone: (b.telefone as string) || null, pagina: (b.pagina_url as string) || null }; }),
  };
}

// Catálogo REAL de objetos de emendas ESTADUAIS 2026 (Power BI SEF) — as "possibilidades reais" p/ o caderno estadual.
// Top 40 por área (por valor), reusa o formato CadernoPrograma p/ render/incorporação idênticos ao federal.
const ORGAO_OBJ_EST: Record<string, string> = { saude: "Secretaria de Estado da Saúde (SES)", educacao: "Secretaria de Estado da Educação (SED)", infraestrutura: "Secretaria de Infraestrutura e Mobilidade (SIE)", seguranca: "Secretaria de Segurança Pública (SSP)", agricultura: "Secretaria de Agricultura, Pesca e Desenv. Rural (SAR)", assistencia: "Secretaria de Assistência Social, Mulher e Família (SAS)", esporte: "Turismo, Cultura e Esporte (SOL) / FESPORTE", cultura: "Turismo, Cultura e Esporte (SOL) / FCC", habitacao: "Habitação de interesse social (Estado/COHAB)", outros: "Secretaria de Estado (a definir conforme o objeto)" };
export async function getEmendasEstObjetosSC(): Promise<CadernoPrograma[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT id, area, objeto, valor FROM (
      SELECT id, area, objeto, valor, ROW_NUMBER() OVER (PARTITION BY area ORDER BY valor DESC NULLS LAST) rn
      FROM emendas_est_objetos_sc WHERE ano=2026
    ) t WHERE rn <= 40 ORDER BY area, valor DESC`).catch(() => []);
  return rows.map((r) => {
    const objeto = String(r.objeto || "").trim();
    const nome = objeto.length > 90 ? objeto.slice(0, 90).trim() + "…" : objeto;
    return { id: `obj-${r.id}`, nome, orgao: ORGAO_OBJ_EST[String(r.area)] || ORGAO_OBJ_EST.outros, area: String(r.area), valor: num(r.valor), objetivo: objeto, elegivel: true, janelaEmenda: null };
  });
}

// BUSCA & AGREGA — programas federais REAIS (Transferegov) casados com o município, p/ compor o Caderno de Emendas.
// Classifica cada programa por área, checa elegibilidade e janela de emenda, e rankeia (elegível > janela aberta > valor).
export type CadernoPrograma = { id: string; nome: string; orgao: string; area: string; valor: number; objetivo: string; elegivel: boolean; janelaEmenda: string | null };
export async function getCadernoProgramasSC(cod: string): Promise<CadernoPrograma[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT p.id_programa id, p.nome, coalesce(p.orgao,'') orgao, coalesce(p.valor_global,0) valor, coalesce(p.objetivo,p.descricao,'') objetivo,
           to_char(p.dt_fim_emenda,'YYYY-MM-DD') janela,
           EXISTS(SELECT 1 FROM programa_beneficiario_sc b WHERE b.id_programa=p.id_programa AND b.cod_ibge=$1) elegivel,
           EXISTS(SELECT 1 FROM programa_beneficiario_sc b WHERE b.id_programa=p.id_programa) tem_lista
    FROM programas_transferegov p WHERE p.nome IS NOT NULL AND p.nome NOT ILIKE '%INATIVO%'`, [cod]).catch(() => []);
  if (!rows.length) return [];
  const hoje = new Date().toISOString().slice(0, 10);
  const out = rows.map((r) => {
    const area = classificaAreaPrograma(`${r.nome} ${r.orgao} ${r.objetivo}`);
    const temLista = !!r.tem_lista;
    const elegivel = !!r.elegivel || !temLista; // sem lista de beneficiários = aberto a todos
    const janela = r.janela ? String(r.janela) : null;
    // valor_global é o total NACIONAL do programa (não o pedido do município) → não exibir como valor da demanda
    return { id: String(r.id), nome: String(r.nome || ""), orgao: String(r.orgao || ""), area, valor: num(r.valor), objetivo: String(r.objetivo || ""), elegivel, janelaEmenda: janela && janela >= hoje ? janela : null };
  }).filter((p) => p.area && p.area !== "outros");
  out.sort((a, b) => (Number(b.elegivel) - Number(a.elegivel)) || (Number(!!b.janelaEmenda) - Number(!!a.janelaEmenda)) || (b.valor - a.valor));
  // TODAS as possibilidades: só dedup por nome+área (sem limite por área), até 300
  const seen = new Set<string>(); const dedup: CadernoPrograma[] = [];
  for (const p of out) {
    const k = p.area + "|" + p.nome.toUpperCase().slice(0, 40); if (seen.has(k)) continue; seen.add(k);
    dedup.push(p); if (dedup.length >= 300) break;
  }
  return dedup;
}

// Estabelecimentos de saúde do município (CNES) — rede completa para regulação: cada unidade + composição da rede.
export type EstabSaudeSC = {
  total: number; comGeo: number;
  natureza: { publico: number; privado: number; filantropico: number };
  capacidade: { hospitalar: number; cirurgico: number; obstetrico: number; sus: number };
  equipes: { total: number; esf: number }; // CNES equipes (saúde da família)
  equipamentos: { total: number; imagem: number; vida: number }; // equipamentos médicos (imagem/UTI)
  leitos: { total: number; sus: number; uti: number }; // leitos hospitalares (CNES LT)
  porTipo: { tipo: string; n: number }[];
  lista: { nome: string; tipo: string; tipoCodigo: number; natureza: string; gestao: string; esfera: string; sus: boolean; hospitalar: boolean; cirurgico: boolean; obstetrico: boolean; lat: number | null; lon: number | null; bairro: string; equipes: number; esf: number; equipImagem: number; equipVida: number; leitos: number; leitosSus: number; leitosUti: number; profissionais: number }[];
} | null;
export async function getEstabSaudeSC(cod: string): Promise<EstabSaudeSC> {
  const rows = await query<Record<string, unknown>>(`SELECT e.nome, e.tipo, e.tipo_codigo, e.natureza_grupo, e.gestao, e.esfera, e.sus_ambulatorial, e.hospitalar, e.centro_cirurgico, e.centro_obstetrico, e.latitude, e.longitude, e.bairro,
      COALESCE(eq.n_equipes,0) n_equipes, COALESCE(eq.n_esf,0) n_esf, COALESCE(em.total,0) eq_total, COALESCE(em.imagem,0) eq_imagem, COALESCE(em.vida,0) eq_vida,
      COALESCE(lt.total,0) lt_total, COALESCE(lt.sus,0) lt_sus, COALESCE(lt.uti,0) lt_uti, COALESCE(pf.profissionais,0) pf_prof
    FROM estabelecimentos_saude_sc e
    LEFT JOIN cnes_equipes_estab eq ON LPAD(eq.codigo_cnes,7,'0')=LPAD(e.codigo_cnes,7,'0')
    LEFT JOIN cnes_equipamentos_estab em ON LPAD(em.codigo_cnes,7,'0')=LPAD(e.codigo_cnes,7,'0')
    LEFT JOIN cnes_leitos_estab lt ON LPAD(lt.codigo_cnes,7,'0')=LPAD(e.codigo_cnes,7,'0')
    LEFT JOIN cnes_profissionais_estab pf ON LPAD(pf.codigo_cnes,7,'0')=LPAD(e.codigo_cnes,7,'0')
    WHERE e.cod_ibge=$1 ORDER BY (e.natureza_grupo='Público') DESC, e.hospitalar DESC, e.nome`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const b = (v: unknown) => v === true;
  const porTipoMap = new Map<string, number>();
  for (const r of rows) { const t = String(r.tipo || "Outro"); porTipoMap.set(t, (porTipoMap.get(t) || 0) + 1); }
  return {
    total: rows.length, comGeo: rows.filter((r) => r.latitude != null).length,
    natureza: { publico: rows.filter((r) => r.natureza_grupo === "Público").length, privado: rows.filter((r) => r.natureza_grupo === "Privado").length, filantropico: rows.filter((r) => r.natureza_grupo === "Filantrópico").length },
    capacidade: { hospitalar: rows.filter((r) => b(r.hospitalar)).length, cirurgico: rows.filter((r) => b(r.centro_cirurgico)).length, obstetrico: rows.filter((r) => b(r.centro_obstetrico)).length, sus: rows.filter((r) => b(r.sus_ambulatorial)).length },
    equipes: { total: rows.reduce((s, r) => s + num(r.n_equipes), 0), esf: rows.reduce((s, r) => s + num(r.n_esf), 0) },
    equipamentos: { total: rows.reduce((s, r) => s + num(r.eq_total), 0), imagem: rows.reduce((s, r) => s + num(r.eq_imagem), 0), vida: rows.reduce((s, r) => s + num(r.eq_vida), 0) },
    leitos: { total: rows.reduce((s, r) => s + num(r.lt_total), 0), sus: rows.reduce((s, r) => s + num(r.lt_sus), 0), uti: rows.reduce((s, r) => s + num(r.lt_uti), 0) },
    porTipo: [...porTipoMap.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b2) => b2.n - a.n),
    lista: rows.map((r) => ({ nome: String(r.nome || ""), tipo: String(r.tipo || ""), tipoCodigo: num(r.tipo_codigo), natureza: String(r.natureza_grupo || ""), gestao: String(r.gestao || ""), esfera: String(r.esfera || ""), sus: b(r.sus_ambulatorial), hospitalar: b(r.hospitalar), cirurgico: b(r.centro_cirurgico), obstetrico: b(r.centro_obstetrico), lat: r.latitude != null ? num(r.latitude) : null, lon: r.longitude != null ? num(r.longitude) : null, bairro: String(r.bairro || ""), equipes: num(r.n_equipes), esf: num(r.n_esf), equipImagem: num(r.eq_imagem), equipVida: num(r.eq_vida), leitos: num(r.lt_total), leitosSus: num(r.lt_sus), leitosUti: num(r.lt_uti), profissionais: num(r.pf_prof) })),
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
  lista: { nome: string; matriculas: number; docentes: number; profissionais: number; turmas: number; alunoPorTurma: number | null; etapas: { etapa: string; n: number }[]; series: { serie: string; mat: number; tur: number; alunoPorTurma: number | null }[]; especial: number; alunoPorDoc: number | null; infraScore: number; zona: number; lat: number | null; lon: number | null; bairro: string; afd: number | null; tdi: number | null; atu: number | null; infra: { agua: boolean; energia: boolean; esgoto: boolean; internet: boolean; biblioteca: boolean; labInfo: boolean; quadra: boolean; refeitorio: boolean; acessibilidade: boolean } }[];
} | null;
// Índice de Infraestrutura (0–100): essenciais pesam 2, complementares 1.
const _infraScore = (i: { agua: boolean; energia: boolean; esgoto: boolean; internet: boolean; biblioteca: boolean; labInfo: boolean; quadra: boolean; refeitorio: boolean; acessibilidade: boolean }) => {
  const W: [boolean, number][] = [[i.agua, 2], [i.energia, 2], [i.esgoto, 2], [i.acessibilidade, 2], [i.internet, 2], [i.biblioteca, 1], [i.quadra, 1], [i.labInfo, 1], [i.refeitorio, 1]];
  const tot = W.reduce((s, [, w]) => s + w, 0);
  return Math.round((W.reduce((s, [v, w]) => s + (v ? w : 0), 0) / tot) * 100);
};
export async function getEscolasSC(cod: string): Promise<EscolasSC> {
  const rows = await query<Record<string, unknown>>(`SELECT s.nome, coalesce(s.matriculas,0) matriculas, coalesce(s.docentes,0) docentes, coalesce(s.profissionais,0) profissionais, coalesce(s.n_turmas,0) n_turmas, s.localizacao, s.latitude, s.longitude, s.bairro, s.ano, s.tem_agua, s.tem_energia, s.tem_esgoto, s.tem_internet, s.tem_biblioteca, s.tem_lab_info, s.tem_quadra, s.tem_refeitorio, s.tem_acessibilidade, s.series, h.modalidade,
    (SELECT coalesce(fun_ai,fun_af,ed_inf) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='AFD' ORDER BY ano DESC LIMIT 1) afd_esc,
    (SELECT coalesce(fun_ai,fun_af) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='TDI' ORDER BY ano DESC LIMIT 1) tdi_esc,
    (SELECT coalesce(fun_ai,fun_af,ed_inf) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='ATU' ORDER BY ano DESC LIMIT 1) atu_esc
   FROM escolas_sc s LEFT JOIN escolas_hist_sc h ON h.co_entidade=s.co_entidade AND h.ano=2025 WHERE s.cod_ibge=$1 AND s.dependencia=3 ORDER BY s.matriculas DESC NULLS LAST`, [cod]).catch(() => []);
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
    return { nome: String(r.nome || ""), matriculas: num(r.matriculas), docentes: num(r.docentes), profissionais: num(r.profissionais), turmas, alunoPorTurma: turmas > 0 ? Math.round((num(r.matriculas) / turmas) * 10) / 10 : null, etapas, series, especial: num(mod.especial), alunoPorDoc: num(r.docentes) > 0 ? Math.round((num(r.matriculas) / num(r.docentes)) * 10) / 10 : null, infraScore: _infraScore(infra), zona: num(r.localizacao), lat: r.latitude != null ? num(r.latitude) : null, lon: r.longitude != null ? num(r.longitude) : null, bairro: String(r.bairro || ""), afd: r.afd_esc != null ? num(r.afd_esc) : null, tdi: r.tdi_esc != null ? num(r.tdi_esc) : null, atu: r.atu_esc != null ? num(r.atu_esc) : null, infra };
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

// Ranking da Qualidade da Informação Contábil e Fiscal (Tesouro Nacional) — nota (A-D), posição nacional, %acertos, dimensões, série. Fonte: Tesouro (ranking_tesouro_sc).
export async function getRankingTesouroSC(cod: string): Promise<{ anoUlt: number; nota: string; posicao: number; pctAcertos: number; dimensoes: { nome: string; valor: number }[]; serie: { ano: number; posicao: number; pctAcertos: number; nota: string }[]; melhoraPosicao: number | null; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, nota, posicao, pct_acertos, di, dii, diii, div, atualizado FROM ranking_tesouro_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const serie = rows.map((r) => ({ ano: num(r.ano), posicao: num(r.posicao), pctAcertos: Number(r.pct_acertos) || 0, nota: String(r.nota || "") }));
  const ult = rows[rows.length - 1], prim = rows[0];
  const melhoraPosicao = num(prim.posicao) && num(ult.posicao) ? num(prim.posicao) - num(ult.posicao) : null; // positivo = subiu no ranking
  const dimensoes = [
    { nome: "Gestão da Informação", valor: Number(ult.di) || 0 }, { nome: "Contábil", valor: Number(ult.dii) || 0 },
    { nome: "Fiscal (RREO/RGF)", valor: Number(ult.diii) || 0 }, { nome: "Restos a Pagar / outros", valor: Number(ult.div) || 0 },
  ];
  return { anoUlt: num(ult.ano), nota: String(ult.nota || ""), posicao: num(ult.posicao), pctAcertos: Number(ult.pct_acertos) || 0, dimensoes, serie, melhoraPosicao, extraido: dExtr(ult.atualizado) };
}

// MOTOR ISOLADO — quais ESCOLAS priorizar na expansão da ETI, por prontidão de infraestrutura (refeitório/quadra/biblioteca/água/esgoto). Fonte: escolas_sc. NÃO altera nada.
export async function getEscolasEtiSC(cod: string): Promise<{ nProntas: number; nAdequar: number; total: number; candidatas: { nome: string; bairro: string; matriculas: number; turmas: number; score: number; falta: string[] }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT nome, bairro, coalesce(matriculas,0) matriculas, coalesce(n_turmas,0) turmas, tem_refeitorio, tem_quadra, tem_biblioteca, tem_agua, tem_esgoto, tem_energia, ano FROM escolas_sc WHERE cod_ibge=$1 AND dependencia=3 AND coalesce(matriculas,0)>0`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const b = (v: unknown) => v === true;
  const ITENS: [string, string, number][] = [["tem_refeitorio", "refeitório", 30], ["tem_quadra", "quadra", 25], ["tem_biblioteca", "biblioteca", 20], ["tem_agua", "água", 10], ["tem_esgoto", "esgoto", 10], ["tem_energia", "energia", 5]];
  const escolas = rows.map((r) => {
    let score = 0; const falta: string[] = [];
    for (const [k, lab, peso] of ITENS) { if (b(r[k])) score += peso; else falta.push(lab); }
    return { nome: String(r.nome || ""), bairro: String(r.bairro || ""), matriculas: num(r.matriculas), turmas: num(r.turmas), score, falta };
  });
  const pronta = (e: { score: number }) => e.score >= 75; // tem refeitório+quadra+biblioteca + básicos
  const prontas = escolas.filter(pronta).sort((a, b2) => b2.matriculas - a.matriculas);
  const nAdequar = escolas.length - prontas.length;
  // candidatas = prontas (maiores primeiro) + as que faltam pouco (score 55-74) como "quase prontas"
  const candidatas = prontas.slice(0, 10).map((e) => ({ ...e, falta: [] as string[] }));
  return { nProntas: prontas.length, nAdequar, total: escolas.length, candidatas, extraido: null };
}

// MOTOR ISOLADO — ganho de FUNDEB ao expandir a ETI (matrícula integral pondera mais). Fonte: fundeb_matriculas_sc + FUNDEB recebido. NÃO altera nenhum outro cálculo.
// Fatores de ponderação FUNDEB/VAAF 2025 (Resolução MEC 05/2024): [parcial, integral] por etapa.
const FUNDEB_FATOR: Record<string, [number, number]> = { creche: [1.30, 1.55], pre: [1.25, 1.50], fund_ai: [1.00, 1.50], fund_af: [1.10, 1.50], medio: [1.25, 1.52] };
export async function getFundebGanhoEtiSC(cod: string): Promise<{ valorAluno: number; fundebAtual: number; metas: { alvo: number; novas: number; ganhoAnual: number }[]; extraido: string | null } | null> {
  const m = (await query<Record<string, unknown>>(`SELECT creche,creche_int,pre,pre_int,fund_ai,fund_ai_int,fund_af,fund_af_int,medio,medio_int,total,total_int,atualizado FROM fundeb_matriculas_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const fundeb = num((await query<Record<string, unknown>>(`SELECT valor FROM receitas_detalhe_sc WHERE cod_ibge=$1 AND item='FUNDEB' ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0]?.valor);
  if (!m || !num(m.total) || !fundeb) return null;
  const et = ["creche", "pre", "fund_ai", "fund_af", "medio"];
  const gapE = (e: string) => Math.max(0, num(m[e]) - num(m[e + "_int"]));
  let wtd = 0; for (const e of et) { const tot = num(m[e]), int = num(m[e + "_int"]), par = tot - int; wtd += par * FUNDEB_FATOR[e][0] + int * FUNDEB_FATOR[e][1]; }
  if (wtd <= 0) return null;
  const valorAluno = Math.round(fundeb / wtd);
  const total = num(m.total), integral = num(m.total_int);
  const cobertura = (integral / total) * 100;
  const t1 = Math.min(100, (Math.floor(cobertura / 10) + 1) * 10);
  const alvos = [...new Set([t1, Math.min(100, t1 + 10)])].filter((a) => a > cobertura);
  const gapTot = et.reduce((s, e) => s + gapE(e), 0) || 1;
  const metas = alvos.map((alvo) => {
    const novas = Math.max(0, Math.ceil((alvo / 100) * total - integral));
    // distribui as novas pela lacuna de cada etapa e soma o incremento de ponderação × valor-aluno
    let ganho = 0; for (const e of et) { const parcela = novas * (gapE(e) / gapTot); const inc = FUNDEB_FATOR[e][1] - FUNDEB_FATOR[e][0]; ganho += parcela * inc * valorAluno; }
    return { alvo, novas, ganhoAnual: Math.round(ganho) };
  });
  return { valorAluno, fundebAtual: fundeb, metas, extraido: dExtr(m.atualizado) };
}

// Taxa de EVASÃO escolar por etapa (Indicadores de Fluxo / Taxas de Transição do INEP). Fonte: INEP (taxa_evasao_sc).
export async function getEvasaoEscolarSC(cod: string): Promise<{ periodo: string; etapas: { nome: string; evasao: number; nivel: string }[]; pior: { nome: string; evasao: number } | null; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT dependencia, ev_fund_ai, ev_fund_af, ev_medio, periodo, atualizado FROM taxa_evasao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const tot = rows.find((r) => r.dependencia === "Total") || rows[0];
  const nivelDe = (v: number, medio: boolean) => { const lim = medio ? [5, 10] : [2, 5]; return v >= lim[1] ? "alto" : v >= lim[0] ? "medio" : "baixo"; };
  const def: [string, string, boolean][] = [["Fund. anos iniciais", "ev_fund_ai", false], ["Fund. anos finais", "ev_fund_af", false], ["Ensino médio", "ev_medio", true]];
  const etapas = def.map(([nome, k, medio]) => ({ nome, evasao: tot[k] == null ? -1 : Number(tot[k]), nivel: tot[k] == null ? "sd" : nivelDe(Number(tot[k]), medio) })).filter((e) => e.evasao >= 0);
  const pior = etapas.length ? etapas.reduce((a, b) => (b.evasao > a.evasao ? b : a)) : null;
  return { periodo: String(tot.periodo || ""), etapas, pior: pior ? { nome: pior.nome, evasao: pior.evasao } : null, extraido: dExtr(tot.atualizado) };
}

// Diagnóstico para o Plano de Expansão da ETI (Educação em Tempo Integral) — cobertura atual, por etapa, gap de expansão. Fonte: FUNDEB/Censo (fundeb_matriculas_sc). Base do Guia MEC.
export async function getEtiDiagnosticoSC(cod: string): Promise<{ ano: number; total: number; integral: number; cobertura: number; metaPne: number; gap: number; etapas: { nome: string; integral: number; total: number; cobertura: number; gap: number }[]; metas: { alvo: number; novas: number; projecao: number }[]; prioridades: { nome: string; sugestao: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, total, total_int, creche, creche_int, pre, pre_int, fund_ai, fund_ai_int, fund_af, fund_af_int, medio, medio_int, atualizado FROM fundeb_matriculas_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.total)) return null;
  const total = num(r.total), integral = num(r.total_int);
  const cobertura = total > 0 ? Math.round((integral / total) * 1000) / 10 : 0;
  const def: [string, string, string][] = [["Creche", "creche_int", "creche"], ["Pré-escola", "pre_int", "pre"], ["Fund. anos iniciais", "fund_ai_int", "fund_ai"], ["Fund. anos finais", "fund_af_int", "fund_af"], ["Ensino médio", "medio_int", "medio"]];
  const etapas = def.map(([nome, ki, kt]) => { const i = num(r[ki]), t = num(r[kt]); return { nome, integral: i, total: t, cobertura: t > 0 ? Math.round((i / t) * 1000) / 10 : 0, gap: Math.max(0, t - i) }; }).filter((e) => e.total > 0);
  // Etapa 2 — metas: p/ dois patamares acima do atual, quantas novas matrículas (C) e a projeção (B+C)/A
  const t1 = Math.min(100, (Math.floor(cobertura / 10) + 1) * 10);
  const alvos = [...new Set([t1, Math.min(100, t1 + 10)])].filter((a) => a > cobertura);
  const metas = alvos.map((alvo) => { const novas = Math.max(0, Math.ceil((alvo / 100) * total - integral)); return { alvo, novas, projecao: total > 0 ? Math.round(((integral + novas) / total) * 1000) / 10 : 0 }; });
  // distribuição sugerida: onde criar (etapas de maior lacuna) para bater o 1º alvo
  const alvoNovas = metas[0]?.novas || 0; const gapTot = etapas.reduce((s, e) => s + e.gap, 0) || 1;
  const prioridades = [...etapas].sort((a, b) => b.gap - a.gap).slice(0, 3).map((e) => ({ nome: e.nome, sugestao: Math.round(alvoNovas * (e.gap / gapTot)) }));
  return { ano: num(r.ano), total, integral, cobertura, metaPne: 25, gap: Math.max(0, total - integral), etapas, metas, prioridades, extraido: dExtr(r.atualizado) };
}

// Número de TURMAS por etapa e por rede (município). Fonte: INEP Censo Escolar (escola_turmas_sc).
export async function getEscolaTurmasSC(cod: string): Promise<{ ano: number; totalTurmas: number; totalEscolas: number; etapas: { nome: string; qtd: number }[]; redes: { rede: string; escolas: number; turmas: number; creche: number; pre: number; fundAi: number; fundAf: number; medio: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT rede, count(*) escolas, sum(tur_total) turmas, sum(tur_creche) creche, sum(tur_pre) pre, sum(tur_fund_ai) fund_ai, sum(tur_fund_af) fund_af, sum(tur_medio) medio, sum(tur_eja) eja, sum(tur_esp) esp, max(ano) ano, max(atualizado) atualizado FROM escola_turmas_sc WHERE cod_ibge=$1 GROUP BY rede`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ordem = ["Municipal", "Estadual", "Federal", "Privada"];
  const redes = rows.map((r) => ({ rede: String(r.rede), escolas: num(r.escolas), turmas: num(r.turmas), creche: num(r.creche), pre: num(r.pre), fundAi: num(r.fund_ai), fundAf: num(r.fund_af), medio: num(r.medio) })).sort((a, b) => (ordem.indexOf(a.rede) + 99 * (ordem.indexOf(a.rede) < 0 ? 1 : 0)) - (ordem.indexOf(b.rede) + 99 * (ordem.indexOf(b.rede) < 0 ? 1 : 0)));
  const soma = (k: string) => rows.reduce((s, r) => s + num(r[k]), 0);
  const etapas = [
    { nome: "Creche", qtd: soma("creche") }, { nome: "Pré-escola", qtd: soma("pre") }, { nome: "Fund. anos iniciais", qtd: soma("fund_ai") },
    { nome: "Fund. anos finais", qtd: soma("fund_af") }, { nome: "Médio", qtd: soma("medio") }, { nome: "EJA", qtd: soma("eja") }, { nome: "Especial (exclusiva)", qtd: soma("esp") },
  ].filter((e) => e.qtd > 0);
  return { ano: num(rows[0].ano), totalTurmas: soma("turmas"), totalEscolas: rows.reduce((s, r) => s + num(r.escolas), 0), etapas, redes, extraido: dExtr(rows[0].atualizado) };
}

// Detalhe do Ranking Tesouro — verificações NÃO atendidas (o que corrigir p/ subir a nota), agrupadas por dimensão. Fonte: Tesouro (ranking_detalhe_sc).
export async function getRankingDetalheSC(cod: string): Promise<{ ano: number; totalFalhas: number; grupos: { dimensao: string; itens: { verificacao: string; descricao: string; anexo: string }[] }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, verificacao, dimensao, anexo, descricao, atualizado FROM ranking_detalhe_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM ranking_detalhe_sc WHERE cod_ibge=$1) ORDER BY dimensao, verificacao`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ano = num(rows[0].ano);
  const limpa = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim();
  const map = new Map<string, { verificacao: string; descricao: string; anexo: string }[]>();
  for (const r of rows) { const dim = limpa(r.dimensao) || "Outros"; if (!map.has(dim)) map.set(dim, []); map.get(dim)!.push({ verificacao: limpa(r.verificacao), descricao: limpa(r.descricao), anexo: limpa(r.anexo) }); }
  const grupos = [...map.entries()].map(([dimensao, itens]) => ({ dimensao, itens })).sort((a, b) => b.itens.length - a.itens.length);
  return { ano, totalFalhas: rows.length, grupos, extraido: dExtr(rows[0].atualizado) };
}

// Despesa por NATUREZA (Pessoal/Custeio/Investimento/Dívida) + RIGIDEZ orçamentária, série histórica. Fonte: SICONFI (financas_sc). Mostra o espaço fiscal.
const NATUREZA_DESP: { key: string; nome: string; cor: string }[] = [
  { key: "pessoal", nome: "Pessoal", cor: "#dc2626" }, { key: "custeio", nome: "Custeio", cor: "#f59e0b" },
  { key: "investimento", nome: "Investimento", cor: "#059669" }, { key: "divida", nome: "Dívida", cor: "#64748b" },
];
export async function getDespesaNaturezaSerieSC(cod: string): Promise<{ anoUlt: number; total: number; componentes: { nome: string; cor: string; valor: number; pct: number }[]; rigidez: number; compHist: { ano: number; setores: { nome: string; cor: string; pct: number }[] }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, pessoal, custeio, investimento, divida FROM financas_sc WHERE cod_ibge=$1 AND pessoal IS NOT NULL ORDER BY ano`, [cod]).catch(() => []);
  if (rows.length < 2) return null;
  const val = (r: Record<string, unknown>, k: string) => num(r[k]);
  const linha = (r: Record<string, unknown>) => { const t = NATUREZA_DESP.reduce((s, x) => s + val(r, x.key), 0) || 1; return NATUREZA_DESP.map((x) => ({ nome: x.nome, cor: x.cor, valor: val(r, x.key), pct: Math.round((val(r, x.key) / t) * 1000) / 10 })); };
  const ult = rows[rows.length - 1];
  const componentes = linha(ult);
  const total = NATUREZA_DESP.reduce((s, x) => s + val(ult, x.key), 0);
  const rigidez = total > 0 ? Math.round(((val(ult, "pessoal") + val(ult, "custeio")) / total) * 1000) / 10 : 0;
  const compHist = rows.map((r) => ({ ano: num(r.ano), setores: linha(r).map((c) => ({ nome: c.nome, cor: c.cor, pct: c.pct })) }));
  return { anoUlt: num(ult.ano), total, componentes, rigidez, compHist, extraido: null };
}

// Folha de pessoal — TRAJETÓRIA do % pessoal/RCL vs limites da LRF (alerta 48,6 · prudencial 51,3 · limite 54). Fonte: RGF/SICONFI (rgf_sc).
export async function getFolhaSerieSC(cod: string): Promise<{ serie: { ano: number; pct: number; faixa: string }[]; ultPct: number; ultAno: number; tendencia: number | null; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, pessoal_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano`, [cod]).catch(() => []);
  if (rows.length < 2) return null;
  const faixaDe = (p: number) => p >= 54 ? "acima" : p >= 51.3 ? "prudencial" : p >= 48.6 ? "alerta" : "confortavel";
  const serie = rows.map((r) => ({ ano: num(r.ano), pct: Math.round(num(r.pessoal_pct) * 10) / 10, faixa: faixaDe(num(r.pessoal_pct)) }));
  const ult = serie[serie.length - 1], prim = serie[0];
  const tendencia = Math.round((ult.pct - prim.pct) * 10) / 10; // p.p. no período
  return { serie, ultPct: ult.pct, ultAno: ult.ano, tendencia, extraido: null };
}

// Investimento — capacidade de investir ao longo do tempo (R$ + % da despesa). Fonte: SICONFI (financas_sc).
export async function getInvestimentoSerieSC(cod: string): Promise<{ serie: { ano: number; valor: number; pctDespesa: number }[]; ultValor: number; ultPct: number; ultAno: number; mediaPct: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, investimento, despesa FROM financas_sc WHERE cod_ibge=$1 AND investimento IS NOT NULL ORDER BY ano`, [cod]).catch(() => []);
  if (rows.length < 2) return null;
  const serie = rows.map((r) => { const v = num(r.investimento), d = num(r.despesa); return { ano: num(r.ano), valor: v, pctDespesa: d > 0 ? Math.round((v / d) * 1000) / 10 : 0 }; }).filter((x) => x.valor > 0);
  if (serie.length < 2) return null;
  const ult = serie[serie.length - 1];
  const mediaPct = Math.round((serie.reduce((s, x) => s + x.pctDespesa, 0) / serie.length) * 10) / 10;
  return { serie, ultValor: ult.valor, ultPct: ult.pctDespesa, ultAno: ult.ano, mediaPct, extraido: null };
}

// Decomposição da DESPESA por FUNÇÃO com série histórica — para onde vai o dinheiro ao longo do tempo. Fonte: SICONFI (despesa_subfuncao_sc, empenhado).
const CORES_FUNCAO = ["#7c3aed", "#0891b2", "#059669", "#f59e0b", "#e11d48", "#2563eb", "#64748b"];
export async function getDespesaFuncaoSerieSC(cod: string): Promise<{ anoUlt: number; total: number; funcoes: { nome: string; cor: string; valor: number; pct: number }[]; compHist: { ano: number; setores: { nome: string; cor: string; pct: number }[] }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, funcao, sum(empenhado) valor FROM despesa_subfuncao_sc WHERE cod_ibge=$1 GROUP BY ano, funcao`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoUlt = Math.max(...rows.map((r) => num(r.ano)));
  const totUlt = new Map<string, number>();
  for (const r of rows) if (num(r.ano) === anoUlt) totUlt.set(String(r.funcao), (totUlt.get(String(r.funcao)) || 0) + num(r.valor));
  const top = [...totUlt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
  const total = [...totUlt.values()].reduce((s, v) => s + v, 0) || 1;
  const funcoes = [...totUlt.entries()].sort((a, b) => b[1] - a[1]).map(([nome, valor], i) => ({ nome, cor: top.includes(nome) ? CORES_FUNCAO[top.indexOf(nome)] : CORES_FUNCAO[6], valor, pct: Math.round((valor / total) * 1000) / 10 }));
  // série: top 6 + "Outras", share por ano
  const porAno = new Map<number, Map<string, number>>();
  for (const r of rows) { const a = num(r.ano); const f = String(r.funcao); const grp = top.includes(f) ? f : "Outras"; if (!porAno.has(a)) porAno.set(a, new Map()); const m = porAno.get(a)!; m.set(grp, (m.get(grp) || 0) + num(r.valor)); }
  const ordem = [...top, "Outras"];
  const compHist = [...porAno.entries()].sort((a, b) => a[0] - b[0]).map(([ano, m]) => { const t = [...m.values()].reduce((s, v) => s + v, 0) || 1; return { ano, setores: ordem.map((nome, i) => ({ nome, cor: nome === "Outras" ? CORES_FUNCAO[6] : CORES_FUNCAO[i], pct: Math.round(((m.get(nome) || 0) / t) * 1000) / 10 })) }; });
  return { anoUlt, total, funcoes, compHist, extraido: null };
}

// Transferências recebidas por ORIGEM, série histórica — FPM/FUNDEB/ICMS/IPVA (SICONFI) + SUS (FNS). O "gás" que sustenta o município.
export async function getTransferenciasSerieSC(cod: string): Promise<{ transferencias: { nome: string; cor: string; fonte: string; serie: SerieAno; ult: number }[]; anoUlt: number; totalUlt: number; extraido: string | null } | null> {
  const rec = await query<Record<string, unknown>>(`SELECT ano, item, valor FROM receitas_detalhe_sc WHERE cod_ibge=$1 AND item = ANY($2) ORDER BY ano`, [cod, ["FPM", "FUNDEB", "ICMS", "IPVA"]]).catch(() => []);
  const sus = await query<Record<string, unknown>>(`SELECT ano, sum(vl_total) valor FROM fns_repasse_sc WHERE cod_ibge=$1 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []);
  if (!rec.length && !sus.length) return null;
  const DEF: { nome: string; item: string; cor: string; fonte: string }[] = [
    { nome: "FPM", item: "FPM", cor: "#2563eb", fonte: "STN — Fundo de Participação dos Municípios" },
    { nome: "FUNDEB", item: "FUNDEB", cor: "#7c3aed", fonte: "FNDE — educação" },
    { nome: "ICMS (cota-parte)", item: "ICMS", cor: "#059669", fonte: "Estado — 25% do ICMS" },
    { nome: "IPVA (cota-parte)", item: "IPVA", cor: "#f59e0b", fonte: "Estado — 50% do IPVA" },
  ];
  const transferencias: { nome: string; cor: string; fonte: string; serie: SerieAno; ult: number }[] = [];
  for (const d of DEF) { const s: SerieAno = rec.filter((r) => String(r.item) === d.item && num(r.valor) > 0).map((r) => ({ ano: num(r.ano), valor: num(r.valor) })).sort((a, b) => a.ano - b.ano); if (s.length) transferencias.push({ nome: d.nome, cor: d.cor, fonte: d.fonte, serie: s, ult: s[s.length - 1].valor }); }
  const susS: SerieAno = sus.filter((r) => num(r.valor) > 0).map((r) => ({ ano: num(r.ano), valor: num(r.valor) })).sort((a, b) => a.ano - b.ano);
  if (susS.length) transferencias.push({ nome: "SUS (fundo-a-fundo)", cor: "#e11d48", fonte: "FNS — saúde", serie: susS, ult: susS[susS.length - 1].valor });
  if (!transferencias.length) return null;
  // janela COMUM e completa: usa o intervalo das transferências constitucionais (SICONFI, anos fechados); exclui ano parcial do SUS
  const recAnos = rec.map((r) => num(r.ano));
  const anoMax = recAnos.length ? Math.max(...recAnos) : Math.max(...susS.map((s) => s.ano)) - 1;
  const anoMin = anoMax - 4;
  for (const t of transferencias) { t.serie = t.serie.filter((s) => s.ano >= anoMin && s.ano <= anoMax); t.ult = t.serie[t.serie.length - 1]?.valor ?? 0; }
  const clip = transferencias.filter((t) => t.serie.length);
  if (!clip.length) return null;
  const anoUlt = anoMax;
  const totalUlt = clip.reduce((sum, t) => sum + (t.serie.find((s) => s.ano === anoUlt)?.valor ?? 0), 0);
  return { transferencias: clip.sort((a, b) => b.ult - a.ult), anoUlt, totalUlt, extraido: null };
}

// Decomposição da receita por ORIGEM — Própria (tributos municipais + patrimonial) × Transferências — com série histórica. Fonte: SICONFI (via receitas_detalhe_sc).
// RCL (total), FPE e ITCD (estaduais) EXCLUÍDOS. É a autonomia fiscal — insumo de política pública.
const RECEITA_PROPRIA = ["ISS", "IPTU", "ITBI", "IRRF", "ITR", "Rend. Aplicação"];
const RECEITA_TRANSFER = ["FPM", "FUNDEB", "ICMS", "IPVA", "IPI-Exportação"];
export async function getReceitaComposicaoSC(cod: string): Promise<{ anoUlt: number; propria: number; transfer: number; autonomiaPct: number; itensPropria: { item: string; valor: number; pct: number }[]; itensTransfer: { item: string; valor: number; pct: number }[]; serie: { ano: number; propriaPct: number; transferPct: number; propria: number; transfer: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, item, valor FROM receitas_detalhe_sc WHERE cod_ibge=$1 AND item = ANY($2) ORDER BY ano`, [cod, [...RECEITA_PROPRIA, ...RECEITA_TRANSFER]]).catch(() => []);
  if (!rows.length) return null;
  const anoUlt = Math.max(...rows.map((r) => num(r.ano)));
  const porAno = new Map<number, { propria: number; transfer: number }>();
  for (const r of rows) { const a = num(r.ano); const v = num(r.valor); const prop = RECEITA_PROPRIA.includes(String(r.item)); if (!porAno.has(a)) porAno.set(a, { propria: 0, transfer: 0 }); const o = porAno.get(a)!; if (prop) o.propria += v; else o.transfer += v; }
  const serie = [...porAno.entries()].map(([ano, o]) => { const t = o.propria + o.transfer || 1; return { ano, propria: o.propria, transfer: o.transfer, propriaPct: Math.round((o.propria / t) * 1000) / 10, transferPct: Math.round((o.transfer / t) * 1000) / 10 }; }).sort((a, b) => a.ano - b.ano);
  const ult = porAno.get(anoUlt) || { propria: 0, transfer: 0 };
  const totUlt = ult.propria + ult.transfer || 1;
  const grp = (lista: string[], tot: number) => lista.map((item) => ({ item, valor: num(rows.find((r) => String(r.item) === item && num(r.ano) === anoUlt)?.valor) })).filter((x) => x.valor > 0).map((x) => ({ ...x, pct: Math.round((x.valor / tot) * 1000) / 10 })).sort((a, b) => b.valor - a.valor);
  return { anoUlt, propria: ult.propria, transfer: ult.transfer, autonomiaPct: Math.round((ult.propria / totUlt) * 1000) / 10, itensPropria: grp(RECEITA_PROPRIA, totUlt), itensTransfer: grp(RECEITA_TRANSFER, totUlt), serie, extraido: null };
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
export type CrpSC = { nrCrp: string; situacao: string; tipo: string; emissao: string | null; validade: string | null; diasValidade: number | null; vencido: boolean } | null;
export type RppsSC = { ano: number; receita: number; despesa: number; resultado: number; contribSegurados: number; contribPatronais: number; aposentadorias: number; pensoes: number; coberturaPct: number; serie: { ano: number; resultado: number }[]; atuarial: { exercicio: number; deficit: number; ativos: number | null } | null; crp: CrpSC } | null;
async function getCrpSC(cod: string): Promise<CrpSC> {
  // CRP mais recente (CADPREV/SPREV) — mesmo dado da tela "Pesquisar Ente", já casado por cod_ibge
  const c = (await query<Record<string, unknown>>(`SELECT nr_crp, ds_situacao, tp_crp, to_char(dt_emissao,'DD/MM/YYYY') emissao, to_char(dt_validade,'DD/MM/YYYY') validade, (dt_validade - current_date) dias FROM rpps_crp_sc WHERE cod_ibge=$1 ORDER BY dt_emissao DESC NULLS LAST LIMIT 1`, [cod]).catch(() => []))[0];
  if (!c) return null;
  const dias = c.dias == null ? null : num(c.dias);
  const tipo = String(c.tp_crp || "");
  const vencido = /venc/i.test(tipo) || (dias != null && dias < 0);
  return { nrCrp: String(c.nr_crp || ""), situacao: String(c.ds_situacao || ""), tipo, emissao: c.emissao ? String(c.emissao) : null, validade: c.validade ? String(c.validade) : null, diasValidade: dias, vencido };
}
export async function getRppsSC(cod: string): Promise<RppsSC> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, receita, despesa, resultado, contrib_segurados, contrib_patronais, aposentadorias, pensoes FROM rpps_sc WHERE cod_ibge=$1 ORDER BY ano DESC`, [cod]).catch(() => []);
  const at = (await query<Record<string, unknown>>(`SELECT exercicio, deficit_atuarial, ativos FROM rpps_atuarial_sc WHERE cod_ibge=$1 ORDER BY exercicio DESC LIMIT 1`, [cod]).catch(() => []))[0];
  const atuarial = at && at.deficit_atuarial != null ? { exercicio: num(at.exercicio), deficit: num(at.deficit_atuarial), ativos: at.ativos != null ? num(at.ativos) : null } : null;
  const crp = await getCrpSC(cod);
  if (!rows.length) return (atuarial || crp) ? { ano: atuarial?.exercicio ?? new Date().getFullYear(), receita: 0, despesa: 0, resultado: 0, contribSegurados: 0, contribPatronais: 0, aposentadorias: 0, pensoes: 0, coberturaPct: 0, serie: [], atuarial, crp } : null;
  const r = rows[0];
  const benef = num(r.aposentadorias) + num(r.pensoes);
  const contrib = num(r.contrib_segurados) + num(r.contrib_patronais);
  return {
    ano: num(r.ano), receita: num(r.receita), despesa: num(r.despesa), resultado: num(r.resultado),
    contribSegurados: num(r.contrib_segurados), contribPatronais: num(r.contrib_patronais),
    aposentadorias: num(r.aposentadorias), pensoes: num(r.pensoes),
    coberturaPct: benef > 0 ? Math.round((contrib / benef) * 1000) / 10 : 0, // contribuições cobrem quanto dos benefícios
    serie: rows.map((x) => ({ ano: num(x.ano), resultado: num(x.resultado) })).reverse(),
    atuarial, crp,
  };
}

// Histórico completo de CRP do ente — todos os certificados emitidos (mesma base da Consulta Pública do CADPREV,
// ao abrir um ente). Ordenado do mais recente p/ o mais antigo. O 1º é o vigente.
export type CrpHistItem = { nrCrp: string; situacao: string; tipo: string; emissao: string | null; validade: string | null; dias: number | null; vencido: boolean };
export async function getCrpHistoricoSC(cod: string): Promise<CrpHistItem[]> {
  const rows = await query<Record<string, unknown>>(`SELECT nr_crp, ds_situacao, tp_crp, to_char(dt_emissao,'DD/MM/YYYY') emissao, to_char(dt_validade,'DD/MM/YYYY') validade, (dt_validade - current_date) dias FROM rpps_crp_sc WHERE cod_ibge=$1 ORDER BY dt_emissao DESC NULLS LAST`, [cod]).catch(() => []);
  return rows.map((r) => {
    const dias = r.dias != null ? num(r.dias) : null;
    const tipo = String(r.tp_crp || "");
    return { nrCrp: String(r.nr_crp || ""), situacao: String(r.ds_situacao || ""), tipo, emissao: r.emissao ? String(r.emissao) : null, validade: r.validade ? String(r.validade) : null, dias, vencido: /venc/i.test(tipo) || (dias != null && dias < 0) };
  });
}

// MOTOR DE LACUNA — captação NÃO-EMENDA (educação). Programas do FNDE que a MAIORIA dos municípios de SC capta e o
// alvo NÃO capta = "dinheiro na mesa". Dado direto do sistema (SIMAD/FNDE liberações), sem cartilha. Janela 2023+.
export type LacunaCaptacaoSC = {
  totalRecebido: number; porAluno: number; medianaPorAluno: number; matriculas: number; abaixoDaMediana: boolean;
  ausentes: { programa: string; penetracaoPct: number; medianaPares: number }[];
  recebidos: { programa: string; valor: number }[];
  pdde: { recebido: number; porAluno: number; medianaPorAluno: number; nEscolas: number; ano: number; abaixo: boolean } | null;
  pnld: { demandada: number; atendimento: number; nVolumes: number; ano: number; cicloAberto: boolean } | null;
} | null;
export async function getLacunaCaptacaoEducacaoSC(cod: string): Promise<LacunaCaptacaoSC> {
  // Os nomes do SIMAD vêm fragmentados (variantes/sufixos). Consolidamos em GRUPOS canônicos (grupoFnde) antes de medir
  // penetração/ausência — assim "não recebe a categoria X" é um sinal real (ex.: falta Educação Integral/ETI), e não
  // o artefato de "tem PNAE-Fundamental mas não PNAE-EJA" (sub-modalidade população-específica) que inflava falsos.
  const [recTgt, matTgt, medPA, allRows, pddeTgt, pddeMed, pnldTgt] = await Promise.all([
    query<Record<string, unknown>>(`SELECT btrim(programa) programa, sum(valor) v FROM fnde_simad_sc WHERE cod_ibge=$1 AND ano>=2023 AND valor>0 GROUP BY 1 ORDER BY v DESC`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT sum(matriculas) m FROM censo_matricula_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM censo_matricula_sc)`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mun AS (SELECT cod_ibge FROM entes_sc WHERE tipo='M'),
      mat AS (SELECT cod_ibge, sum(matriculas) m FROM censo_matricula_sc WHERE ano=(SELECT max(ano) FROM censo_matricula_sc) GROUP BY 1),
      tot AS (SELECT f.cod_ibge, sum(f.valor) v FROM fnde_simad_sc f JOIN mun u ON u.cod_ibge=f.cod_ibge WHERE f.ano>=2023 AND f.valor>0 GROUP BY 1)
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t.v/nullif(m.m,0)) med FROM tot t JOIN mat m ON m.cod_ibge=t.cod_ibge WHERE m.m>0`).catch(() => []),
    query<Record<string, unknown>>(`SELECT f.cod_ibge, btrim(f.programa) programa, sum(f.valor) v FROM fnde_simad_sc f JOIN entes_sc e ON e.cod_ibge=f.cod_ibge AND e.tipo='M' WHERE f.ano>=2023 AND f.valor>0 GROUP BY 1,2`).catch(() => []),
    query<Record<string, unknown>>(`SELECT p.vl_total, p.qt_alunos, p.n_escolas, p.ano, CASE WHEN e.populacao<20000 THEN 1 WHEN e.populacao<100000 THEN 2 ELSE 3 END banda FROM pdde_sc p JOIN entes_sc e ON e.cod_ibge=p.cod_ibge WHERE p.cod_ibge=$1 ORDER BY p.ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mun AS (SELECT cod_ibge, CASE WHEN populacao<20000 THEN 1 WHEN populacao<100000 THEN 2 ELSE 3 END banda FROM entes_sc WHERE tipo='M' AND populacao>0),
      p AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, vl_total, qt_alunos FROM pdde_sc ORDER BY cod_ibge, ano DESC)
      SELECT m.banda, percentile_cont(0.5) WITHIN GROUP (ORDER BY p.vl_total/nullif(p.qt_alunos,0)) med FROM p JOIN mun m ON m.cod_ibge=p.cod_ibge WHERE p.qt_alunos>0 GROUP BY m.banda`).catch(() => []),
    query<Record<string, unknown>>(`SELECT qtd_demandada, qtd_atendimento, n_volumes, ano FROM pnld_reserva_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
  ]);
  const matriculas = num(matTgt[0]?.m);
  const totalRecebido = recTgt.reduce((s, r) => s + num(r.v), 0);
  if (!recTgt.length && !matriculas) return null;
  const porAluno = matriculas > 0 ? Math.round(totalRecebido / matriculas) : 0;
  const medianaPorAluno = Math.round(num(medPA[0]?.med));
  const TOT = 295;
  const EXCLUI = new Set(["outros", "fundeb", "apoio"]); // transferências automáticas/legado — não são "adesão pendente"
  // penetração + mediana por GRUPO canônico (consolida as variantes fragmentadas do SIMAD)
  const gruposTgt = new Set(recTgt.map((r) => grupoFnde(String(r.programa)).chave));
  const porGrupo = new Map<string, { rotulo: string; mun: Map<string, number> }>();
  for (const r of allRows) {
    const g = grupoFnde(String(r.programa));
    if (EXCLUI.has(g.chave)) continue;
    if (!porGrupo.has(g.chave)) porGrupo.set(g.chave, { rotulo: g.rotulo, mun: new Map() });
    const mm = porGrupo.get(g.chave)!.mun;
    mm.set(String(r.cod_ibge), (mm.get(String(r.cod_ibge)) || 0) + num(r.v));
  }
  const ausentes = [...porGrupo.entries()]
    .filter(([chave, g]) => !gruposTgt.has(chave) && g.mun.size >= TOT * 0.4)
    .map(([, g]) => {
      const vs = [...g.mun.values()].sort((a, b) => a - b);
      const med = vs[Math.floor(vs.length / 2)] || 0;
      return { programa: g.rotulo, penetracaoPct: Math.min(100, Math.round((g.mun.size / TOT) * 100)), medianaPares: Math.round(med) };
    })
    .filter((a) => a.medianaPares > 0)
    .sort((a, b) => b.medianaPares - a.medianaPares).slice(0, 12);
  // recebidos consolidados por grupo (rótulo leigo, não as variantes cruas)
  const recGrupo = new Map<string, number>();
  for (const r of recTgt) { const g = grupoFnde(String(r.programa)); if (EXCLUI.has(g.chave)) continue; recGrupo.set(g.rotulo, (recGrupo.get(g.rotulo) || 0) + num(r.v)); }
  const recebidos = [...recGrupo.entries()].map(([programa, valor]) => ({ programa, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  // PDDE — pago direto à escola (fora do SIMAD): R$/aluno vs mediana do PORTE = adesão/execução abaixo dos pares
  const pt = pddeTgt[0];
  const pdde = pt ? (() => {
    const recebido = num(pt.vl_total), alunos = num(pt.qt_alunos), banda = num(pt.banda);
    const pA = alunos > 0 ? Math.round(recebido / alunos) : 0;
    const med = Math.round(num(pddeMed.find((r) => num(r.banda) === banda)?.med));
    return { recebido, porAluno: pA, medianaPorAluno: med, nEscolas: num(pt.n_escolas), ano: num(pt.ano), abaixo: pA > 0 && med > 0 && pA < med };
  })() : null;
  // PNLD reserva técnica (demanda de livros) — adequação de material, NÃO captação. atendimento=0 no ciclo aberto (timing).
  const nt = pnldTgt[0];
  const pnld = nt && num(nt.qtd_demandada) > 0 ? { demandada: num(nt.qtd_demandada), atendimento: num(nt.qtd_atendimento), nVolumes: num(nt.n_volumes), ano: num(nt.ano), cicloAberto: num(nt.qtd_atendimento) === 0 } : null;
  return { totalRecebido, porAluno, medianaPorAluno, matriculas, abaixoDaMediana: porAluno > 0 && medianaPorAluno > 0 && porAluno < medianaPorAluno, ausentes, recebidos, pdde, pnld };
}

// MOTOR DE LACUNA — captação NÃO-EMENDA (saúde). Blocos do FNS são universais (todos recebem), então o sinal é
// R$/HABITANTE por bloco ABAIXO da mediana dos pares — muito repasse é por produção/desempenho (Previne/PAP/MAC),
// logo receber pouco por habitante = captação abaixo do potencial. Dado direto (FNS fundo-a-fundo). Janela 2023+.
export type LacunaSaudeSC = {
  totalRecebido: number; porHab: number; medianaPorHab: number; populacao: number; abaixoDaMediana: boolean;
  blocosAbaixo: { bloco: string; seuPorHab: number; medianaPorHab: number; gap: number }[];
  blocos: { bloco: string; valor: number }[];
} | null;
export async function getLacunaCaptacaoSaudeSC(cod: string): Promise<LacunaSaudeSC> {
  const bloco = `coalesce(nullif(btrim(area_nome),''),'Outros repasses')`;
  // só blocos POR-RESIDENTE (per capita justo). Exclui MAC/Especializada (produção/referência regional) e investimento (lumpy).
  const perResidente = `(area_nome ILIKE '%PRIM_RIA%' OR area_nome ILIKE '%FARMAC%' OR area_nome ILIKE '%VIGIL%' OR area_nome ILIKE '%GEST_O DO SUS%')`;
  // porte por população (comparar SEMPRE dentro do mesmo porte — o repasse per capita é regressivo)
  const bandaSql = `CASE WHEN populacao < 20000 THEN 1 WHEN populacao < 100000 THEN 2 ELSE 3 END`;
  const [recTgt, popTgt, medBloco] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ${bloco} bloco, sum(vl_total) v FROM fns_repasse_sc WHERE cod_ibge=$1 AND ano>=2023 AND vl_total>0 AND ${perResidente} GROUP BY 1 ORDER BY v DESC`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT populacao, ${bandaSql} banda FROM entes_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mun AS (SELECT cod_ibge, populacao, ${bandaSql} banda FROM entes_sc WHERE tipo='M' AND populacao>0),
      rec AS (SELECT f.cod_ibge, ${bloco} bloco, sum(f.vl_total) v FROM fns_repasse_sc f JOIN mun m ON m.cod_ibge=f.cod_ibge WHERE f.ano>=2023 AND f.vl_total>0 AND ${perResidente} GROUP BY 1,2),
      pc AS (SELECT m.banda, r.bloco, r.v/m.populacao pc FROM rec r JOIN mun m ON m.cod_ibge=r.cod_ibge)
      SELECT banda, bloco, percentile_cont(0.5) WITHIN GROUP (ORDER BY pc) med_pc, count(*) nm FROM pc GROUP BY banda, bloco`).catch(() => []),
  ]);
  const populacao = num(popTgt[0]?.populacao); const banda = num(popTgt[0]?.banda);
  const totalRecebido = recTgt.reduce((s, r) => s + num(r.v), 0);
  if (!recTgt.length || !populacao) return null;
  const medMap = new Map(medBloco.filter((r) => num(r.banda) === banda).map((r) => [String(r.bloco), num(r.med_pc)]));
  const porHab = Math.round(totalRecebido / populacao);
  const medianaPorHab = Math.round([...medMap.values()].reduce((s, v) => s + v, 0)); // mediana comparável do porte (soma dos blocos)
  const blocosAbaixo = recTgt.map((r) => {
    const seuPc = num(r.v) / populacao; const medPc = medMap.get(String(r.bloco)) || 0;
    return { bloco: String(r.bloco), seuPorHab: Math.round(seuPc), medianaPorHab: Math.round(medPc), gap: Math.round((medPc - seuPc) * populacao) };
  }).filter((b) => b.medianaPorHab > 0 && b.seuPorHab < b.medianaPorHab * 0.85 && b.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 8);
  return { totalRecebido, porHab, medianaPorHab, populacao, abaixoDaMediana: porHab > 0 && medianaPorHab > 0 && porHab < medianaPorHab, blocosAbaixo, blocos: recTgt.slice(0, 8).map((r) => ({ bloco: String(r.bloco), valor: num(r.v) })) };
}

// MOTOR DE LACUNA — captação NÃO-EMENDA (assistência social). FNAS fundo-a-fundo (PSB/PSE) por FAMÍLIA do CadÚnico
// (o SUAS escala com vulnerabilidade, não população), comparado dentro do MESMO PORTE (repasse é regressivo). Janela 2023+.
export type LacunaAssistenciaSC = {
  totalRecebido: number; porFamilia: number; medianaPorFamilia: number; cadFamilias: number; abaixoDaMediana: boolean;
  blocosAbaixo: { bloco: string; seuPorFamilia: number; medianaPorFamilia: number; gap: number }[];
  blocos: { bloco: string; valor: number }[];
} | null;
export async function getLacunaCaptacaoAssistenciaSC(cod: string): Promise<LacunaAssistenciaSC> {
  const bandaSql = `CASE WHEN populacao < 20000 THEN 1 WHEN populacao < 100000 THEN 2 ELSE 3 END`;
  const PSB = "Proteção Social Básica (PSB)", PSE = "Proteção Social Especial (PSE)";
  const [recTgt, denTgt, medBloco] = await Promise.all([
    query<Record<string, unknown>>(`SELECT '${PSB}' bloco, coalesce(sum(fnas_psb),0) v FROM assistencia_repasse_sc WHERE cod_ibge=$1 AND ano>=2023
      UNION ALL SELECT '${PSE}', coalesce(sum(fnas_pse),0) FROM assistencia_repasse_sc WHERE cod_ibge=$1 AND ano>=2023`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT (SELECT cad_familias FROM assistencia_social_sc WHERE cod_ibge=$1) cad, ${bandaSql} banda FROM entes_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH cad AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, cad_familias FROM assistencia_social_sc WHERE cad_familias>0 ORDER BY cod_ibge, anomes_ref DESC),
      mun AS (SELECT e.cod_ibge, ${bandaSql} banda, c.cad_familias cf FROM entes_sc e JOIN cad c ON c.cod_ibge=e.cod_ibge WHERE e.tipo='M' AND e.populacao>0),
      rec AS (SELECT cod_ibge, '${PSB}' bloco, coalesce(sum(fnas_psb),0) v FROM assistencia_repasse_sc WHERE ano>=2023 GROUP BY 1
              UNION ALL SELECT cod_ibge, '${PSE}', coalesce(sum(fnas_pse),0) FROM assistencia_repasse_sc WHERE ano>=2023 GROUP BY 1),
      pc AS (SELECT m.banda, r.bloco, r.v/m.cf pc FROM rec r JOIN mun m ON m.cod_ibge=r.cod_ibge)
      SELECT banda, bloco, percentile_cont(0.5) WITHIN GROUP (ORDER BY pc) med_pf FROM pc GROUP BY banda, bloco`).catch(() => []),
  ]);
  const cadFamilias = num(denTgt[0]?.cad); const banda = num(denTgt[0]?.banda);
  const totalRecebido = recTgt.reduce((s, r) => s + num(r.v), 0);
  if (!totalRecebido || !cadFamilias) return null;
  const medMap = new Map(medBloco.filter((r) => num(r.banda) === banda).map((r) => [String(r.bloco), num(r.med_pf)]));
  const porFamilia = Math.round(totalRecebido / cadFamilias);
  const medianaPorFamilia = Math.round([...medMap.values()].reduce((s, v) => s + v, 0));
  const blocosAbaixo = recTgt.map((r) => {
    const seuPf = num(r.v) / cadFamilias; const medPf = medMap.get(String(r.bloco)) || 0;
    return { bloco: String(r.bloco), seuPorFamilia: Math.round(seuPf), medianaPorFamilia: Math.round(medPf), gap: Math.round((medPf - seuPf) * cadFamilias) };
  }).filter((b) => b.medianaPorFamilia > 0 && b.seuPorFamilia < b.medianaPorFamilia * 0.85 && b.gap > 0).sort((a, b) => b.gap - a.gap);
  return { totalRecebido, porFamilia, medianaPorFamilia, cadFamilias, abaixoDaMediana: porFamilia > 0 && medianaPorFamilia > 0 && porFamilia < medianaPorFamilia, blocosAbaixo, blocos: recTgt.filter((r) => num(r.v) > 0).map((r) => ({ bloco: String(r.bloco), valor: num(r.v) })) };
}

// Acesso financeiro por município (BCB) — 3 camadas: agências (bancos), postos de cooperativas de crédito, correspondentes.
// Diferencial SC: cooperativista. Contexto por PORTE (banda) + SC-wide. Read-only sobre acesso_financeiro_sc.
export type AcessoFinanceiroSC = {
  agencias: number; bancos: number; postosBanco: number; postosCoop: number; cooperativas: number; postosOutros: number; correspondentes: number;
  bancosLista: string[]; cooperativasLista: string[]; posicao: string; competencia: string; populacao: number;
  perfil: "agencia" | "cooperativa" | "correspondente"; temAgencia: boolean; soCooperativa: boolean;
  medAgencias: number; medPostosCoop: number; medCorresp: number;
  scAgencias: number; scPostosCoop: number; scCorresp: number; scMunisComAgencia: number; scMunisSoCoop: number; scTot: number; coletado: string;
  pix: { mes: number; vlRecebido: number; vlRecebidoPj: number; nPesPj: number; medVlRecebido: number; coletado: string; serie: { mes: number; vl: number; vlPj: number }[] } | null;
  estban: { mes: number; credito: number; rural: number; agroind: number; imob: number; poupanca: number; prazo: number; vista: number; ativo: number; medCredito: number; medPoupanca: number; coletado: string; serie: { mes: number; credito: number; poupanca: number }[] } | null;
} | null;
export async function getAcessoFinanceiroSC(cod: string): Promise<AcessoFinanceiroSC> {
  const BANDA = `CASE WHEN populacao<20000 THEN 1 WHEN populacao<100000 THEN 2 ELSE 3 END`;
  const [tgt, med, sc, pixT, pixMed, pixSerie, estbanT, estbanSerie, estbanMed] = await Promise.all([
    query<Record<string, unknown>>(`SELECT a.*, e.populacao, CASE WHEN e.populacao<20000 THEN 1 WHEN e.populacao<100000 THEN 2 ELSE 3 END banda FROM acesso_financeiro_sc a JOIN entes_sc e ON e.cod_ibge=a.cod_ibge WHERE a.cod_ibge=$1 ORDER BY a.competencia DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH b AS (SELECT DISTINCT ON (a.cod_ibge) a.n_agencias, a.n_postos_coop, a.n_correspondentes, CASE WHEN e.populacao<20000 THEN 1 WHEN e.populacao<100000 THEN 2 ELSE 3 END banda FROM acesso_financeiro_sc a JOIN entes_sc e ON e.cod_ibge=a.cod_ibge WHERE e.tipo='M' AND e.populacao>0 ORDER BY a.cod_ibge, a.competencia DESC)
      SELECT banda, percentile_cont(0.5) WITHIN GROUP (ORDER BY n_agencias) mag, percentile_cont(0.5) WITHIN GROUP (ORDER BY n_postos_coop) mcoop, percentile_cont(0.5) WITHIN GROUP (ORDER BY n_correspondentes) mcor FROM b GROUP BY banda`).catch(() => []),
    query<Record<string, unknown>>(`WITH latest AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, n_agencias, n_postos_coop, n_correspondentes FROM acesso_financeiro_sc ORDER BY cod_ibge, competencia DESC)
      SELECT sum(n_agencias) ag, sum(n_postos_coop) coop, sum(n_correspondentes) corr, count(*) FILTER (WHERE n_agencias>0) comag, count(*) FILTER (WHERE n_agencias=0 AND n_postos_coop>0) socoop, count(*) tot FROM latest`).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano_mes, vl_recebido, vl_recebido_pj, n_pes_receb_pj, atualizado FROM pix_municipio_sc WHERE cod_ibge=$1 ORDER BY vl_recebido DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mun AS (SELECT cod_ibge, ${BANDA} banda FROM entes_sc WHERE tipo='M' AND populacao>0),
      p AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, vl_recebido FROM pix_municipio_sc ORDER BY cod_ibge, vl_recebido DESC)
      SELECT m.banda, percentile_cont(0.5) WITHIN GROUP (ORDER BY p.vl_recebido) med FROM p JOIN mun m ON m.cod_ibge=p.cod_ibge GROUP BY m.banda`).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano_mes, vl_recebido, vl_recebido_pj FROM pix_municipio_sc WHERE cod_ibge=$1 ORDER BY ano_mes`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano_mes, credito, credito_rural, credito_agroind, credito_imob, poupanca, prazo, a_vista, ativo, atualizado FROM estban_sc WHERE cod_ibge=$1 ORDER BY ano_mes DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano_mes, credito, poupanca FROM estban_sc WHERE cod_ibge=$1 ORDER BY ano_mes`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH mun AS (SELECT cod_ibge, ${BANDA} banda FROM entes_sc WHERE tipo='M' AND populacao>0),
      e AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, credito, poupanca FROM estban_sc ORDER BY cod_ibge, ano_mes DESC)
      SELECT m.banda, percentile_cont(0.5) WITHIN GROUP (ORDER BY e.credito) mc, percentile_cont(0.5) WITHIN GROUP (ORDER BY e.poupanca) mp FROM e JOIN mun m ON m.cod_ibge=e.cod_ibge GROUP BY m.banda`).catch(() => []),
  ]);
  const t = tgt[0]; if (!t) return null;
  const bandaN = num(t.banda); const m = med.find((r) => num(r.banda) === bandaN) || {}; const s = sc[0] || {};
  const agencias = num(t.n_agencias), postosCoop = num(t.n_postos_coop), correspondentes = num(t.n_correspondentes);
  const perfil = agencias > 0 ? "agencia" : postosCoop > 0 ? "cooperativa" : "correspondente";
  const px = pixT[0]; const pm = pixMed.find((r) => num(r.banda) === bandaN) || {};
  const pix = px ? { mes: num(px.ano_mes), vlRecebido: num(px.vl_recebido), vlRecebidoPj: num(px.vl_recebido_pj), nPesPj: num(px.n_pes_receb_pj), medVlRecebido: Math.round(num(pm.med)), coletado: String(px.atualizado || ""), serie: pixSerie.map((r) => ({ mes: num(r.ano_mes), vl: num(r.vl_recebido), vlPj: num(r.vl_recebido_pj) })) } : null;
  const et = estbanT[0]; const em = estbanMed.find((r) => num(r.banda) === bandaN) || {};
  const estban = et ? { mes: num(et.ano_mes), credito: num(et.credito), rural: num(et.credito_rural), agroind: num(et.credito_agroind), imob: num(et.credito_imob), poupanca: num(et.poupanca), prazo: num(et.prazo), vista: num(et.a_vista), ativo: num(et.ativo), medCredito: Math.round(num(em.mc)), medPoupanca: Math.round(num(em.mp)), coletado: String(et.atualizado || ""), serie: estbanSerie.map((r) => ({ mes: num(r.ano_mes), credito: num(r.credito), poupanca: num(r.poupanca) })) } : null;
  return {
    agencias, bancos: num(t.n_bancos), postosBanco: num(t.n_postos_banco), postosCoop, cooperativas: num(t.n_cooperativas), postosOutros: num(t.n_postos_outros), correspondentes,
    bancosLista: (t.bancos as string[]) || [], cooperativasLista: (t.cooperativas as string[]) || [], posicao: String(t.posicao || ""), competencia: String(t.competencia || ""), populacao: num(t.populacao),
    perfil, temAgencia: agencias > 0, soCooperativa: agencias === 0 && postosCoop > 0,
    medAgencias: Math.round(num(m.mag)), medPostosCoop: Math.round(num(m.mcoop)), medCorresp: Math.round(num(m.mcor)),
    scAgencias: num(s.ag), scPostosCoop: num(s.coop), scCorresp: num(s.corr), scMunisComAgencia: num(s.comag), scMunisSoCoop: num(s.socoop), scTot: num(s.tot), coletado: String(t.atualizado || ""),
    pix, estban,
  };
}

// Painel FUNDEB — retrato neutro (7 indicadores) + 3 séries históricas por metodologia consistente + o "como chegamos"
// (breakdown de ponderação, didático). Fontes: FNDE (fundeb_oficial/motor/vaat/vaar) · Censo (educacao_especial/escolas_hist) · STN.
export type FundebSC = {
  anoParam: number; anoReceita: number;
  matriculas: number; integral: number; integralPct: number; especial: number; segmentosAtivos: number;
  receita: number; vaaf: number; ponderadas: number; fatorMedio: number;
  vaatOficial: number; recebeVaat: boolean; recebeVaar: boolean;
  breakdown: { etapa: string; matriculas: number; fatorMedio: number; ponderadas: number }[];
  serieEspecial: { ano: number; total: number; incluidos: number }[];
  serieMunicipal: { ano: number; matriculas: number }[];
  serieFundeb: { ano: number; total: number; integral: number; especial: number }[];
  conferido: { consistente: boolean; scPct: number };
  extraido: string | null;
} | null;
export async function getFundebSC(cod: string): Promise<FundebSC> {
  const [ofi, mot, vaat, vaar, esp, muni, rec, conf] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ano, total, integral, especial, segmentos_ativos, atualizado FROM fundeb_oficial_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT matriculas, ponderadas, receita, vaaf_calc, breakdown FROM fundeb_motor_sc WHERE cod_ibge=$1 AND ano=2025`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT vaat, recebe_vaat FROM vaat_fundeb_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT beneficiario FROM vaar_fundeb_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, total, incluidos FROM educacao_especial_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, sum(matriculas)::int mat FROM escolas_hist_sc WHERE cod_ibge=$1 AND dependencia=3 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT sum(valor) v FROM transferencias_stn_sc WHERE cod_ibge=$1 AND item='FUNDEB' AND ano=2025`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) FILTER (WHERE mo.vaaf_calc <= vt.vaat) ok, count(*) tot FROM fundeb_motor_sc mo JOIN vaat_fundeb_sc vt ON vt.cod_ibge=mo.cod_ibge WHERE mo.ano=2025 AND mo.vaaf_calc>0 AND vt.vaat>0`).catch(() => []),
  ]);
  if (!ofi.length) return null;
  const a = ofi[ofi.length - 1]; const m = mot[0] || {}; const total = num(a.total);
  const ponderadas = num(m.ponderadas); const receita = num(m.receita) || num(rec[0]?.v);
  return {
    anoParam: num(a.ano), anoReceita: 2025,
    matriculas: total, integral: num(a.integral), integralPct: total ? Math.round((num(a.integral) / total) * 100) : 0, especial: num(a.especial), segmentosAtivos: num(a.segmentos_ativos),
    receita, vaaf: Math.round(num(m.vaaf_calc)), ponderadas, fatorMedio: num(m.matriculas) ? +(ponderadas / num(m.matriculas)).toFixed(3) : 0,
    vaatOficial: num(vaat[0]?.vaat), recebeVaat: !!vaat[0]?.recebe_vaat, recebeVaar: !!vaar[0]?.beneficiario,
    breakdown: ((m.breakdown as { etapa: string; matriculas: number; fator_medio: number; ponderadas: number }[]) || []).map((b) => ({ etapa: b.etapa, matriculas: num(b.matriculas), fatorMedio: num(b.fator_medio), ponderadas: num(b.ponderadas) })),
    serieEspecial: esp.map((r) => ({ ano: num(r.ano), total: num(r.total), incluidos: num(r.incluidos) })),
    serieMunicipal: muni.map((r) => ({ ano: num(r.ano), matriculas: num(r.mat) })),
    serieFundeb: ofi.map((r) => ({ ano: num(r.ano), total: num(r.total), integral: num(r.integral), especial: num(r.especial) })),
    extraido: dExtr(ofi[ofi.length - 1]?.atualizado),
    conferido: { consistente: num(m.vaaf_calc) > 0 && num(vaat[0]?.vaat) > 0 ? num(m.vaaf_calc) <= num(vaat[0]?.vaat) : true, scPct: conf[0] && num(conf[0].tot) > 0 ? Math.round((num(conf[0].ok) / num(conf[0].tot)) * 100) : 0 },
  };
}

// Indicadores INEP macro (rede municipal): AFD (formação docente adequada %), TDI (distorção idade-série %), ATU (alunos/turma).
// Por etapa + medianas SC de contexto. Fonte: indicadores_inep_sc (INEP, download.inep.gov.br).
export type IndicadoresInepSC = {
  ano: number;
  afd: { edInf: number | null; funAi: number | null; funAf: number | null };
  tdi: { funAi: number | null; funAf: number | null };
  atu: { edInf: number | null; funAi: number | null; funAf: number | null };
  aprovacao: { funAi: number | null; funAf: number | null; medio: number | null };
  abandono: { funAi: number | null; funAf: number | null; medio: number | null };
  medSC: { afdAi: number; tdiAi: number; atuAi: number; aprovAi: number; abandAi: number };
  extraido: string | null;
} | null;
export async function getIndicadoresInepSC(cod: string): Promise<IndicadoresInepSC> {
  const [rows, med] = await Promise.all([
    query<Record<string, unknown>>(`SELECT indicador, ano, ed_inf, fun_ai, fun_af, medio, atualizado FROM indicadores_inep_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM indicadores_inep_sc WHERE cod_ibge=$1)`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT indicador, percentile_cont(0.5) WITHIN GROUP (ORDER BY fun_ai) m FROM indicadores_inep_sc WHERE ano=(SELECT max(ano) FROM indicadores_inep_sc) AND fun_ai IS NOT NULL GROUP BY indicador`).catch(() => []),
  ]);
  if (!rows.length) return null;
  const g = (ind: string) => rows.find((r) => r.indicador === ind) || {};
  const afd = g("AFD"), tdi = g("TDI"), atu = g("ATU"), apr = g("APROVACAO"), ab = g("ABANDONO");
  const mv = (ind: string) => { const r = med.find((x) => x.indicador === ind); return r ? Math.round(num(r.m) * 10) / 10 : 0; };
  const et = (o: Record<string, unknown>, k: string) => (o[k] != null ? num(o[k]) : null);
  return {
    ano: num(afd.ano) || num(tdi.ano) || num(atu.ano),
    afd: { edInf: et(afd, "ed_inf"), funAi: et(afd, "fun_ai"), funAf: et(afd, "fun_af") },
    tdi: { funAi: et(tdi, "fun_ai"), funAf: et(tdi, "fun_af") },
    atu: { edInf: et(atu, "ed_inf"), funAi: et(atu, "fun_ai"), funAf: et(atu, "fun_af") },
    aprovacao: { funAi: et(apr, "fun_ai"), funAf: et(apr, "fun_af"), medio: et(apr, "medio") },
    abandono: { funAi: et(ab, "fun_ai"), funAf: et(ab, "fun_af"), medio: et(ab, "medio") },
    medSC: { afdAi: mv("AFD"), tdiAi: mv("TDI"), atuAi: mv("ATU"), aprovAi: mv("APROVACAO"), abandAi: mv("ABANDONO") },
    extraido: dExtr(rows[0]?.atualizado),
  };
}

// Dívida do município — Dívida Consolidada Líquida (DCL) oficial do RGF/SICONFI. Série + limite legal (120% da RCL,
// Res. SF 40/2001) + margem p/ novas operações de crédito + posição em SC. (O SCR/CADIP do BCB — operações de crédito
// detalhadas — fica como fonte futura: API Olinda parametrizada bloqueada.) Aba Finanças.
export type DividaSC = {
  ano: number; dclValor: number; dclPct: number; rcl: number; limite: number; margem: number;
  serie: { ano: number; valor: number; pct: number }[];
  scMediana: number; posicao: number; scTotal: number;
} | null;
export async function getDividaSC(cod: string): Promise<DividaSC> {
  const [atual, serie, sc] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ano, dcl_valor, dcl_pct, rcl_ajustada FROM rgf_sc WHERE cod_ibge=$1 AND dcl_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, dcl_valor, dcl_pct FROM rgf_sc WHERE cod_ibge=$1 AND dcl_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH latest AS (SELECT DISTINCT ON (r.cod_ibge) r.cod_ibge, r.dcl_pct FROM rgf_sc r JOIN entes_sc e ON e.cod_ibge=r.cod_ibge WHERE e.tipo='M' AND r.dcl_pct IS NOT NULL AND r.suspeito IS NOT TRUE ORDER BY r.cod_ibge, r.ano DESC)
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dcl_pct) med, count(*) tot, (SELECT count(*)+1 FROM latest l2 WHERE l2.dcl_pct > (SELECT dcl_pct FROM latest WHERE cod_ibge=$1)) pos FROM latest`, [cod]).catch(() => []),
  ]);
  const a = atual[0]; if (!a) return null;
  const dclPct = num(a.dcl_pct), rcl = num(a.rcl_ajustada), limite = 120;
  const s = sc[0] || {};
  return {
    ano: num(a.ano), dclValor: num(a.dcl_valor), dclPct, rcl, limite, margem: Math.max(0, ((limite - dclPct) / 100) * rcl),
    serie: serie.map((r) => ({ ano: num(r.ano), valor: num(r.dcl_valor), pct: num(r.dcl_pct) })),
    scMediana: Math.round(num(s.med) * 100) / 100, posicao: num(s.pos), scTotal: num(s.tot),
  };
}

// === Novas fontes (eixos econômico / ambiental / social / saúde) — painéis por município ===
// Cada fonte carrega `extraido` = data de coleta do dado oficial (coluna atualizado da tabela), p/ carimbo de proveniência.
export type SerieAno = { ano: number; valor: number }[];
const dExtr = (v: unknown): string | null => { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10).split("-").reverse().join("/"); };

export async function getBndesSC(cod: string): Promise<{ total: number; serie: SerieAno; ultimoAno: number; ultimoValor: number; topSetores: { setor: string; valor: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, desembolso, top_setores, atualizado FROM bndes_sc WHERE cod_ibge=$1 AND ano>=2010 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { total: rows.reduce((s, r) => s + num(r.desembolso), 0), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.desembolso) })), ultimoAno: num(ult.ano), ultimoValor: num(ult.desembolso), topSetores: (ult.top_setores as { setor: string; valor: number }[]) || [], extraido: dExtr(ult.atualizado) };
}

export async function getCfemSC(cod: string): Promise<{ total: number; serie: SerieAno; ultimoAno: number; topSubstancias: { substancia: string; valor: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, valor, top_substancias, atualizado FROM cfem_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { total: rows.reduce((s, r) => s + num(r.valor), 0), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.valor) })), ultimoAno: num(ult.ano), topSubstancias: (ult.top_substancias as { substancia: string; valor: number }[]) || [], extraido: dExtr(ult.atualizado) };
}

export async function getAnpSC(cod: string): Promise<{ ano: number; semestre: number; precos: { produto: string; preco: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, semestre, produto, preco_medio, atualizado FROM anp_precos_sc WHERE cod_ibge=$1 AND (ano,semestre)=(SELECT ano,semestre FROM anp_precos_sc WHERE cod_ibge=$1 ORDER BY ano DESC, semestre DESC LIMIT 1) ORDER BY produto`, [cod]).catch(() => []);
  if (!rows.length) return null;
  return { ano: num(rows[0].ano), semestre: num(rows[0].semestre), precos: rows.map((r) => ({ produto: String(r.produto), preco: num(r.preco_medio) })), extraido: dExtr(rows[0].atualizado) };
}

export async function getQueimadasSC(cod: string): Promise<{ serie: SerieAno; ultimoAno: number; ultimoFocos: number; bioma: string | null; totalFocos: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, sum(focos) focos, mode() WITHIN GROUP (ORDER BY bioma) bioma, max(atualizado) atualizado FROM queimadas_sc WHERE cod_ibge=$1 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.focos) })), ultimoAno: num(ult.ano), ultimoFocos: num(ult.focos), bioma: ult.bioma ? String(ult.bioma) : null, totalFocos: rows.reduce((s, r) => s + num(r.focos), 0), extraido: dExtr(ult.atualizado) };
}

export async function getBolsaAtletaSC(cod: string): Promise<{ atletas: number; valor: number; ano: number; topModalidades: { modalidade: string; n: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, n_atletas, valor_pago, top_modalidades, atualizado FROM bolsa_atleta_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { atletas: num(r.n_atletas), valor: num(r.valor_pago), ano: num(r.ano), topModalidades: (r.top_modalidades as { modalidade: string; n: number }[]) || [], extraido: dExtr(r.atualizado) };
}

export async function getVitaisSC(cod: string): Promise<{ nascidos: number; obitos: number; ano: number; serieNasc: SerieAno; serieObi: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, nascidos, obitos, atualizado FROM estatisticas_vitais_sc WHERE cod_ibge=$1 AND (nascidos IS NOT NULL OR obitos IS NOT NULL) ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { nascidos: num(ult.nascidos), obitos: num(ult.obitos), ano: num(ult.ano), serieNasc: rows.map((r) => ({ ano: num(r.ano), valor: num(r.nascidos) })), serieObi: rows.map((r) => ({ ano: num(r.ano), valor: num(r.obitos) })), extraido: dExtr(ult.atualizado) };
}

// ANS — cobertura de planos de saúde por município. Indicador de PRESSÃO LATENTE sobre o SUS: quem tem plano privado e,
// se perder, cai na rede pública. Beneficiários (ANS) ÷ população IBGE mais recente (casados por ano).
export async function getAnsCoberturaSC(cod: string): Promise<{ ano: number; benefMedica: number; benefTotal: number; populacao: number; popAno: number; taxa: number; semPlano: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, benef_medica, benef_total, populacao, pop_ano, taxa_cobertura, atualizado FROM ans_cobertura_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  const pop = num(r.populacao), bmed = num(r.benef_medica);
  return { ano: num(r.ano), benefMedica: bmed, benefTotal: num(r.benef_total), populacao: pop, popAno: num(r.pop_ano), taxa: num(r.taxa_cobertura), semPlano: Math.max(0, pop - bmed), extraido: dExtr(r.atualizado) };
}

// ANA outorgas de uso da água por município — nº + superficial/subterrânea + finalidade + série. Fonte: ANA (dados abertos).
export async function getAnaOutorgasSC(cod: string): Promise<{ nOutorgas: number; nSuperficial: number; nSubterranea: number; porFinalidade: { finalidade: string; n: number }[]; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_outorgas, n_superficial, n_subterranea, por_finalidade, serie, atualizado FROM ana_outorgas_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_outorgas)) return null;
  return { nOutorgas: num(r.n_outorgas), nSuperficial: num(r.n_superficial), nSubterranea: num(r.n_subterranea), porFinalidade: ((r.por_finalidade as { finalidade: string; n: number }[]) || []).slice(0, 5), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// ICMBio/CNUC unidades de conservação por município — % do território protegido + área + nº UCs. Fonte: MMA CNUC (interseção PostGIS).
export async function getIcmbioUcSC(cod: string): Promise<{ nUcs: number; areaHa: number; pctTerritorio: number; maiorUc: string | null; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_ucs, area_uc_ha, pct_territorio, maior_uc, atualizado FROM icmbio_uc_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_ucs)) return null;
  return { nUcs: num(r.n_ucs), areaHa: num(r.area_uc_ha), pctTerritorio: num(r.pct_territorio), maiorUc: (r.maior_uc as string) || null, extraido: dExtr(r.atualizado) };
}

// IBAMA áreas embargadas por município — nº + área + série. Fonte: IBAMA (CSV direto).
export async function getIbamaEmbargosSC(cod: string): Promise<{ nEmbargos: number; areaHa: number; nRecentes: number; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_embargos, area_ha, n_recentes, serie, atualizado FROM ibama_embargos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_embargos)) return null;
  return { nEmbargos: num(r.n_embargos), areaHa: num(r.area_ha), nRecentes: num(r.n_recentes), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// Comunidades quilombolas certificadas (Fundação Palmares) por município. Fonte: dados.cultura.gov.br.
export async function getQuilombosSC(cod: string): Promise<{ nComunidades: number; comunidades: string[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_comunidades, comunidades, atualizado FROM quilombos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_comunidades)) return null;
  return { nComunidades: num(r.n_comunidades), comunidades: (r.comunidades as string[]) || [], extraido: dExtr(r.atualizado) };
}

// MDS IGD-M — índice de gestão descentralizada (qualidade da gestão PBF/CadÚnico) por município. Fonte: MI Social/SAGI.
export async function getIgdmSC(cod: string): Promise<{ anomes: string; igdm: number | null; freqEscolar: number | null; agendaSaude: number | null; atualCadastral: number | null; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT anomes, igdm, freq_escolar, agenda_saude, atual_cadastral, atualizado FROM igdm_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  const nn = (v: unknown) => (v == null ? null : num(v));
  return { anomes: String(r.anomes || ""), igdm: nn(r.igdm), freqEscolar: nn(r.freq_escolar), agendaSaude: nn(r.agenda_saude), atualCadastral: nn(r.atual_cadastral), extraido: dExtr(r.atualizado) };
}

// DATASUS SIH — internações hospitalares SUS por município (nº + valor + óbitos hospitalares), série. Fonte: DATASUS (FTP DBC).
export async function getSihSC(cod: string): Promise<{ ano: number; internacoes: number; valorTotal: number; obitosHosp: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, internacoes, valor_total, obitos_hosp, atualizado FROM sih_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), internacoes: num(u.internacoes), valorTotal: num(u.valor_total), obitosHosp: num(u.obitos_hosp), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.internacoes) })), extraido: dExtr(u.atualizado) };
}

// DATASUS SINASC — nascidos vivos por município (baixo peso, prematuros, pré-natal, mãe adolescente), série. Fonte: DATASUS (FTP DBC).
export async function getSinascSC(cod: string): Promise<{ ano: number; nascimentos: number; baixoPeso: number; prematuros: number; prenatal7: number; maeAdolescente: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, nascimentos, baixo_peso, prematuros, prenatal_7mais, mae_adolescente, atualizado FROM sinasc_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), nascimentos: num(u.nascimentos), baixoPeso: num(u.baixo_peso), prematuros: num(u.prematuros), prenatal7: num(u.prenatal_7mais), maeAdolescente: num(u.mae_adolescente), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.nascimentos) })), extraido: dExtr(u.atualizado) };
}

// Dinheiro na mesa — Componente de Qualidade do novo cofinanciamento APS (Port. GM/MS 3.493/2024). Valor por equipe varia pela faixa (Ótimo/Bom/Suficiente/Regular).
// Tabela oficial (R$/mês por equipe) — verificada na NT conjunta SAPS/CONASEMS/CONASS.
// Componente Vínculo e Acompanhamento Territorial (CVAT) — novo modelo, Port. 3.493/2024. Classificação das eSF por faixa. Fonte: SIAPS.
export async function getVinculoApsSC(cod: string): Promise<{ quad: string; esfTotal: number; distrib: { faixa: string; qtd: number }[]; pctBomMais: number; trajetoria: { quad: string; pctBomMais: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT quadrimestre, otimo, bom, suficiente, regular, total, atualizado FROM cvat_aps_sc WHERE cod_ibge=$1 AND equipe='eSF' ORDER BY quadrimestre`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const q2 = (q: string) => /^\d{4}Q\d$/.test(q) ? `${q.slice(2, 4)}Q${q.slice(5)}` : q;
  const pct = (r: Record<string, unknown>) => { const t = num(r.total); return t ? Math.round(((num(r.otimo) + num(r.bom)) / t) * 100) : 0; };
  const u = rows[rows.length - 1];
  const esfTotal = num(u.total);
  const distrib = [
    { faixa: "Ótimo", qtd: num(u.otimo) }, { faixa: "Bom", qtd: num(u.bom) },
    { faixa: "Suficiente", qtd: num(u.suficiente) }, { faixa: "Regular", qtd: num(u.regular) },
  ];
  const trajetoria = rows.map((r) => ({ quad: q2(String(r.quadrimestre)), pctBomMais: pct(r) }));
  const uq = String(u.quadrimestre);
  return { quad: /^\d{4}Q\d$/.test(uq) ? `${uq.slice(0, 4)} Q${uq.slice(5)}` : uq, esfTotal, distrib, pctBomMais: pct(u), trajetoria, extraido: dExtr(u.atualizado) };
}

// Retrato dos indicadores do Componente de Qualidade (novo modelo, Port. 3.493/2024) por município. Fonte: SIAPS.
export async function getQualidadeIndicadoresApsSC(cod: string): Promise<{ quad: string; grupos: { categoria: string; indicadores: { nome: string; total: number; otimo: number; bom: number; suficiente: number; regular: number; pctBomMais: number; semaforo: string; tendencia: number | null; nota: number; benchmarkSC: number | null }[] }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT quadrimestre, co_indicador, nome, categoria, otimo, bom, suficiente, regular, atualizado FROM qualidade_indicadores_sc WHERE cod_ibge=$1 ORDER BY quadrimestre DESC, co_indicador`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const quadsOrd = [...new Set(rows.map((r) => String(r.quadrimestre)))].sort();
  const ultimo = quadsOrd[quadsOrd.length - 1];
  const anterior = quadsOrd.length > 1 ? quadsOrd[quadsOrd.length - 2] : null;
  // benchmark SC: %Bom+ agrupado (pooled) por indicador no último quadrimestre
  const bench = await query<Record<string, unknown>>(`SELECT co_indicador, sum(otimo+bom)::float/NULLIF(sum(otimo+bom+suficiente+regular),0) pct FROM qualidade_indicadores_sc WHERE quadrimestre=$1 GROUP BY co_indicador`, [ultimo]).catch(() => []);
  const benchMap = new Map<number, number>(bench.map((b) => [num(b.co_indicador), Math.round(num(b.pct) * 100)]));
  const pctDe = (co: number, q: string | null): number | null => { if (!q) return null; const r = rows.find((x) => String(x.quadrimestre) === q && num(x.co_indicador) === co); if (!r) return null; const t = num(r.otimo) + num(r.bom) + num(r.suficiente) + num(r.regular); return t ? Math.round(((num(r.otimo) + num(r.bom)) / t) * 100) : null; };
  const doQuad = rows.filter((r) => String(r.quadrimestre) === ultimo);
  const grupoMap = new Map<string, { nome: string; total: number; otimo: number; bom: number; suficiente: number; regular: number; pctBomMais: number; semaforo: string; tendencia: number | null; nota: number; benchmarkSC: number | null }[]>();
  for (const r of doQuad) {
    const total = num(r.otimo) + num(r.bom) + num(r.suficiente) + num(r.regular);
    if (!total) continue;
    const bomMais = num(r.otimo) + num(r.bom);
    const pct = Math.round((bomMais / total) * 100);
    const semaforo = pct >= 80 ? "azul" : pct >= 50 ? "verde" : pct >= 25 ? "laranja" : "vermelho";
    const ant = pctDe(num(r.co_indicador), anterior);
    const tendencia = ant == null ? null : pct - ant;
    const nota = Math.round(((num(r.otimo) * 10 + num(r.bom) * 7.5 + num(r.suficiente) * 5 + num(r.regular) * 2.5) / total) * 10) / 10;
    const benchmarkSC = benchMap.get(num(r.co_indicador)) ?? null;
    const cat = String(r.categoria);
    if (!grupoMap.has(cat)) grupoMap.set(cat, []);
    grupoMap.get(cat)!.push({ nome: String(r.nome), total, otimo: num(r.otimo), bom: num(r.bom), suficiente: num(r.suficiente), regular: num(r.regular), pctBomMais: pct, semaforo, tendencia, nota, benchmarkSC });
  }
  const ORDEM = ["eSF e eAP", "Saúde Bucal (eSB)", "eMulti", "eCR", "eAPP", "eSFR"];
  const grupos = [...grupoMap.entries()].map(([categoria, indicadores]) => ({ categoria, indicadores })).sort((a, b) => ORDEM.indexOf(a.categoria) - ORDEM.indexOf(b.categoria));
  const quad = /^\d{4}Q\d$/.test(ultimo) ? `${ultimo.slice(0, 4)} Q${ultimo.slice(5)}` : ultimo;
  return { quad, grupos, extraido: dExtr(rows[0].atualizado) };
}

const QUALIDADE_ESF = { Ótimo: 8000, Bom: 6000, Suficiente: 4000, Regular: 2000 };
// Tabelas por faixa (R$/mês) — eSF exato; eAP 30h, eSB I Comum, eMulti Ampliada como subtipo REPRESENTATIVO (estimativa).
const VAL_EQUIPE: Record<string, { o: number; b: number; s: number; r: number }> = {
  eSF: { o: 8000, b: 6000, s: 4000, r: 2000 },
  eAP: { o: 4000, b: 3000, s: 2000, r: 1000 },
  eSB: { o: 2449, b: 1836.75, s: 1224.5, r: 612.25 },
  eMulti: { o: 9000, b: 6750, s: 4500, r: 2250 },
};
const qFmt = (q: string) => /^\d{4}Q\d$/.test(q) ? `${q.slice(0, 4)} Q${q.slice(5)}` : q;
export async function getDinheiroMesaApsSC(cod: string): Promise<{ quad: string; esfTotal: number; distrib: { faixa: string; qtd: number; valor: number }[]; qualidadeAtualMes: number; tetoMes: number; naMesaAno: number; trajetoria: { quad: string; naMesaAno: number }[]; outrasEquipes: { equipe: string; total: number; otimo: number; bom: number; suficiente: number; regular: number; naMesaAno: number; estimado: boolean }[]; totalNaMesaAno: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT quadrimestre, equipe, otimo, bom, suficiente, regular, total, atualizado FROM qualidade_aps_sc WHERE cod_ibge=$1 ORDER BY quadrimestre`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const quads = [...new Set(rows.map((r) => String(r.quadrimestre)))].sort();
  const ultimo = quads[quads.length - 1];
  const val = (r: Record<string, unknown>) => num(r.otimo) * QUALIDADE_ESF.Ótimo + num(r.bom) * QUALIDADE_ESF.Bom + num(r.suficiente) * QUALIDADE_ESF.Suficiente + num(r.regular) * QUALIDADE_ESF.Regular;
  // eSF do último quadrimestre = base do cálculo de dinheiro (tabela limpa)
  const esfU = rows.find((r) => String(r.quadrimestre) === ultimo && r.equipe === "eSF");
  if (!esfU) return null;
  const esfTotal = num(esfU.total);
  const qualidadeAtualMes = val(esfU);
  const tetoMes = esfTotal * QUALIDADE_ESF.Ótimo;
  const distrib = [
    { faixa: "Ótimo", qtd: num(esfU.otimo), valor: QUALIDADE_ESF.Ótimo },
    { faixa: "Bom", qtd: num(esfU.bom), valor: QUALIDADE_ESF.Bom },
    { faixa: "Suficiente", qtd: num(esfU.suficiente), valor: QUALIDADE_ESF.Suficiente },
    { faixa: "Regular", qtd: num(esfU.regular), valor: QUALIDADE_ESF.Regular },
  ];
  const trajetoria = quads.map((q) => { const e = rows.find((r) => String(r.quadrimestre) === q && r.equipe === "eSF"); return { quad: qFmt(q), naMesaAno: e ? (num(e.total) * QUALIDADE_ESF.Ótimo - val(e)) * 12 : 0 }; });
  const naMesaEq = (eq: string, r: Record<string, unknown>): number => { const v = VAL_EQUIPE[eq]; if (!v) return 0; const atual = num(r.otimo) * v.o + num(r.bom) * v.b + num(r.suficiente) * v.s + num(r.regular) * v.r; const teto = num(r.total) * v.o; return (teto - atual) * 12; };
  const outrasEquipes = rows.filter((r) => String(r.quadrimestre) === ultimo && r.equipe !== "eSF").map((r) => ({ equipe: String(r.equipe), total: num(r.total), otimo: num(r.otimo), bom: num(r.bom), suficiente: num(r.suficiente), regular: num(r.regular), naMesaAno: naMesaEq(String(r.equipe), r), estimado: true }));
  const naMesaEsf = (tetoMes - qualidadeAtualMes) * 12;
  const totalNaMesaAno = naMesaEsf + outrasEquipes.reduce((s, e) => s + e.naMesaAno, 0);
  return { quad: qFmt(ultimo), esfTotal, distrib, qualidadeAtualMes, tetoMes, naMesaAno: naMesaEsf, trajetoria, outrasEquipes, totalNaMesaAno, extraido: dExtr(esfU.atualizado) };
}

// Indicadores de desempenho da APS (Previne Brasil) + ISF, por município. Fonte: Min. Saúde/SAPS — SISAB (indicadorPainel), quadrimestral.
const PREVINE_META = [
  { nome: "Gestantes com 6+ consultas de pré-natal (1ª até 12ª sem.)", area: "Pré-natal", meta: 45, peso: 1 },
  { nome: "Gestantes com exames de sífilis e HIV", area: "Pré-natal", meta: 60, peso: 1 },
  { nome: "Gestantes com atendimento odontológico", area: "Pré-natal", meta: 60, peso: 2 },
  { nome: "Mulheres com coleta de citopatológico (colo do útero)", area: "Saúde da mulher", meta: 40, peso: 1 },
  { nome: "Crianças de 1 ano vacinadas (Poliomielite + Pentavalente)", area: "Saúde da criança", meta: 95, peso: 2 },
  { nome: "Hipertensos com consulta e pressão aferida no semestre", area: "Doenças crônicas", meta: 50, peso: 2 },
  { nome: "Diabéticos com consulta e hemoglobina glicada solicitada", area: "Doenças crônicas", meta: 50, peso: 1 },
];
export async function getIndicadoresApsSC(cod: string): Promise<{ isf: number; quadrimestre: string; indicadores: { nome: string; area: string; resultado: number; meta: number; peso: number; nota: number; semaforo: string }[]; isfSerie: { quad: string; isf: number }[]; extraido: string | null } | null> {
  const todos = await query<Record<string, unknown>>(`SELECT quadrimestre, ind1, ind2, ind3, ind4, ind5, ind6, ind7, isf, atualizado FROM indicadores_aps_sc WHERE cod_ibge=$1 ORDER BY quadrimestre`, [cod]).catch(() => []);
  if (!todos.length) return null;
  const r = todos[todos.length - 1];
  const isfSerie = todos.map((t) => { const q = String(t.quadrimestre); return { quad: /^\d{6}$/.test(q) ? `${q.slice(2, 4)}Q${({ "04": 1, "08": 2, "12": 3 } as Record<string, number>)[q.slice(4)] || ""}` : q, isf: Math.round(num(t.isf) * 100) / 100 }; });
  const vals = [num(r.ind1), num(r.ind2), num(r.ind3), num(r.ind4), num(r.ind5), num(r.ind6), num(r.ind7)];
  const indicadores = PREVINE_META.map((m, i) => {
    const resultado = vals[i]; const rel = resultado / m.meta;
    const nota = Math.min(10, rel * 10);
    const semaforo = rel >= 1 ? "azul" : rel >= 0.7 ? "verde" : rel >= 0.4 ? "laranja" : "vermelho";
    return { nome: m.nome, area: m.area, resultado, meta: m.meta, peso: m.peso, nota: Math.round(nota * 10) / 10, semaforo };
  });
  const q = String(r.quadrimestre || "");
  const quadFmt = /^\d{6}$/.test(q) ? `${q.slice(0, 4)} Q${{ "04": 1, "08": 2, "12": 3 }[q.slice(4)] || q.slice(4)}` : q;
  return { isf: Math.round(num(r.isf) * 100) / 100, quadrimestre: quadFmt, indicadores, isfSerie, extraido: dExtr(r.atualizado) };
}

// Produção da APS (SISAB) — fichas registradas/aprovadas pelas equipes, série mensal 2021-2026, por município. Fonte: Min. Saúde/SAPS (SISAB, e-SUS APS).
export async function getProducaoApsSC(cod: string): Promise<{ aprovadas: number; total: number; porEquipe: number | null; esf: number; competencia: string; serieAnual: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT competencia, aprovadas, total, atualizado FROM producao_aps_serie_sc WHERE cod_ibge=$1 ORDER BY competencia`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const esf = num((await query<Record<string, unknown>>(`SELECT esf FROM cobertura_aps_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0]?.esf);
  // último mês CONSOLIDADO (ignora o mês corrente parcial: pega o penúltimo se o último for muito menor — heurística simples: usa o maior mês com valor)
  const comps = rows.map((r) => String(r.competencia));
  const ultimo = rows[rows.length - 1];
  // série anual (soma aprovadas por ano)
  const porAno = new Map<number, number>();
  for (const r of rows) { const ano = Number(String(r.competencia).slice(0, 4)); porAno.set(ano, (porAno.get(ano) || 0) + num(r.aprovadas)); }
  const serieAnual: SerieAno = [...porAno.entries()].map(([ano, valor]) => ({ ano, valor })).sort((a, b) => a.ano - b.ano);
  const comp = comps[comps.length - 1];
  const compFmt = /^\d{6}$/.test(comp) ? `${comp.slice(4)}/${comp.slice(0, 4)}` : comp;
  const aprov = num(ultimo.aprovadas);
  return { aprovadas: aprov, total: num(ultimo.total), porEquipe: esf > 0 ? Math.round(aprov / esf) : null, esf, competencia: compFmt, serieAnual, extraido: dExtr(ultimo.atualizado) };
}

// Cobertura APS (e-Gestor) — % de cobertura potencial da APS + nº ESF + população, por município. Fonte: Min. Saúde/SAPS.
export async function getCoberturaApsSC(cod: string): Promise<{ cobertura: number; populacao: number; esf: number; competencia: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT cobertura, populacao, esf, competencia, atualizado FROM cobertura_aps_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.populacao)) return null;
  return { cobertura: num(r.cobertura), populacao: num(r.populacao), esf: num(r.esf), competencia: String(r.competencia || ""), extraido: dExtr(r.atualizado) };
}

// Financiamento APS (e-Gestor) — custeio mensal transferido ao município para a Atenção Primária. Fonte: Min. Saúde/SAPS (e-Gestor APS).
export async function getFinanciamentoApsSC(cod: string): Promise<{ custeioMensal: number; custeioAnual: number; parcela: string; componentes: { nome: string; valor: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT custeio_mensal, parcela, esf, emulti, bucal, acs, desempenho, atualizado FROM financiamento_aps_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.custeio_mensal)) return null;
  const componentes = [
    { nome: "Equipes Saúde da Família (eSF/eAP)", valor: num(r.esf) },
    { nome: "Agentes Comunitários (ACS)", valor: num(r.acs) },
    { nome: "Saúde Bucal", valor: num(r.bucal) },
    { nome: "Equipes Multiprofissionais (eMulti)", valor: num(r.emulti) },
    { nome: "Desempenho (Previne)", valor: num(r.desempenho) },
  ].filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  return { custeioMensal: num(r.custeio_mensal), custeioAnual: num(r.custeio_mensal) * 12, parcela: String(r.parcela || ""), componentes, extraido: dExtr(r.atualizado) };
}

// IDHM municipal (Atlas Brasil/PNUD) — IDHM + subíndices renda/longevidade/educação. Último oficial: Censo 2010. Fonte: Atlas Brasil.
export async function getIdhmSC(cod: string): Promise<{ idhm: number; renda: number; long: number; educ: number; faixa: string; ano: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, idhm, idhm_renda, idhm_long, idhm_educ, atualizado FROM idhm_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.idhm)) return null;
  const v = num(r.idhm);
  const faixa = v >= 0.8 ? "Muito alto" : v >= 0.7 ? "Alto" : v >= 0.6 ? "Médio" : v >= 0.5 ? "Baixo" : "Muito baixo";
  return { idhm: v, renda: num(r.idhm_renda), long: num(r.idhm_long), educ: num(r.idhm_educ), faixa, ano: String(r.ano || ""), extraido: dExtr(r.atualizado) };
}

// PIB municipal (preços correntes) + PIB per capita + posição no estado. Fonte: IBGE tabela 5938.
const SETORES_PIB: { key: string; nome: string; cor: string }[] = [
  { key: "agro", nome: "Agropecuária", cor: "#65a30d" }, { key: "ind", nome: "Indústria", cor: "#0891b2" },
  { key: "serv", nome: "Serviços", cor: "#7c3aed" }, { key: "adm", nome: "Administração pública", cor: "#64748b" },
  { key: "imp", nome: "Impostos", cor: "#f59e0b" },
];
type CompAno = { ano: string; agro: number; ind: number; serv: number; adm: number; imp: number };
export async function getPibMunicipalSC(cod: string): Promise<{ pib: number; pibPerCapita: number | null; ano: string; posicaoUf: number; totalMunis: number; serie: SerieAno; crescimento: number | null; compAno: string; componentes: { nome: string; cor: string; valor: number; pct: number }[]; predominante: string; compHist: { ano: string; setores: { nome: string; cor: string; pct: number }[] }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, pib, pib_per_capita, serie, componentes_serie, atualizado, (SELECT count(*) FROM pib_municipal_sc) tot, (SELECT count(*) FROM pib_municipal_sc b WHERE b.pib > a.pib) acima FROM pib_municipal_sc a WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.pib)) return null;
  const arr = (typeof r.serie === "string" ? JSON.parse(r.serie) : r.serie) as { ano: string; pib: number }[] | null;
  const serie: SerieAno = (arr || []).map((x) => ({ ano: Number(x.ano), valor: num(x.pib) }));
  const prim = serie[0], ultS = serie[serie.length - 1];
  const crescimento = prim && ultS && prim.valor > 0 ? Math.round(((ultS.valor / prim.valor) - 1) * 1000) / 10 : null;
  // decomposição setorial (VAB por setor + impostos), série histórica
  const cs = (typeof r.componentes_serie === "string" ? JSON.parse(r.componentes_serie) : r.componentes_serie) as CompAno[] | null;
  const csArr = cs || [];
  const val = (o: CompAno, k: string) => num((o as unknown as Record<string, unknown>)[k]);
  const ult = csArr[csArr.length - 1];
  const totUlt = ult ? SETORES_PIB.reduce((s, x) => s + val(ult, x.key), 0) : 0;
  const componentes = ult && totUlt > 0 ? SETORES_PIB.map((x) => ({ nome: x.nome, cor: x.cor, valor: val(ult, x.key), pct: Math.round((val(ult, x.key) / totUlt) * 1000) / 10 })).sort((a, b) => b.valor - a.valor) : [];
  const predominante = componentes[0]?.nome || "";
  const compHist = csArr.map((o) => { const t = SETORES_PIB.reduce((s, x) => s + val(o, x.key), 0) || 1; return { ano: o.ano, setores: SETORES_PIB.map((x) => ({ nome: x.nome, cor: x.cor, pct: Math.round((val(o, x.key) / t) * 1000) / 10 })) }; });
  return { pib: num(r.pib), pibPerCapita: r.pib_per_capita != null ? num(r.pib_per_capita) : null, ano: String(r.ano || ""), posicaoUf: num(r.acima) + 1, totalMunis: num(r.tot), serie, crescimento, compAno: ult?.ano || "", componentes, predominante, compHist, extraido: dExtr(r.atualizado) };
}

// IBGE Censo 2022 — população por faixa etária (pirâmide) + indicadores (idosos, dependência, envelhecimento). Fonte: IBGE tabela 9514.
export async function getPopulacaoFaixaSC(cod: string): Promise<{ total: number; pctIdosos: number; pop60: number; pop80: number; pct014: number; razaoDependencia: number; indiceEnvelhecimento: number; bandas: { nome: string; qtd: number; pct: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT total, pop_0_14, pop_15_59, pop_60, pop_80, pct_idosos, razao_dependencia, indice_envelhecimento, faixas, atualizado FROM populacao_faixa_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.total)) return null;
  const t = num(r.total); const f = (r.faixas || {}) as Record<string, number>;
  const somaB = (ks: string[]) => ks.reduce((s, k) => s + (num(f[k]) || 0), 0);
  const bandasDef: [string, string[]][] = [["0-14", ["0-4", "5-9", "10-14"]], ["15-29", ["15-19", "20-24", "25-29"]], ["30-44", ["30-34", "35-39", "40-44"]], ["45-59", ["45-49", "50-54", "55-59"]], ["60-74", ["60-64", "65-69", "70-74"]], ["75+", ["75-79", "80-84", "85-89", "90-94", "95-99", "100+"]]];
  const bandas = bandasDef.map(([nome, ks]) => { const qtd = somaB(ks); return { nome, qtd, pct: Math.round((qtd / t) * 1000) / 10 }; });
  return { total: t, pctIdosos: num(r.pct_idosos), pop60: num(r.pop_60), pop80: num(r.pop_80), pct014: Math.round((num(r.pop_0_14) / t) * 1000) / 10, razaoDependencia: num(r.razao_dependencia), indiceEnvelhecimento: num(r.indice_envelhecimento), bandas, extraido: dExtr(r.atualizado) };
}

// IBGE Censo 2022 — composição da população por cor/raça por município. Fonte: IBGE (tabela 9605).
export async function getCensoCorRacaSC(cod: string): Promise<{ total: number; comp: { nome: string; qtd: number; pct: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT total, branca, preta, amarela, parda, indigena, atualizado FROM censo_corraca_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.total)) return null;
  const t = num(r.total);
  const comp = [
    { nome: "Branca", qtd: num(r.branca) }, { nome: "Parda", qtd: num(r.parda) }, { nome: "Preta", qtd: num(r.preta) },
    { nome: "Amarela", qtd: num(r.amarela) }, { nome: "Indígena", qtd: num(r.indigena) },
  ].map((c) => ({ ...c, pct: Math.round((c.qtd / t) * 1000) / 10 })).filter((c) => c.qtd > 0).sort((a, b) => b.qtd - a.qtd);
  return { total: t, comp, extraido: dExtr(r.atualizado) };
}

// Novo PAC / ObrasGov — empreendimentos federais por município: nº obras, investimento previsto, em andamento. Fonte: ObrasGov/Casa Civil.
export async function getNovoPacSC(cod: string): Promise<{ projetos: number; valorPrevisto: number; emAndamento: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT projetos, valor_previsto, em_andamento, atualizado FROM novopac_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.projetos)) return null;
  return { projetos: num(r.projetos), valorPrevisto: num(r.valor_previsto), emAndamento: num(r.em_andamento), extraido: dExtr(r.atualizado) };
}

// Lei Paulo Gustavo (LPG) — cultura: transferido, saldo em conta (risco devolução), % utilizado. Fonte: MinC.
export async function getLpgSC(cod: string): Promise<{ transferido: number; saldo: number; pctUtilizado: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT transferido, saldo, pct_utilizado, atualizado FROM lpg_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.transferido)) return null;
  return { transferido: num(r.transferido), saldo: num(r.saldo), pctUtilizado: num(r.pct_utilizado), extraido: dExtr(r.atualizado) };
}

// SALIC / Lei Rouanet — projetos culturais: aprovado vs captado (gap = captação na mesa). Fonte: MinC.
export async function getSalicSC(cod: string): Promise<{ projetos: number; aprovado: number; captado: number; gap: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT projetos, aprovado, captado, gap, atualizado FROM salic_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.projetos)) return null;
  return { projetos: num(r.projetos), aprovado: num(r.aprovado), captado: num(r.captado), gap: num(r.gap), extraido: dExtr(r.atualizado) };
}

// IBRAM MuseusBr — museus por município. Fonte: IBRAM (cadastro.museus.gov.br).
export async function getMuseusSC(cod: string): Promise<{ museus: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT museus, atualizado FROM museus_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.museus)) return null;
  return { museus: num(r.museus), extraido: dExtr(r.atualizado) };
}

// IBGE Censo 2022 — SETORES CENSITÁRIOS (intraurbano): disparidade de densidade + bairros mais populosos. Fonte: IBGE Agregados por Setores.
export async function getSetoresSC(cod: string): Promise<{ setores: number; bairros: number; densMediana: number; densMax: number; topBairros: { bairro: string; pop: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT count(*) setores, count(DISTINCT NULLIF(bairro,'')) bairros, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY populacao/NULLIF(area_km2,0))) dens_mediana, round(max(populacao/NULLIF(area_km2,0))) dens_max, max(atualizado) atualizado FROM setores_censitarios_sc WHERE cod_ibge=$1 AND area_km2>0`, [cod]).catch(() => []))[0];
  if (!r || !num(r.setores)) return null;
  const top = await query<Record<string, unknown>>(`SELECT bairro, sum(populacao) pop FROM setores_censitarios_sc WHERE cod_ibge=$1 AND bairro IS NOT NULL AND bairro<>'' GROUP BY bairro ORDER BY pop DESC LIMIT 5`, [cod]).catch(() => []);
  return { setores: num(r.setores), bairros: num(r.bairros), densMediana: num(r.dens_mediana), densMax: num(r.dens_max), topBairros: top.map((b) => ({ bairro: String(b.bairro), pop: num(b.pop) })), extraido: dExtr(r.atualizado) };
}

// Malha (polígonos) dos setores censitários do município → GeoJSON para o mapa choropleth intraurbano. Fonte: IBGE (GPKG malha com atributos).
export async function getSetoresGeoSC(cod: string): Promise<{ geojson: unknown; maxDens: number; maxIdosos: number; maxCriancas: number; centro: [number, number] } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT geojson FROM setores_geo_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !r.geojson) return null;
  const fc = (typeof r.geojson === "string" ? JSON.parse(r.geojson) : r.geojson) as { features: { properties: { densPop: number; pctIdosos?: number; pctCriancas?: number }; geometry: { coordinates: unknown } }[] };
  let maxDens = 1, maxIdosos = 1, maxCriancas = 1, minX = 180, maxX = -180, minY = 90, maxY = -90;
  const scan = (c: unknown): void => { if (typeof c === "number") return; if (Array.isArray(c) && typeof c[0] === "number") { const [x, y] = c as number[]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; return; } if (Array.isArray(c)) c.forEach(scan); };
  for (const f of fc.features) { if (f.properties.densPop > maxDens) maxDens = f.properties.densPop; if ((f.properties.pctIdosos ?? 0) > maxIdosos) maxIdosos = f.properties.pctIdosos ?? 0; if ((f.properties.pctCriancas ?? 0) > maxCriancas) maxCriancas = f.properties.pctCriancas ?? 0; scan(f.geometry.coordinates); }
  return { geojson: fc, maxDens, maxIdosos, maxCriancas, centro: [(minX + maxX) / 2, (minY + maxY) / 2] };
}

// IBGE Censo 2022 — taxa de alfabetização (15+) por município. Fonte: IBGE tabela 9543.
export async function getAlfabetizacaoSC(cod: string): Promise<{ taxa: number; analfabetos: number; mediaSc: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT taxa, atualizado, (SELECT round(avg(taxa),2) FROM alfabetizacao_sc) media FROM alfabetizacao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || r.taxa == null) return null;
  const t = Number(r.taxa);
  return { taxa: t, analfabetos: Math.round((100 - t) * 10) / 10, mediaSc: Number(r.media) || 0, extraido: dExtr(r.atualizado) };
}

// IBGE Censo 2022 — domicílios + densidade domiciliar (moradores/domicílio) por município. Fonte: IBGE tabela 4712.
export async function getDomiciliosSC(cod: string): Promise<{ domicilios: number; moradores: number; densidade: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT domicilios, moradores, densidade, atualizado FROM domicilios_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.domicilios)) return null;
  return { domicilios: num(r.domicilios), moradores: num(r.moradores), densidade: Number(r.densidade) || 0, extraido: dExtr(r.atualizado) };
}

// CEMADEN — estações de monitoramento de risco (chuva) por município. Fonte: CEMADEN. Casa com Defesa Civil.
export async function getCemadenSC(cod: string): Promise<{ estacoes: number; ativas: number; extraido: string | null } | null> {
  // tabela só tem quem TEM estação; se a base existe mas o município não está lá, é ponto cego (0 estações)
  const existe = (await query<Record<string, unknown>>(`SELECT 1 FROM cemaden_sc LIMIT 1`).catch(() => []))[0];
  if (!existe) return null;
  const r = (await query<Record<string, unknown>>(`SELECT estacoes, ativas, atualizado FROM cemaden_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return { estacoes: 0, ativas: 0, extraido: null };
  return { estacoes: num(r.estacoes), ativas: num(r.ativas), extraido: dExtr(r.atualizado) };
}

// ANA/SNISB — barragens por município: total + dano potencial alto + risco alto. Fonte: ANA/SNISB. Casa com Defesa Civil.
export async function getBarragensSC(cod: string): Promise<{ total: number; danoAlto: number; riscoAlto: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT total, dano_alto, risco_alto, atualizado FROM barragens_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.total)) return null;
  return { total: num(r.total), danoAlto: num(r.dano_alto), riscoAlto: num(r.risco_alto), extraido: dExtr(r.atualizado) };
}

// Conab PAA — compras da agricultura familiar (valor executado, histórico). Fonte: Conab.
export async function getPaaSC(cod: string): Promise<{ executado: number; formalizado: number; ultimoAno: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT executado, formalizado, ultimo_ano, atualizado FROM paa_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.executado)) return null;
  return { executado: num(r.executado), formalizado: num(r.formalizado), ultimoAno: String(r.ultimo_ano || ""), extraido: dExtr(r.atualizado) };
}

// PNAE — % de compra da agricultura familiar (mínimo legal 30%, Lei 11.947/2009). Fonte: FNDE.
export async function getPnaeAgriSC(cod: string): Promise<{ percentual: number; valorTransferido: number; valorAgri: number; ano: string; cumpre: boolean; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT percentual, valor_transferido, valor_agri, ano, atualizado FROM pnae_agri_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.valor_transferido)) return null;
  const pct = num(r.percentual);
  return { percentual: pct, valorTransferido: num(r.valor_transferido), valorAgri: num(r.valor_agri), ano: String(r.ano || ""), cumpre: pct >= 30, extraido: dExtr(r.atualizado) };
}

// PDDE — saldo acumulado das UEx (verba escolar PARADA/não executada). Fonte: FNDE. Recurso na mesa.
export async function getPddeSaldoSC(cod: string): Promise<{ saldo: number; escolas: number; ano: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT saldo, escolas, ano, atualizado FROM pdde_saldo_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.saldo)) return null;
  return { saldo: num(r.saldo), escolas: num(r.escolas), ano: String(r.ano || ""), extraido: dExtr(r.atualizado) };
}

// SUAS — repasse do FNAS + SALDO em conta (recurso na mesa, risco de bloqueio/devolução). Fonte: MDS/SAGI.
export async function getSuasSaldoSC(cod: string): Promise<{ saldo: number; repasseMes: number; mesesParado: number | null; competencia: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT saldo, repasse_mes, competencia, atualizado FROM suas_saldo_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  const saldo = num(r.saldo), rep = num(r.repasse_mes);
  const comp = String(r.competencia || "");
  const compFmt = /^\d{6}$/.test(comp) ? `${comp.slice(4)}/${comp.slice(0, 4)}` : comp;
  return { saldo, repasseMes: rep, mesesParado: rep > 0 ? Math.round((saldo / rep) * 10) / 10 : null, competencia: compFmt, extraido: dExtr(r.atualizado) };
}

// Farmácia Popular (PFPB) — nº de farmácias credenciadas por município. Fonte: Min. Saúde/SECTICS via LocalizaSUS.
export async function getFarmaciaPopularSC(cod: string): Promise<{ nFarmacias: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_farmacias, atualizado FROM farmacia_popular_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { nFarmacias: num(r.n_farmacias), extraido: dExtr(r.atualizado) };
}

// Mortalidade infantil por município — óbitos <1 ano por mil nascidos vivos (SIM ÷ SINASC), série. Fonte: DATASUS SIM + SINASC.
export async function getMortalidadeInfantilSC(cod: string): Promise<{ tmi: number | null; ano: number; obitos: number; nascimentos: number; tmiSC: number | null; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT s.ano, s.infantil obitos, n.nascimentos nasc, s.atualizado FROM sim_sc s JOIN sinasc_sc n ON n.cod_ibge=s.cod_ibge AND n.ano=s.ano WHERE s.cod_ibge=$1 AND n.nascimentos>0 ORDER BY s.ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const serie = rows.map((r) => ({ ano: num(r.ano), valor: +(num(r.obitos) * 1000 / num(r.nasc)).toFixed(1) }));
  const ult = rows[rows.length - 1];
  const scRow = (await query<Record<string, unknown>>(`SELECT round(sum(s.infantil)::numeric*1000/nullif(sum(n.nascimentos),0),1) tmi FROM sim_sc s JOIN sinasc_sc n ON n.cod_ibge=s.cod_ibge AND n.ano=s.ano WHERE s.ano=$1`, [num(ult.ano)]).catch(() => []))[0];
  return { tmi: serie[serie.length - 1]?.valor ?? null, ano: num(ult.ano), obitos: num(ult.obitos), nascimentos: num(ult.nasc), tmiSC: scRow ? num(scRow.tmi) : null, serie, extraido: dExtr(ult.atualizado) };
}

// SISAGUA (Min. Saúde) — qualidade da água potável por município: % de amostras fora do padrão. Fonte: SISAGUA/VIGIÁGUA via LocalizaSUS.
export async function getSisaguaSC(cod: string): Promise<{ analisadas: number; foraPadrao: number; pctFora: number; ano: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT analisadas, fora_padrao, pct_fora, ano, atualizado FROM sisagua_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.analisadas)) return null;
  return { analisadas: num(r.analisadas), foraPadrao: num(r.fora_padrao), pctFora: num(r.pct_fora), ano: num(r.ano) || 2026, extraido: dExtr(r.atualizado) };
}

// Cobertura vacinal por município e vacina (PNI) — cobertura + série + vacinas abaixo da meta. Fonte: DATASUS SI-PNI.
export async function getCoberturaVacinalSC(cod: string): Promise<{ ano: number; vacinas: { vacina: string; cobertura: number; abaixoMeta: boolean; serie: SerieAno }[]; nAbaixoMeta: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, vacina, cobertura, atualizado FROM cobertura_vacinal_sc WHERE cod_ibge=$1 ORDER BY vacina, ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const anoMax = Math.max(...rows.map((r) => num(r.ano)));
  const M = new Map<string, { ano: number; valor: number }[]>();
  for (const r of rows) { const v = String(r.vacina); if (!M.has(v)) M.set(v, []); M.get(v)!.push({ ano: num(r.ano), valor: num(r.cobertura) }); }
  const META = 95;
  const vacinas = [...M.entries()].map(([vacina, serie]) => { const ult = serie[serie.length - 1]; return { vacina, cobertura: ult?.valor || 0, abaixoMeta: (ult?.valor || 0) < META, serie }; }).sort((a, b) => b.cobertura - a.cobertura);
  return { ano: anoMax, vacinas, nAbaixoMeta: vacinas.filter((v) => v.abaixoMeta).length, extraido: dExtr(rows[0].atualizado) };
}

// Saúde mental (RAAS Psicossocial / CAPS) por município — atendimentos. Fonte: DATASUS SIA RAAS-PS.
export async function getRaasSaudeMentalSC(cod: string): Promise<{ periodo: string; atendimentos: number; registros: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT periodo, atendimentos, registros, atualizado FROM raas_saude_mental_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.registros)) return null;
  return { periodo: String(r.periodo || ""), atendimentos: num(r.atendimentos), registros: num(r.registros), extraido: dExtr(r.atualizado) };
}

// APAC alta complexidade por município — oncologia (quimio+radio) e diálise: valor + nº de APAC. Fonte: DATASUS SIA APAC.
export async function getApacSC(cod: string): Promise<{ periodo: string; oncoApac: number; oncoValor: number; dialiseApac: number; dialiseValor: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT periodo, onco_apac, onco_valor, dialise_apac, dialise_valor, atualizado FROM apac_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || (!num(r.onco_valor) && !num(r.dialise_valor))) return null;
  return { periodo: String(r.periodo || ""), oncoApac: num(r.onco_apac), oncoValor: num(r.onco_valor), dialiseApac: num(r.dialise_apac), dialiseValor: num(r.dialise_valor), extraido: dExtr(r.atualizado) };
}

// CNES profissionais de saúde por município — força de trabalho por categoria + médicos por mil hab + série. Fonte: DATASUS CNES (PF).
export async function getProfissionaisSaudeSC(cod: string): Promise<{ ano: number; medicos: number; enfermeiros: number; dentistas: number; tecEnf: number; acs: number; medicosPorMil: number | null; serieMedicos: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, medicos, enfermeiros, dentistas, tec_enf, acs, atualizado FROM cnes_profissionais_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  const pop = num((await query<Record<string, unknown>>(`SELECT populacao FROM entes_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0]?.populacao);
  return { ano: num(ult.ano), medicos: num(ult.medicos), enfermeiros: num(ult.enfermeiros), dentistas: num(ult.dentistas), tecEnf: num(ult.tec_enf), acs: num(ult.acs), medicosPorMil: pop > 0 ? +(num(ult.medicos) / pop * 1000).toFixed(2) : null, serieMedicos: rows.map((r) => ({ ano: num(r.ano), valor: num(r.medicos) })), extraido: dExtr(ult.atualizado) };
}

// SINAN agravos de notificação por município — casos + série por agravo. Fonte: DATASUS SINAN.
const SINAN_NOMES: Record<string, string> = { TUBE: "Tuberculose", HANS: "Hanseníase", VIOL: "Violência interpessoal/autoprovocada" };
export async function getSinanAgravosSC(cod: string): Promise<{ agravos: { agravo: string; nome: string; ultimo: number; ultimoAno: number; serie: SerieAno }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT agravo, ano, casos, atualizado FROM sinan_agravos_sc WHERE cod_ibge=$1 ORDER BY agravo, ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const M = new Map<string, { ano: number; valor: number }[]>();
  for (const r of rows) { const a = String(r.agravo); if (!M.has(a)) M.set(a, []); M.get(a)!.push({ ano: num(r.ano), valor: num(r.casos) }); }
  const agravos = [...M.entries()].map(([agravo, serie]) => ({ agravo, nome: SINAN_NOMES[agravo] || agravo, ultimo: serie[serie.length - 1]?.valor || 0, ultimoAno: serie[serie.length - 1]?.ano || 0, serie }));
  return { agravos, extraido: dExtr(rows[0].atualizado) };
}

// Medicamentos de alto custo (CEAF) por município — valor + quantidade + top medicamentos. Fonte: DATASUS SIA grupo 06 + SIGTAP.
export async function getMedicamentosSC(cod: string): Promise<{ periodo: string; valor: number; quantidade: number; topMeds: { nome: string; valor: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT periodo, valor, quantidade, top_meds, atualizado FROM medicamentos_alto_custo_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.valor)) return null;
  return { periodo: String(r.periodo || ""), valor: num(r.valor), quantidade: num(r.quantidade), topMeds: (r.top_meds as { nome: string; valor: number }[]) || [], extraido: dExtr(r.atualizado) };
}

// SIA-SUS produção ambulatorial por município × complexidade (básica/média/alta). Fonte: DATASUS SIA (DBC) + SIGTAP.
export async function getSiaProducaoSC(cod: string): Promise<{ periodo: string; basicaQtd: number; basicaVal: number; mediaQtd: number; mediaVal: number; altaQtd: number; altaVal: number; macGrupos: { grupo: string; quantidade: number; valor: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT periodo, q_basica, v_basica, q_media, v_media, q_alta, v_alta, mac_grupos, atualizado FROM sia_producao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { periodo: String(r.periodo || ""), basicaQtd: num(r.q_basica), basicaVal: num(r.v_basica), mediaQtd: num(r.q_media), mediaVal: num(r.v_media), altaQtd: num(r.q_alta), altaVal: num(r.v_alta), macGrupos: (r.mac_grupos as { grupo: string; quantidade: number; valor: number }[]) || [], extraido: dExtr(r.atualizado) };
}

// DATASUS SIM — óbitos por município (total + causas + mortalidade infantil), série anual. Fonte: DATASUS (FTP DBC).
export async function getSimSC(cod: string): Promise<{ ano: number; obitos: number; causasExternas: number; circulatorio: number; neoplasias: number; infantil: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, obitos, causas_externas, circulatorio, neoplasias, infantil, atualizado FROM sim_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), obitos: num(u.obitos), causasExternas: num(u.causas_externas), circulatorio: num(u.circulatorio), neoplasias: num(u.neoplasias), infantil: num(u.infantil), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.obitos) })), extraido: dExtr(u.atualizado) };
}

// RFB arrecadação federal por município — total arrecadado + série. Fonte: Receita Federal (dados abertos).
export async function getRfbArrecadacaoSC(cod: string): Promise<{ ano: number; total: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, total, atualizado FROM rfb_arrecadacao_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), total: num(u.total), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.total) })), extraido: dExtr(u.atualizado) };
}

// ANP vendas de combustíveis por município — por produto (litros) + série. Fonte: dados abertos ANP.
export async function getAnpVendasSC(cod: string): Promise<{ ano: number; produtos: { produto: string; litros: number }[]; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, produto, vendas FROM anp_vendas_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = Math.max(...rows.map((r) => num(r.ano)));
  const rot: Record<string, string> = { diesel: "Óleo diesel", gasolina: "Gasolina", etanol: "Etanol", glp: "GLP (gás)" };
  const produtos = rows.filter((r) => num(r.ano) === ult && num(r.vendas) > 0).map((r) => ({ produto: rot[String(r.produto)] || String(r.produto), litros: num(r.vendas) })).sort((a, b) => b.litros - a.litros);
  const porAno = new Map<number, number>(); for (const r of rows) porAno.set(num(r.ano), (porAno.get(num(r.ano)) || 0) + num(r.vendas));
  const atualizado = (await query<Record<string, unknown>>(`SELECT max(atualizado) a FROM anp_vendas_sc WHERE cod_ibge=$1`, [cod]))[0]?.a;
  return { ano: ult, produtos, serie: [...porAno.entries()].sort((a, b) => a[0] - b[0]).map(([ano, v]) => ({ ano, valor: v })), extraido: dExtr(atualizado) };
}

// STN CAPAG — capacidade de pagamento (nota A/B/C/D + 3 indicadores) por município. Fonte: Tesouro Transparente.
export async function getCapagSC(cod: string): Promise<{ nota: string; endividamento: number | null; endivNota: string; poupanca: number | null; poupNota: string; liquidez: number | null; liqNota: string; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT nota, endividamento, endiv_nota, poupanca, poup_nota, liquidez, liq_nota, atualizado FROM capag_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !r.nota) return null;
  const nn = (v: unknown) => (v == null ? null : num(v));
  return { nota: String(r.nota), endividamento: nn(r.endividamento), endivNota: String(r.endiv_nota || ""), poupanca: nn(r.poupanca), poupNota: String(r.poup_nota || ""), liquidez: nn(r.liquidez), liqNota: String(r.liq_nota || ""), extraido: dExtr(r.atualizado) };
}

// IBGE produção agropecuária (PAM/PPM) + empresas (CEMPRE) por município. Fonte: SIDRA.
export async function getIbgeProducaoSC(cod: string): Promise<{ vbpAgricola: number; areaColhida: number; bovino: number; suino: number; aves: number; nEmpresas: number; pessoalOcupado: number; salarioSm: number; pamAno: number; ppmAno: number; cempreAno: number; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT vbp_agricola, area_colhida_ha, efetivo_bovino, efetivo_suino, efetivo_aves, n_empresas, pessoal_ocupado, salario_sm, pam_ano, ppm_ano, cempre_ano, atualizado FROM ibge_producao_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { vbpAgricola: num(r.vbp_agricola), areaColhida: num(r.area_colhida_ha), bovino: num(r.efetivo_bovino), suino: num(r.efetivo_suino), aves: num(r.efetivo_aves), nEmpresas: num(r.n_empresas), pessoalOcupado: num(r.pessoal_ocupado), salarioSm: num(r.salario_sm), pamAno: num(r.pam_ano), ppmAno: num(r.ppm_ano), cempreAno: num(r.cempre_ano), extraido: dExtr(r.atualizado) };
}

// PRONAF crédito rural (agricultura familiar) por município — total + custeio/investimento + série. Fonte: BCB SICOR.
export async function getPronafSC(cod: string): Promise<{ ano: number; total: number; custeio: number; investimento: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, vl_total, vl_custeio, vl_investimento, atualizado FROM pronaf_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), total: num(u.vl_total), custeio: num(u.vl_custeio), investimento: num(u.vl_investimento), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.vl_total) })), extraido: dExtr(u.atualizado) };
}

// INCRA assentamentos da reforma agrária por município — nº + famílias + área + série cumulativa. Fonte: INCRA/MDA (SIPRA).
export async function getIncraAssentamentosSC(cod: string): Promise<{ nAssentamentos: number; familias: number; areaHa: number; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_assentamentos, familias, area_ha, serie, atualizado FROM incra_assentamentos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_assentamentos)) return null;
  return { nAssentamentos: num(r.n_assentamentos), familias: num(r.familias), areaHa: num(r.area_ha), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// SINESP/SENASP — vítimas de crimes violentos letais por município, série anual. Fonte: dados abertos Min. Justiça.
export async function getSinespSC(cod: string): Promise<{ total: number; anoIni: number; anoFim: number; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT vitimas_total, ano_ini, ano_fim, serie, atualizado FROM sinesp_vitimas_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { total: num(r.vitimas_total), anoIni: num(r.ano_ini), anoFim: num(r.ano_fim), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// IBAMA autos de infração ambiental por município — nº autos + valor multas + recentes + série. Fonte: dados abertos IBAMA.
export async function getIbamaAutosSC(cod: string): Promise<{ nAutos: number; valorMi: number; nRecentes: number; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_autos, valor_total, n_recentes, serie, atualizado FROM ibama_autos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_autos)) return null;
  return { nAutos: num(r.n_autos), valorMi: +(num(r.valor_total) / 1e6).toFixed(1), nRecentes: num(r.n_recentes), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// SENATRAN Frota de veículos por município — total + automóvel + motocicleta + série anual. Fonte: Min. Transportes.
export async function getFrotaSC(cod: string): Promise<{ ano: number; total: number; automovel: number; motocicleta: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, total, automovel, motocicleta, atualizado FROM frota_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), total: num(u.total), automovel: num(u.automovel), motocicleta: num(u.motocicleta), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.total) })), extraido: dExtr(u.atualizado) };
}

// ANATEL Banda Larga Fixa por município — acessos (assinaturas) + série anual. Fonte: dados abertos ANATEL.
export async function getAnatelBlSC(cod: string): Promise<{ ano: number; acessos: number; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano_atual, acessos, serie, atualizado FROM anatel_bl_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.acessos)) return null;
  return { ano: num(r.ano_atual), acessos: num(r.acessos), serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// ANEEL Geração Distribuída por município — nº empreendimentos + potência (MW) + fontes + série acumulada. Fonte: dados abertos ANEEL.
export async function getAneelGdSC(cod: string): Promise<{ nEmpreend: number; potenciaMw: number; topFontes: { fonte: string; n: number }[]; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_empreendimentos, potencia_kw, top_fontes, serie, atualizado FROM aneel_gd_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_empreendimentos)) return null;
  return { nEmpreend: num(r.n_empreendimentos), potenciaMw: +(num(r.potencia_kw) / 1000).toFixed(1), topFontes: (r.top_fontes as { fonte: string; n: number }[]) || [], serie: ((r.serie as { ano: number; valor: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.valor })), extraido: dExtr(r.atualizado) };
}

// SINAN arboviroses (dengue+zika+chikungunya) por município — casos + série (dengue) + zika/chik. Fonte: InfoDengue (SINAN).
export async function getArbovirosesSC(cod: string): Promise<{ dengueAno: number; dengueCasos: number; dengueIncidencia: number | null; dengueNivel: number; serie: SerieAno; zika: number; chik: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT doenca, ano, casos, incidencia_100k, nivel_max, atualizado FROM arboviroses_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const den = rows.filter((r) => r.doenca === "dengue");
  const ultDen = den[den.length - 1];
  const sumDis = (d: string) => rows.filter((r) => r.doenca === d).reduce((s, r) => s + num(r.casos), 0);
  if (!ultDen && !sumDis("zika") && !sumDis("chikungunya")) return null;
  return { dengueAno: num(ultDen?.ano), dengueCasos: num(ultDen?.casos), dengueIncidencia: ultDen?.incidencia_100k == null ? null : num(ultDen.incidencia_100k), dengueNivel: num(ultDen?.nivel_max), serie: den.map((r) => ({ ano: num(r.ano), valor: num(r.casos) })), zika: sumDis("zika"), chik: sumDis("chikungunya"), extraido: dExtr((ultDen || rows[rows.length - 1]).atualizado) };
}

// PRF DATATRAN acidentes em rodovias federais por município — nº + mortos + feridos + série. Fonte: PRF dados abertos.
export async function getDatatranSC(cod: string): Promise<{ ano: number; nAcidentes: number; mortos: number; feridos: number; totalMortos: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, n_acidentes, mortos, feridos, atualizado FROM datatran_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const u = rows[rows.length - 1];
  return { ano: num(u.ano), nAcidentes: num(u.n_acidentes), mortos: num(u.mortos), feridos: num(u.feridos), totalMortos: rows.reduce((s, r) => s + num(r.mortos), 0), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.n_acidentes) })), extraido: dExtr(u.atualizado) };
}

// SINAN arboviroses (dengue) por município — casos + incidência/100k + nível de alerta, série anual. Fonte: InfoDengue (SINAN).
export async function getSinanDengueSC(cod: string): Promise<{ ano: number; casos: number; incidencia: number | null; nivelMax: number; serie: SerieAno; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, casos, incidencia_100k, nivel_max, atualizado FROM sinan_dengue_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { ano: num(ult.ano), casos: num(ult.casos), incidencia: ult.incidencia_100k == null ? null : num(ult.incidencia_100k), nivelMax: num(ult.nivel_max), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.casos) })), extraido: dExtr(ult.atualizado) };
}

// SINISA (sucessor do SNIS) — atendimento água/esgoto/resíduos por município, ref. 2024, com SÉRIE encadeada ao SNIS (2015-2022).
export async function getSinisaSC(cod: string): Promise<{ ano: number; agua: number | null; esgoto: number | null; residuos: number | null; serieAgua: SerieAno; serieEsgoto: SerieAno; extraido: string | null } | null> {
  const [cur, snis] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ano, agua_atend, esgoto_atend, residuos_atend, atualizado FROM sinisa_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, max(atend_agua) ag, max(atend_esgoto) es FROM snis_sc WHERE cod_ibge=$1 AND ano>=2015 GROUP BY ano ORDER BY ano`, [cod]).catch(() => []),
  ]);
  const r = cur[0]; if (!r) return null;
  const nn = (v: unknown) => (v == null ? null : num(v));
  const agua = nn(r.agua_atend), esgoto = nn(r.esgoto_atend);
  // série = SNIS (2015-2022) + o ponto SINISA 2024 (fontes encadeadas)
  const serieAgua = [...snis.filter((s) => s.ag != null).map((s) => ({ ano: num(s.ano), valor: num(s.ag) })), ...(agua != null ? [{ ano: 2024, valor: agua }] : [])];
  const serieEsgoto = [...snis.filter((s) => s.es != null).map((s) => ({ ano: num(s.ano), valor: num(s.es) })), ...(esgoto != null ? [{ ano: 2024, valor: esgoto }] : [])];
  return { ano: num(r.ano), agua, esgoto, residuos: nn(r.residuos_atend), serieAgua, serieEsgoto, extraido: dExtr(r.atualizado) };
}

// Desastres (S2ID via Atlas Digital CEPED/UFSC + Sedec/MIDR) por município — registros 1991-2025, danos humanos, série anual.
export async function getDesastresSC(cod: string): Promise<{ nDesastres: number; nRecentes: number; mortos: number; afetados: number; desalojados: number; anoUltimo: number; topTipos: { tipo: string; n: number }[]; serie: SerieAno; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT n_desastres, n_recentes, mortos, afetados, desalojados, ano_ultimo, top_tipos, serie, atualizado FROM desastres_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r || !num(r.n_desastres)) return null;
  return { nDesastres: num(r.n_desastres), nRecentes: num(r.n_recentes), mortos: num(r.mortos), afetados: num(r.afetados), desalojados: num(r.desalojados), anoUltimo: num(r.ano_ultimo), topTipos: (r.top_tipos as { tipo: string; n: number }[]) || [], serie: ((r.serie as { ano: number; n: number }[]) || []).map((s) => ({ ano: s.ano, valor: s.n })), extraido: dExtr(r.atualizado) };
}

// Mapa ambiental (coroplético) — todos os municípios de SC com polígono + desmatamento e focos, p/ pintar por intensidade.
export type FeatureAmbiental = { codIbge: string; nome: string; desmat: number; focos: number; atual: boolean; geom: unknown };
export async function getMapaAmbientalSC(cod: string): Promise<{ features: FeatureAmbiental[]; atualDesmat: number; atualFocos: number; posDesmat: number; totalMunis: number; scDesmat: number; nome: string; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`
    SELECT m.cod_ibge, e.nome, ST_AsGeoJSON(ST_Simplify(m.geom, 0.008)) geom,
      round(coalesce((SELECT sum(area_km2) FROM prodes_sc WHERE cod_ibge=m.cod_ibge),0)::numeric,2) desmat,
      coalesce((SELECT sum(focos) FROM queimadas_sc WHERE cod_ibge=m.cod_ibge),0) focos
    FROM municipios_geo m JOIN entes_sc e ON e.cod_ibge=m.cod_ibge WHERE left(m.cod_ibge,2)='42'`).catch(() => []);
  if (!rows.length) return null;
  const feats = rows.map((r) => ({ codIbge: String(r.cod_ibge), nome: String(r.nome), desmat: num(r.desmat), focos: num(r.focos), atual: String(r.cod_ibge) === cod, geom: JSON.parse(String(r.geom || "null")) }));
  const atual = feats.find((f) => f.atual);
  const posDesmat = feats.filter((f) => f.desmat > (atual?.desmat ?? -1)).length + 1;
  const ext = (await query<Record<string, unknown>>(`SELECT max(atualizado) a FROM prodes_sc`).catch(() => []))[0];
  return { features: feats, atualDesmat: atual?.desmat ?? 0, atualFocos: atual?.focos ?? 0, posDesmat, totalMunis: feats.length, scDesmat: Math.round(feats.reduce((s, f) => s + f.desmat, 0)), nome: atual?.nome ?? "", extraido: dExtr(ext?.a) };
}

// PRODES — desmatamento (Mata Atlântica) por município, km²/ano. Interseção espacial PostGIS (polígonos INPE × malha IBGE).
export async function getProdesSC(cod: string): Promise<{ total: number; serie: SerieAno; ultimoAno: number; ultimoArea: number; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, area_km2, atualizado FROM prodes_sc WHERE cod_ibge=$1 AND area_km2>0 ORDER BY ano`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  return { total: rows.reduce((s, r) => s + num(r.area_km2), 0), serie: rows.map((r) => ({ ano: num(r.ano), valor: num(r.area_km2) })), ultimoAno: num(ult.ano), ultimoArea: num(ult.area_km2), extraido: dExtr(ult.atualizado) };
}

// CAGED — saldo de empregos formais por município (admissões − desligamentos), série mensal. Complemento econômico do BNDES.
export async function getCagedSC(cod: string): Promise<{ saldoAcum: number; admissoes: number; desligamentos: number; ultimoMes: string; serie: { periodo: string; saldo: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT ano, mes, saldo, admissoes, desligamentos, atualizado FROM caged_sc WHERE cod_ibge=$1 ORDER BY ano, mes`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const ult = rows[rows.length - 1];
  const per = (r: Record<string, unknown>) => `${String(num(r.mes)).padStart(2, "0")}/${num(r.ano)}`;
  return {
    saldoAcum: rows.reduce((s, r) => s + num(r.saldo), 0),
    admissoes: rows.reduce((s, r) => s + num(r.admissoes), 0),
    desligamentos: rows.reduce((s, r) => s + num(r.desligamentos), 0),
    ultimoMes: per(ult), serie: rows.map((r) => ({ periodo: per(r), saldo: num(r.saldo) })), extraido: dExtr(ult.atualizado),
  };
}

// RAIS — estoque de emprego formal por município (foto anual em 31/dez). Complementa o CAGED (fluxo).
export async function getRaisSC(cod: string): Promise<{ ano: number; estoque: number; massaSalarial: number; remunMedia: number; estabelecimentos: number; porSetor: { setor: string; n: number }[]; porPorte: { porte: string; n: number }[]; extraido: string | null } | null> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, estoque, massa_salarial, remun_media, estabelecimentos, por_setor, por_porte, atualizado FROM rais_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { ano: num(r.ano), estoque: num(r.estoque), massaSalarial: num(r.massa_salarial), remunMedia: num(r.remun_media), estabelecimentos: num(r.estabelecimentos), porSetor: (r.por_setor as { setor: string; n: number }[]) || [], porPorte: (r.por_porte as { porte: string; n: number }[]) || [], extraido: dExtr(r.atualizado) };
}

// Casamento estoque-fluxo HONESTO: estoque RAIS (foto dez) + saldo CAGED acumulado desde então = estoque estimado hoje.
// Rótulo de ESTIMATIVA (não dado oficial), gap transparente. RAIS e CAGED têm escopos distintos → não fecham 100%.
export async function getCasamentoEmpregoSC(cod: string): Promise<{ raisAno: number; estoqueRais: number; saldoCaged: number; estoqueEstimado: number; ateMes: string; meses: number; extraido: string | null } | null> {
  const rais = (await query<Record<string, unknown>>(`SELECT ano, estoque, atualizado FROM rais_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!rais) return null;
  const anoRais = num(rais.ano);
  const cg = (await query<Record<string, unknown>>(`SELECT coalesce(sum(saldo),0) saldo, count(*) n, max(ano*100+mes) ate, max(atualizado) atual FROM caged_sc WHERE cod_ibge=$1 AND ano>$2`, [cod, anoRais]).catch(() => []))[0];
  const saldo = num(cg?.saldo), ate = num(cg?.ate);
  const ateMes = ate ? `${String(ate % 100).padStart(2, "0")}/${Math.floor(ate / 100)}` : "—";
  return { raisAno: anoRais, estoqueRais: num(rais.estoque), saldoCaged: saldo, estoqueEstimado: num(rais.estoque) + saldo, ateMes, meses: num(cg?.n), extraido: dExtr(cg?.atual || rais.atualizado) };
}

// Equipamentos esportivos públicos georreferenciados (OSM) — contagem por tipo; plotados no mapa (camada Esporte).
export async function getEquipamentosEsporteSC(cod: string): Promise<{ total: number; porTipo: { tipo: string; n: number }[]; extraido: string | null } | null> {
  const rows = await query<Record<string, unknown>>(`SELECT tipo, count(*) n, max(atualizado) atualizado FROM equipamentos_esporte_sc WHERE cod_ibge=$1 GROUP BY tipo ORDER BY n DESC`, [cod]).catch(() => []);
  if (!rows.length) return null;
  return { total: rows.reduce((s, r) => s + num(r.n), 0), porTipo: rows.map((r) => ({ tipo: String(r.tipo), n: num(r.n) })), extraido: dExtr(rows[0].atualizado) };
}

// Radar de CRP (estadual) — todos os municípios com CRP, status atual e o valor federal "em jogo":
// soma (por programa distinto) das janelas abertas que o município pode pleitear — voluntárias valem p/ todos,
// específicas/emenda só p/ elegível (programa_beneficiario_sc). CRP vencida bloqueia o acesso a esse pool.
export type RadarCrpItem = { codIbge: string; nome: string; ehEstado: boolean; populacao: number; nrCrp: string | null; validade: string | null; dias: number | null; vencido: boolean; valorEmJogo: number; nJanelas: number };
export type CrpAlerta = { codIbge: string; nome: string; ehEstado: boolean; evento: string; categoriaPara: string; dias: number | null; validade: string | null; criado: string | null };
export type RadarCrpSCData = { municipios: RadarCrpItem[]; janelasAbertas: number; valorPool: number; alertas: CrpAlerta[] } | null;
export async function getRadarCrpSC(): Promise<RadarCrpSCData> {
  const rows = await query<Record<string, unknown>>(`
    WITH abertos AS (
      SELECT id_programa, coalesce(valor_global,0) valor, dt_fim_vol df, true voluntaria FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE
      UNION ALL
      SELECT id_programa, coalesce(valor_global,0), dt_fim_esp, false FROM programas_transferegov WHERE dt_fim_esp >= CURRENT_DATE
      UNION ALL
      SELECT id_programa, coalesce(valor_global,0), dt_fim_emenda, false FROM programas_transferegov WHERE dt_fim_emenda >= CURRENT_DATE
    ),
    prog AS (SELECT id_programa, max(valor) valor, bool_or(voluntaria) tem_vol FROM abertos GROUP BY id_programa),
    base AS (SELECT coalesce(sum(valor),0) valor_vol, count(*) n_vol FROM prog WHERE tem_vol),
    extra AS (SELECT b.cod_ibge, sum(p.valor) valor_ext, count(*) n_ext FROM prog p JOIN programa_beneficiario_sc b ON b.id_programa = p.id_programa WHERE p.tem_vol = false GROUP BY b.cod_ibge),
    crp AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, nr_crp, to_char(dt_validade,'DD/MM/YYYY') validade, (dt_validade - CURRENT_DATE) dias FROM rpps_crp_sc ORDER BY cod_ibge, dt_emissao DESC)
    SELECT e.cod_ibge, e.nome, e.tipo, e.populacao, c.nr_crp, c.validade, c.dias,
      (SELECT valor_vol FROM base) + coalesce(x.valor_ext,0) valor_risco,
      (SELECT n_vol FROM base) + coalesce(x.n_ext,0) n_janelas
    FROM entes_sc e JOIN crp c ON c.cod_ibge = e.cod_ibge LEFT JOIN extra x ON x.cod_ibge = e.cod_ibge
    WHERE e.tipo IN ('M','E')`).catch(() => []); // municípios + Governo do Estado (ambos têm RPPS/CRP próprios)
  if (!rows.length) return null;
  const municipios: RadarCrpItem[] = rows.map((r) => {
    const dias = r.dias != null ? num(r.dias) : null;
    return { codIbge: String(r.cod_ibge), nome: String(r.nome), ehEstado: r.tipo === "E", populacao: num(r.populacao), nrCrp: r.nr_crp ? String(r.nr_crp) : null, validade: r.validade ? String(r.validade) : null, dias, vencido: dias != null && dias < 0, valorEmJogo: num(r.valor_risco), nJanelas: num(r.n_janelas) };
  });
  // pool de janelas voluntárias (comum a todos) — headline honesto: não é aditivo entre municípios
  const j = await query<Record<string, unknown>>(`
    WITH abertos AS (
      SELECT id_programa, coalesce(valor_global,0) valor, true v FROM programas_transferegov WHERE dt_fim_vol >= CURRENT_DATE
      UNION ALL SELECT id_programa, coalesce(valor_global,0), false FROM programas_transferegov WHERE dt_fim_esp >= CURRENT_DATE
      UNION ALL SELECT id_programa, coalesce(valor_global,0), false FROM programas_transferegov WHERE dt_fim_emenda >= CURRENT_DATE),
    prog AS (SELECT id_programa, max(valor) valor, bool_or(v) tv FROM abertos GROUP BY id_programa)
    SELECT coalesce(sum(valor),0) vol, count(*) n FROM prog WHERE tv`).catch(() => []);
  // feed de novidades: transições de CRP detectadas pela varredura (alerta_crp) — mais recentes/severas primeiro
  const al = await query<Record<string, unknown>>(`
    SELECT cod_ibge, nome, eh_estado, evento, categoria_para, dias, validade, to_char(criado,'DD/MM/YYYY') criado
    FROM crp_alertas WHERE evento IN ('entrou_vencido','entrou_30','entrou_90')
    ORDER BY criado DESC, (CASE evento WHEN 'entrou_vencido' THEN 0 WHEN 'entrou_30' THEN 1 ELSE 2 END), id DESC LIMIT 12`).catch(() => []);
  const alertas: CrpAlerta[] = al.map((r) => ({ codIbge: String(r.cod_ibge), nome: String(r.nome), ehEstado: r.eh_estado === true, evento: String(r.evento), categoriaPara: String(r.categoria_para), dias: r.dias != null ? num(r.dias) : null, validade: r.validade ? String(r.validade) : null, criado: r.criado ? String(r.criado) : null }));
  return { municipios, janelasAbertas: num(j[0]?.n), valorPool: num(j[0]?.vol), alertas };
}

// Precatórios — estoque de dívida judicial do município (API do TJSC, regime especial). Replicável por UF.
export type PrecatoriosSC = { valor: number; qtde: number; nEntes: number; entes: { nome: string; valor: number; qtde: number; regime: string | null }[] } | null;
export async function getPrecatoriosSC(cod: string): Promise<PrecatoriosSC> {
  const r = (await query<Record<string, unknown>>(`SELECT total_valor, total_qtde, n_entes FROM precatorios_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  const ent = await query<Record<string, unknown>>(`SELECT de_entidade, valor, qtde, regime FROM precatorios_entes_sc WHERE cod_ibge=$1 AND valor>0 ORDER BY valor DESC LIMIT 8`, [cod]).catch(() => []);
  return { valor: num(r.total_valor), qtde: num(r.total_qtde), nEntes: num(r.n_entes), entes: ent.map((x) => ({ nome: String(x.de_entidade || ""), valor: num(x.valor), qtde: num(x.qtde), regime: x.regime ? String(x.regime) : null })) };
}

// Infraestrutura — Saneamento (Censo 2022 IBGE): cobertura de água/esgoto/lixo por domicílio.
export type SaneamentoItem = { ch: string; label: string; pct: number; domicilios: number; atendidos: number; deficit: number; mediaUF: number };
export type SnisPrestador = { prestador: string; sigla: string; abrangencia: string; natureza: string; atendAgua: number | null; atendEsgoto: number | null; coletaEsgoto: number | null; tratEsgoto: number | null; perdas: number | null };
export type SnisSerieAno = { ano: number; agua: number | null; esgoto: number | null; perdas: number | null };
export type SaneamentoSC = { ano: number; fonte: string; itens: SaneamentoItem[]; snis: { ano: number; prestadores: SnisPrestador[]; serie: SnisSerieAno[] } | null } | null;
export async function getSaneamentoSC(cod: string): Promise<SaneamentoSC> {
  const [r, sn, serie] = await Promise.all([
    query<Record<string, unknown>>(`
    SELECT s.indicador, s.label, s.pct, s.domicilios, s.atendidos, s.ano, s.fonte,
           (SELECT round(avg(pct), 1) FROM saneamento_sc x WHERE x.indicador = s.indicador AND length(x.cod_ibge)=7) media_uf
    FROM saneamento_sc s WHERE s.cod_ibge = $1
    ORDER BY array_position(ARRAY['agua_rede','esgoto_adeq','lixo_coletado']::text[], s.indicador)`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT prestador, sigla, abrangencia, natureza, atend_agua, atend_esgoto, coleta_esgoto, trat_esgoto, perdas_agua, ano FROM snis_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM snis_sc WHERE cod_ibge=$1) ORDER BY atend_agua DESC NULLS LAST`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT DISTINCT ON (ano) ano, atend_agua, atend_esgoto, perdas_agua FROM snis_sc WHERE cod_ibge=$1 ORDER BY ano, atend_agua DESC NULLS LAST`, [cod]).catch(() => []),
  ]);
  if (!r.length && !sn.length) return null;
  const numN = (v: unknown) => (v == null ? null : num(v));
  return {
    ano: num(r[0]?.ano) || 2022, fonte: String(r[0]?.fonte || "IBGE Censo 2022"),
    itens: r.map((x) => { const dom = num(x.domicilios), at = num(x.atendidos); return { ch: String(x.indicador), label: String(x.label), pct: num(x.pct), domicilios: dom, atendidos: at, deficit: Math.max(0, dom - at), mediaUF: num(x.media_uf) }; }),
    snis: sn.length ? {
      ano: num(sn[0].ano),
      prestadores: sn.map((x) => ({ prestador: String(x.prestador || ""), sigla: String(x.sigla || ""), abrangencia: String(x.abrangencia || ""), natureza: String(x.natureza || ""), atendAgua: numN(x.atend_agua), atendEsgoto: numN(x.atend_esgoto), coletaEsgoto: numN(x.coleta_esgoto), tratEsgoto: numN(x.trat_esgoto), perdas: numN(x.perdas_agua) })),
      serie: serie.map((x) => ({ ano: num(x.ano), agua: numN(x.atend_agua), esgoto: numN(x.atend_esgoto), perdas: numN(x.perdas_agua) })),
    } : null,
  };
}

// PROTÓTIPO — Viés de previsão de receita (semente do motor de sugestão de peças orçamentárias).
// Compara receita PREVISTA (LOA) × REALIZADA por ano → erro sistemático e acurácia do município.
export type ViesPrevisaoSC = {
  serie: { ano: number; previsto: number; realizado: number; vies: number; pandemia: boolean }[];
  viesMedio: number; erroMedioAbs: number; ufErroMedio: number;
  direcao: "subestima" | "superestima" | "neutro";
  classe: { label: string; cor: string };
  proximoAno: number; ajusteSugerido: number;
} | null;
export async function getViesPrevisaoSC(cod: string): Promise<ViesPrevisaoSC> {
  const [r, uf] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ano, receita_prevista p, receita a FROM financas_sc WHERE cod_ibge=$1 AND receita_prevista>0 AND receita>0 ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT round(avg(abs((receita-receita_prevista)/receita_prevista))*100,1) e FROM financas_sc WHERE receita_prevista>0 AND receita>0 AND ano>=2019 AND length(cod_ibge)=7`).catch(() => []), // exclui o Estado (cod '42') da média-UF de erro de previsão
  ]);
  if (r.length < 2) return null;
  const serie = r.map((x) => { const p = num(x.p), a = num(x.a), ano = num(x.ano); return { ano, previsto: p, realizado: a, vies: p ? ((a - p) / p) * 100 : 0, pandemia: ano === 2020 || ano === 2021 }; });
  // métricas excluindo pandemia (anos atípicos não definem o comportamento estrutural)
  const base = serie.filter((s) => !s.pandemia);
  const usar = base.length >= 2 ? base : serie;
  const viesMedio = usar.reduce((s, x) => s + x.vies, 0) / usar.length;
  const erroMedioAbs = usar.reduce((s, x) => s + Math.abs(x.vies), 0) / usar.length;
  const direcao = viesMedio > 3 ? "subestima" : viesMedio < -3 ? "superestima" : "neutro";
  const classe = erroMedioAbs < 5 ? { label: "Previsão realista", cor: "#16a34a" } : erroMedioAbs < 12 ? { label: "Precisão moderada", cor: "#d97706" } : { label: "Previsão pouco confiável", cor: "#dc2626" };
  return {
    serie, viesMedio: Math.round(viesMedio * 10) / 10, erroMedioAbs: Math.round(erroMedioAbs * 10) / 10,
    ufErroMedio: num(uf[0]?.e), direcao, classe,
    proximoAno: serie[serie.length - 1].ano + 1, ajusteSugerido: Math.round(viesMedio * 10) / 10,
  };
}

// MACROINDICADORES — metas da LDO × realizado (o que o município consolida como meta, mapeado contra a realidade).
export type MacroLDOItem = { chave: string; label: string; meta: number | null; realizado: number; cumpriu: boolean | null; tipo: "meta" | "execucao"; melhorMenor: boolean };
export type MacroLDOSC = { ano: number; itens: MacroLDOItem[]; primarioCumpridos: number; primarioTotal: number } | null;
export async function getMacroindicadoresSC(cod: string): Promise<MacroLDOSC> {
  const r = await query<Record<string, unknown>>(`SELECT * FROM metas_fiscais_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  if (!r.length) return null;
  const u = r[r.length - 1];
  const comMeta = r.filter((x) => num(x.meta_primario) !== 0);
  const cumpridos = comMeta.filter((x) => num(x.resultado_primario) >= num(x.meta_primario)).length;
  const itens: MacroLDOItem[] = [
    { chave: "primario", label: "Resultado primário", meta: num(u.meta_primario), realizado: num(u.resultado_primario), cumpriu: num(u.resultado_primario) >= num(u.meta_primario), tipo: "meta", melhorMenor: false },
    { chave: "nominal", label: "Resultado nominal", meta: num(u.meta_nominal), realizado: num(u.resultado_nominal), cumpriu: num(u.resultado_nominal) >= num(u.meta_nominal), tipo: "meta", melhorMenor: false },
    { chave: "receita", label: "Receita primária", meta: num(u.receita_prim_prev), realizado: num(u.receita_prim_real), cumpriu: null, tipo: "execucao", melhorMenor: false },
    { chave: "despesa", label: "Despesa primária", meta: num(u.despesa_prim_dot), realizado: num(u.despesa_prim_emp), cumpriu: null, tipo: "execucao", melhorMenor: true },
    { chave: "dcl", label: "Dívida consolidada líquida", meta: num(u.dcl_inicio), realizado: num(u.dcl_fim), cumpriu: num(u.dcl_fim) <= num(u.dcl_inicio), tipo: "execucao", melhorMenor: true },
  ];
  return { ano: num(u.ano), itens, primarioCumpridos: cumpridos, primarioTotal: comMeta.length };
}

// PROTÓTIPO — Viés de despesa por FUNÇÃO: dotação (orçado) × empenhado (executado) → taxa de execução.
// Revela onde o município SUPERORÇA e contingencia (execução baixa = dotação inflada).
export type ViesDespesaItem = { funcao: string; dotacao: number; empenhado: number; execucao: number };
export type ViesDespesaSC = { itens: ViesDespesaItem[]; execGlobal: number; anos: number[]; maisInflada: ViesDespesaItem | null } | null;
export async function getViesDespesaSC(cod: string): Promise<ViesDespesaSC> {
  const r = await query<Record<string, unknown>>(`
    SELECT funcao, sum(dotacao) dot, sum(empenhado) emp
    FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND dotacao IS NOT NULL AND dotacao>0
    GROUP BY funcao HAVING sum(dotacao)>0 ORDER BY sum(dotacao) DESC`, [cod]).catch(() => []);
  if (r.length < 2) return null;
  const anosR = await query<Record<string, unknown>>(`SELECT DISTINCT ano FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND dotacao IS NOT NULL ORDER BY ano`, [cod]).catch(() => []);
  const itens: ViesDespesaItem[] = r.map((x) => { const d = num(x.dot), e = num(x.emp); return { funcao: String(x.funcao), dotacao: d, empenhado: e, execucao: d ? Math.round((e / d) * 1000) / 10 : 0 }; });
  const totD = itens.reduce((s, x) => s + x.dotacao, 0), totE = itens.reduce((s, x) => s + x.empenhado, 0);
  // "mais inflada" = função relevante (>2% do orçamento) com menor execução
  const relevantes = itens.filter((x) => x.dotacao >= totD * 0.02);
  const maisInflada = relevantes.length ? relevantes.reduce((a, b) => (b.execucao < a.execucao ? b : a)) : null;
  return { itens, execGlobal: totD ? Math.round((totE / totD) * 1000) / 10 : 0, anos: anosR.map((x) => num(x.ano)), maisInflada };
}

// PROTÓTIPO — Projeção de receita por ORIGEM (FPM, ISS, ICMS, IPTU…) extrapolando a tendência do ARRECADADO real.
// Parte do realizado (não da previsão) → já corrige o viés histórico. Mediana do crescimento anual, com cap.
export type ProjReceitaItem = { item: string; tipo: "federal" | "estadual" | "propria"; fonteProjecao: string; serie: { ano: number; valor: number }[]; crescimento: number; atual: number; projetado: number; oficial: boolean };
export type ProjecaoReceitaSC = { proximoAno: number; itens: ProjReceitaItem[]; totalAtual: number; totalProjetado: number } | null;
// classificação da origem → quem projeta oficialmente (arquitetura pronta p/ plugar STN/SEF-SC sem retrabalho)
const TIPO_RECEITA: Record<string, "federal" | "estadual" | "propria"> = {
  FPM: "federal", ITR: "federal", "IPI-Exportação": "federal", FUNDEB: "federal", IRRF: "federal",
  ICMS: "estadual", IPVA: "estadual",
  IPTU: "propria", ISS: "propria", ITBI: "propria", "Rend. Aplicação": "propria",
};
export async function getProjecaoReceitaSC(cod: string): Promise<ProjecaoReceitaSC> {
  const [r, stn] = await Promise.all([
    query<Record<string, unknown>>(`SELECT item, ano, valor FROM receitas_detalhe_sc WHERE cod_ibge=$1 AND item NOT IN ('RCL') AND valor>0 ORDER BY item, ano`, [cod]).catch(() => []),
    // ÂNCORA OFICIAL: transferências federais realizadas (STN/Tesouro), anual — vencem a tendência interna
    query<Record<string, unknown>>(`SELECT item, ano, sum(valor) v FROM transferencias_stn_sc WHERE cod_ibge=$1 GROUP BY item, ano ORDER BY item, ano`, [cod]).catch(() => []),
  ]);
  if (r.length < 4) return null;
  const maxAnoRec = Math.max(...r.map((x) => num(x.ano)));
  // projeção ancorada no STN: mediana do crescimento da série oficial (anos completos ≤ maxAno da receita)
  const stnByItem = new Map<string, { ano: number; v: number }[]>();
  for (const x of stn) { const it = String(x.item); const ano = num(x.ano); if (ano > maxAnoRec) continue; if (!stnByItem.has(it)) stnByItem.set(it, []); stnByItem.get(it)!.push({ ano, v: num(x.v) }); }
  const oficMap = new Map<string, { valor: number; fonte: string }>();
  for (const [it, serie] of stnByItem) {
    if (serie.length < 3) continue;
    const gs: number[] = []; for (let i = 1; i < serie.length; i++) { const p = serie[i - 1].v; if (p > 0) gs.push((serie[i].v - p) / p); }
    gs.sort((a, b) => a - b); let cg = gs.length ? gs[Math.floor(gs.length / 2)] : 0; cg = Math.max(-0.2, Math.min(0.3, cg));
    oficMap.set(it, { valor: serie[serie.length - 1].v * (1 + cg), fonte: "STN (oficial)" });
  }
  const map = new Map<string, { ano: number; valor: number }[]>();
  for (const x of r) { const it = String(x.item); if (!map.has(it)) map.set(it, []); map.get(it)!.push({ ano: num(x.ano), valor: num(x.valor) }); }
  const anos = [...new Set(r.map((x) => num(x.ano)))].sort((a, b) => a - b);
  const proximoAno = anos[anos.length - 1] + 1;
  const itens: ProjReceitaItem[] = [];
  for (const [item, serie] of map) {
    if (serie.length < 3) continue;
    const g: number[] = [];
    for (let i = 1; i < serie.length; i++) { const p = serie[i - 1].valor; if (p > 0) g.push((serie[i].valor - p) / p); }
    g.sort((a, b) => a - b);
    let cr = g.length ? g[Math.floor(g.length / 2)] : 0; // mediana (robusta a outliers)
    cr = Math.max(-0.2, Math.min(0.3, cr));
    const atual = serie[serie.length - 1].valor;
    const tipo = TIPO_RECEITA[item] || "propria";
    const of = oficMap.get(item);
    // ICMS/IPVA: a cota-parte do receitas_detalhe (SICONFI) É o repasse oficial do Estado — validada vs FECAM (ICMS de Floripa bate). Marca como oficial, mantendo a projeção pela própria série oficial.
    const ehEstadualOficial = !of && (item === "ICMS" || item === "IPVA");
    const projetado = of ? Math.round(of.valor) : Math.round(atual * (1 + cr));
    const fonteProj = of ? of.fonte : ehEstadualOficial ? "SEF-SC — cota-parte estadual (via SICONFI)" : "tendência (mediana do crescimento real)";
    itens.push({ item, tipo, fonteProjecao: fonteProj, serie, crescimento: Math.round(cr * 1000) / 10, atual, projetado, oficial: !!of || ehEstadualOficial });
  }
  if (itens.length < 2) return null;
  itens.sort((a, b) => b.projetado - a.projetado);
  return { proximoAno, itens, totalAtual: itens.reduce((s, x) => s + x.atual, 0), totalProjetado: itens.reduce((s, x) => s + x.projetado, 0) };
}

// Transferências da União por município (OFICIAL, STN/Tesouro) — mensal + anual por repasse + soma total.
export type TransfMensalItem = { item: string; meses: number[]; anual: number; compoeFundeb: boolean };
export type TransferenciasStnSC = { ano: number; anosDisponiveis: number[]; itens: TransfMensalItem[]; totalMeses: number[]; totalAnual: number } | null;
const COMPOE_FUNDEB = new Set(["FPM", "ITR", "Lei Kandir (LC 87/96)"]); // sofrem dedução de 20% p/ o FUNDEB
export async function getTransferenciasStnSC(cod: string, ano?: number): Promise<TransferenciasStnSC> {
  const anosR = await query<Record<string, unknown>>(`SELECT DISTINCT ano FROM transferencias_stn_sc WHERE cod_ibge=$1 ORDER BY ano DESC`, [cod]).catch(() => []);
  if (!anosR.length) return null;
  const anosDisponiveis = anosR.map((x) => num(x.ano));
  const alvo = ano && anosDisponiveis.includes(ano) ? ano : anosDisponiveis[0];
  const r = await query<Record<string, unknown>>(`SELECT item, mes, valor FROM transferencias_stn_sc WHERE cod_ibge=$1 AND ano=$2`, [cod, alvo]).catch(() => []);
  if (!r.length) return null;
  const map = new Map<string, number[]>();
  for (const x of r) { const it = String(x.item); if (!map.has(it)) map.set(it, new Array(12).fill(0)); const m = num(x.mes); if (m >= 1 && m <= 12) map.get(it)![m - 1] += num(x.valor); }
  const itens: TransfMensalItem[] = [...map.entries()].map(([item, meses]) => ({ item, meses: meses.map((v) => Math.round(v * 100) / 100), anual: Math.round(meses.reduce((s, v) => s + v, 0) * 100) / 100, compoeFundeb: COMPOE_FUNDEB.has(item) }))
    .filter((x) => x.anual > 0).sort((a, b) => b.anual - a.anual);
  const totalMeses = new Array(12).fill(0); for (const it of itens) it.meses.forEach((v, i) => (totalMeses[i] += v));
  return { ano: alvo, anosDisponiveis, itens, totalMeses: totalMeses.map((v) => Math.round(v * 100) / 100), totalAnual: Math.round(itens.reduce((s, x) => s + x.anual, 0) * 100) / 100 };
}

// PEÇA ORÇAMENTÁRIA COMPLETA (sugestão) — receita projetada → despesa por função respeitando vinculações + LRF.
export type PecaFuncao = { funcao: string; pctHist: number; valorSugerido: number; minimo: number | null; ajustadoAoMinimo: boolean };
export type PecaCompletaSC = {
  anoBase: number; proximoAno: number; crescimento: number;
  receitaProjetada: number; baseVinculavel: number; despesaTotal: number;
  funcoes: PecaFuncao[];
  saudeMin: number; educMin: number; pessoalProjetado: number; pessoalPctReceita: number;
  pessoalPctRCL: number | null; // % oficial sobre a RCL (base correta da LRF)
  ldo: { ano: number; receitaPrev: number; despesaDot: number; metaResultado: number } | null; // âncora na última LDO do município
  alertas: string[];
} | null;
export async function getPecaCompletaSC(cod: string): Promise<PecaCompletaSC> {
  const [r, rgf, mf] = await Promise.all([
    query<Record<string, unknown>>(`SELECT ano, receita, tributaria, transferencias, despesa, pessoal, saude, educacao, seguranca, assistencia, infraestrutura, administracao FROM financas_sc WHERE cod_ibge=$1 AND receita>0 ORDER BY ano`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT pessoal_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, receita_prim_prev, despesa_prim_dot, meta_primario FROM metas_fiscais_sc WHERE cod_ibge=$1 AND receita_prim_prev>0 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
  ]);
  if (r.length < 2) return null;
  const u = r[r.length - 1];
  // crescimento: mediana do crescimento anual da receita (exclui pandemia 2020-21)
  const serie = r.map((x) => ({ ano: num(x.ano), rec: num(x.receita) })).filter((x) => !(x.ano === 2020 || x.ano === 2021) || r.length <= 3);
  const g: number[] = []; for (let i = 1; i < serie.length; i++) { const p = serie[i - 1].rec; if (p > 0) g.push((serie[i].rec - p) / p); }
  g.sort((a, b) => a - b); let cr = g.length ? g[Math.floor(g.length / 2)] : 0.05; cr = Math.max(-0.1, Math.min(0.2, cr));
  const f = 1 + cr;
  const receitaProjetada = num(u.receita) * f;
  const baseVinculavel = (num(u.tributaria) + num(u.transferencias)) * f; // impostos + transferências = base dos mínimos
  const despesaTotal = receitaProjetada; // orçamento equilibrado
  const despHist = num(u.despesa) || 1;
  const FUNCS: [string, number][] = [["Saúde", num(u.saude)], ["Educação", num(u.educacao)], ["Administração", num(u.administracao)], ["Assistência Social", num(u.assistencia)], ["Segurança", num(u.seguranca)], ["Urbanismo/Infraestrutura", num(u.infraestrutura)]];
  const somaConhecidas = FUNCS.reduce((s, [, v]) => s + v, 0);
  const saudeMin = 0.15 * baseVinculavel, educMin = 0.25 * baseVinculavel;
  const alertas: string[] = [];
  const funcoes: PecaFuncao[] = FUNCS.map(([nome, hist]) => {
    const pctHist = despHist ? hist / despHist : 0;
    let valor = pctHist * despesaTotal, minimo: number | null = null, ajust = false;
    if (nome === "Saúde") { minimo = saudeMin; if (valor < minimo) { valor = minimo; ajust = true; alertas.push("Saúde ajustada ao piso constitucional de 15% (histórico abaixo do mínimo)."); } }
    if (nome === "Educação") { minimo = educMin; if (valor < minimo) { valor = minimo; ajust = true; alertas.push("Educação ajustada ao piso constitucional de 25% (histórico abaixo do mínimo)."); } }
    return { funcao: nome, pctHist: Math.round(pctHist * 1000) / 10, valorSugerido: Math.round(valor), minimo: minimo ? Math.round(minimo) : null, ajustadoAoMinimo: ajust };
  });
  const outras = Math.max(0, despesaTotal - funcoes.reduce((s, x) => s + x.valorSugerido, 0));
  if (outras > 0) funcoes.push({ funcao: "Demais funções / Encargos", pctHist: Math.round((1 - somaConhecidas / despHist) * 1000) / 10, valorSugerido: Math.round(outras), minimo: null, ajustadoAoMinimo: false });
  const pessoalProjetado = num(u.pessoal) * f;
  const pessoalPctReceita = receitaProjetada ? Math.round((pessoalProjetado / receitaProjetada) * 1000) / 10 : 0;
  const pessoalPctRCL = rgf[0]?.pessoal_pct != null ? Math.round(num(rgf[0].pessoal_pct) * 10) / 10 : null;
  // o limite da LRF é sobre a RCL — usar o % oficial (rgf_sc) quando disponível
  if (pessoalPctRCL != null && pessoalPctRCL > 54) alertas.push(`Despesa de pessoal em ${pessoalPctRCL}% da RCL — acima do limite máximo da LRF (54%); a peça precisa conter a folha.`);
  else if (pessoalPctRCL != null && pessoalPctRCL > 51.3) alertas.push(`Despesa de pessoal em ${pessoalPctRCL}% da RCL — acima do limite prudencial (51,3%); espaço apertado para a folha na LOA.`);
  const ldo = mf[0] ? { ano: num(mf[0].ano), receitaPrev: Math.round(num(mf[0].receita_prim_prev)), despesaDot: Math.round(num(mf[0].despesa_prim_dot)), metaResultado: Math.round(num(mf[0].meta_primario)) } : null;
  return { anoBase: num(u.ano), proximoAno: num(u.ano) + 1, crescimento: Math.round(cr * 1000) / 10, receitaProjetada: Math.round(receitaProjetada), baseVinculavel: Math.round(baseVinculavel), despesaTotal: Math.round(despesaTotal), funcoes, saudeMin: Math.round(saudeMin), educMin: Math.round(educMin), pessoalProjetado: Math.round(pessoalProjetado), pessoalPctReceita, pessoalPctRCL, ldo, alertas };
}

// ACOMPANHAMENTO por FUNÇÃO (intra-anual) — orçado (dotação) × realizado (empenhado) até o bimestre, por função.
export type AcompFuncaoItem = { funcao: string; dotacao: number; empenhado: number; execucao: number };
export type AcompanhamentoFuncaoSC = { ano: number; bimestre: number; mesAte: number; ritmoEsperado: number; itens: AcompFuncaoItem[]; totalDotacao: number; totalEmpenhado: number } | null;
export async function getAcompanhamentoFuncaoSC(cod: string): Promise<AcompanhamentoFuncaoSC> {
  const r = await query<Record<string, unknown>>(`SELECT funcao, dotacao, empenhado, bimestre, ano FROM acompanhamento_funcao_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM acompanhamento_funcao_sc WHERE cod_ibge=$1) AND dotacao>0 ORDER BY dotacao DESC`, [cod]).catch(() => []);
  if (!r.length) return null;
  const bim = num(r[0].bimestre), ano = num(r[0].ano);
  const itens = r.map((x) => { const d = num(x.dotacao), e = num(x.empenhado); return { funcao: String(x.funcao), dotacao: d, empenhado: e, execucao: d ? Math.round((e / d) * 1000) / 10 : 0 }; });
  return { ano, bimestre: bim, mesAte: bim * 2, ritmoEsperado: Math.round((bim * 2 / 12) * 1000) / 10, itens, totalDotacao: itens.reduce((s, x) => s + x.dotacao, 0), totalEmpenhado: itens.reduce((s, x) => s + x.empenhado, 0) };
}

// RED FLAGS DE FORNECEDORES — sinais de risco de integridade: concentração + sancionado + sobrepreço.
export type RedFlagItem = { fornecedor: string; nContratos: number; valorTotal: number; sharePct: number; sancionado: boolean; sancTipo: string; sancOrgao: string; sobreprecoEconomia: number; flags: number };
export type RedFlagsSC = { topConcentracao: number; nCriticos: number; nFlagged: number; itens: RedFlagItem[] } | null;
export async function getRedFlagsSC(cod: string): Promise<RedFlagsSC> {
  const [r, t] = await Promise.all([
    query<Record<string, unknown>>(`SELECT fornecedor, n_contratos, valor_total, share_pct, sancionado, sanc_tipo, sanc_orgao, sobrepreco_economia, flags FROM red_flags_fornecedores_sc WHERE cod_ibge=$1 ORDER BY flags DESC, valor_total DESC LIMIT 12`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) FILTER(WHERE flags>=1) flagged, count(*) FILTER(WHERE flags>=2) crit, max(share_pct) topc FROM red_flags_fornecedores_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!r.length) return null;
  return {
    topConcentracao: num(t[0]?.topc), nCriticos: num(t[0]?.crit), nFlagged: num(t[0]?.flagged),
    itens: r.map((x) => ({ fornecedor: String(x.fornecedor || ""), nContratos: num(x.n_contratos), valorTotal: num(x.valor_total), sharePct: num(x.share_pct), sancionado: !!x.sancionado, sancTipo: String(x.sanc_tipo || ""), sancOrgao: String(x.sanc_orgao || ""), sobreprecoEconomia: num(x.sobrepreco_economia), flags: num(x.flags) })),
  };
}

// IBGE MUNIC — instrumentos de gestão do município (planos, conselhos, fundos, instrumentos legais). Base de dados oficial.
export type MunicItem = { label: string; tem: boolean; valor: string };
export type MunicGrupo = { grupo: string; itens: MunicItem[]; tem: number; total: number };
export type MunicSC = { ano: number; grupos: MunicGrupo[]; totalTem: number; total: number } | null;
export async function getMunicSC(cod: string): Promise<MunicSC> {
  const r = await query<Record<string, unknown>>(`SELECT grupo, label, tem, valor, ano FROM munic_sc WHERE cod_ibge=$1 ORDER BY grupo, label`, [cod]).catch(() => []);
  if (!r.length) return null;
  const ano = num(r[0].ano);
  const ordem = ["Planos", "Conselhos", "Fundos", "Instrumentos legais", "Órgãos", "Outros"];
  const map = new Map<string, MunicItem[]>();
  for (const x of r) { const g = String(x.grupo || "Outros"); if (!map.has(g)) map.set(g, []); map.get(g)!.push({ label: String(x.label || ""), tem: !!x.tem, valor: String(x.valor || "") }); }
  const grupos: MunicGrupo[] = [...map.entries()].map(([grupo, itens]) => ({ grupo, itens, tem: itens.filter((i) => i.tem).length, total: itens.length }))
    .sort((a, b) => (ordem.indexOf(a.grupo) + 99) % 100 - (ordem.indexOf(b.grupo) + 99) % 100);
  return { ano, grupos, totalTem: r.filter((x) => x.tem).length, total: r.length };
}

// VARIAÇÃO INTERNA DE PREÇOS — o MESMO município comprou o MESMO item a preços diferentes (incoerência interna).
export type VariacaoInternaItem = { descricao: string; unidade: string; nCompras: number; menor: number; maior: number; razao: number; qtd: number; economia: number };
export type VariacaoInternaSC = { totalEconomia: number; nItens: number; itens: VariacaoInternaItem[] } | null;
export async function getVariacaoInternaSC(cod: string): Promise<VariacaoInternaSC> {
  const [r, t] = await Promise.all([
    query<Record<string, unknown>>(`SELECT descricao, unidade, n_compras, menor, maior, razao, qtd_total, economia FROM variacao_interna_sc WHERE cod_ibge=$1 ORDER BY economia DESC LIMIT 20`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n, sum(economia) e FROM variacao_interna_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!r.length) return null;
  return {
    totalEconomia: num(t[0]?.e), nItens: num(t[0]?.n),
    itens: r.map((x) => ({ descricao: String(x.descricao || ""), unidade: String(x.unidade || ""), nCompras: num(x.n_compras), menor: num(x.menor), maior: num(x.maior), razao: num(x.razao), qtd: num(x.qtd_total), economia: num(x.economia) })),
  };
}

// COMPRAS POR PREÇO UNITÁRIO — itens em que o município pagou acima da mediana de SC para o MESMO item (sobrepreço).
export type SobreprecoItem = { descricao: string; unidade: string; ano: number; quantidade: number; unitPago: number; unitRef: number; acimaPct: number; economia: number; nMunisRef: number; cvRef: number | null; unitNac: number | null; acimaNacPct: number | null; nacN: number | null };
export type SobreprecoSC = { totalEconomia: number; nItens: number; nComNacional: number; nAcimaNacional: number; itens: SobreprecoItem[] } | null;
export async function getSobreprecoSC(cod: string): Promise<SobreprecoSC> {
  const [r, t] = await Promise.all([
    query<Record<string, unknown>>(`SELECT descricao, unidade, ano, quantidade, unit_pago, unit_ref, acima_pct, economia, n_munis_ref, cv_ref, unit_nac, acima_nac_pct, nac_n FROM sobrepreco_compras_sc WHERE cod_ibge=$1 ORDER BY economia DESC LIMIT 30`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n, sum(economia) e, count(*) FILTER (WHERE unit_nac IS NOT NULL) cn, count(*) FILTER (WHERE acima_nac_pct > 0) an FROM sobrepreco_compras_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!r.length) return null;
  return {
    totalEconomia: num(t[0]?.e), nItens: num(t[0]?.n), nComNacional: num(t[0]?.cn), nAcimaNacional: num(t[0]?.an),
    itens: r.map((x) => ({ descricao: String(x.descricao || ""), unidade: String(x.unidade || ""), ano: num(x.ano), quantidade: num(x.quantidade), unitPago: num(x.unit_pago), unitRef: num(x.unit_ref), acimaPct: num(x.acima_pct), economia: num(x.economia), nMunisRef: num(x.n_munis_ref), cvRef: x.cv_ref != null ? num(x.cv_ref) : null, unitNac: x.unit_nac != null ? num(x.unit_nac) : null, acimaNacPct: x.acima_nac_pct != null ? num(x.acima_nac_pct) : null, nacN: x.nac_n != null ? num(x.nac_n) : null })),
  };
}

// CEIS/CNEP × FORNECEDORES — fornecedores do município com sanção VIGENTE (controle). Cruza contratos×sanções por CNPJ.
export type FornecedorSancionado = { fornecedor: string; fonte: string; tipoSancao: string; orgao: string; fundamentacao: string; dataInicio: string | null; dataFim: string | null; nContratos: number; valorTotal: number; vigente: boolean };
export type FornecedoresSancionadosSC = { total: number; valorTotal: number; comContratoVigente: number; itens: FornecedorSancionado[] } | null;
export async function getFornecedoresSancionadosSC(cod: string): Promise<FornecedoresSancionadosSC> {
  const r = await query<Record<string, unknown>>(`
    SELECT c.fornecedor, s.fonte, s.tipo_sancao, s.orgao, s.fundamentacao, to_char(s.data_inicio,'YYYY-MM-DD') data_inicio, to_char(s.data_fim,'YYYY-MM-DD') data_fim,
      count(DISTINCT c.id) n, sum(c.valor_global) valor, bool_or(c.vig_fim >= current_date) vigente
    FROM contratos_sc c JOIN sancoes s ON regexp_replace(c.ni_fornecedor,'[^0-9]','','g')=regexp_replace(s.ni,'[^0-9]','','g')
    WHERE c.cod_ibge=$1 AND length(regexp_replace(c.ni_fornecedor,'[^0-9]','','g'))>=11
      AND (s.data_fim IS NULL OR s.data_fim >= current_date)
    GROUP BY c.fornecedor, s.fonte, s.tipo_sancao, s.orgao, s.fundamentacao, s.data_inicio, s.data_fim
    ORDER BY valor DESC NULLS LAST`, [cod]).catch(() => []);
  if (!r.length) return null;
  const itens = r.map((x) => ({ fornecedor: String(x.fornecedor || ""), fonte: String(x.fonte || ""), tipoSancao: String(x.tipo_sancao || ""), orgao: String(x.orgao || ""), fundamentacao: String(x.fundamentacao || ""), dataInicio: x.data_inicio ? String(x.data_inicio).slice(0, 10) : null, dataFim: x.data_fim ? String(x.data_fim).slice(0, 10) : null, nContratos: num(x.n), valorTotal: num(x.valor), vigente: !!x.vigente }));
  return { total: itens.length, valorTotal: itens.reduce((s, i) => s + i.valorTotal, 0), comContratoVigente: itens.filter((i) => i.vigente).length, itens };
}

// MSC ANCORADA AO RREO — despesa empenhada por NATUREZA e por FONTE (forma da MSC × total exato do RREO).
export type MscDespesaSC = {
  ano: number; totalRreo: number;
  natureza: { categoria: string; valor: number; pct: number }[];
  fonte: { categoria: string; valor: number; pct: number }[];
} | null;
export async function getMscDespesaSC(cod: string): Promise<MscDespesaSC> {
  const r = await query<Record<string, unknown>>(`SELECT tipo, categoria, valor, total_rreo, ano FROM msc_despesa_sc WHERE cod_ibge=$1 AND ano=(SELECT max(ano) FROM msc_despesa_sc WHERE cod_ibge=$1) ORDER BY valor DESC`, [cod]).catch(() => []);
  if (!r.length) return null;
  const ano = num(r[0].ano), totalRreo = num(r[0].total_rreo);
  const monta = (tipo: string) => r.filter((x) => x.tipo === tipo).map((x) => ({ categoria: String(x.categoria), valor: num(x.valor), pct: totalRreo ? Math.round((num(x.valor) / totalRreo) * 1000) / 10 : 0 }));
  return { ano, totalRreo, natureza: monta("natureza"), fonte: monta("fonte") };
}

// PPA POR PROGRAMA — detalhamento da despesa por FUNÇÃO → SUBFUNÇÃO (orçado×executado), o nível programático.
export type PpaSubfuncao = { subfuncao: string; dotacao: number; empenhado: number; execucao: number };
export type PpaFuncao = { funcao: string; dotacao: number; empenhado: number; execucao: number; subfuncoes: PpaSubfuncao[] };
export type PpaProgramaSC = { ano: number; funcoes: PpaFuncao[]; totalDotacao: number; totalEmpenhado: number } | null;
export async function getPpaProgramaSC(cod: string): Promise<PpaProgramaSC> {
  // último ano COMPLETO (com detalhe de subfunção — exclui o ano corrente parcial, que vem como "Demais Subfunções")
  const ay = await query<Record<string, unknown>>(`SELECT ano FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND dotacao IS NOT NULL GROUP BY ano HAVING count(DISTINCT subfuncao) > 12 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []);
  if (!ay.length) return null;
  const ano = num(ay[0].ano);
  const r = await query<Record<string, unknown>>(`SELECT funcao, subfuncao, dotacao, empenhado FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND ano=$2 AND dotacao>0 ORDER BY funcao, dotacao DESC`, [cod, ano]).catch(() => []);
  if (!r.length) return null;
  const map = new Map<string, PpaSubfuncao[]>();
  for (const x of r) { const fn = String(x.funcao); if (!map.has(fn)) map.set(fn, []); const d = num(x.dotacao), e = num(x.empenhado); map.get(fn)!.push({ subfuncao: String(x.subfuncao), dotacao: d, empenhado: e, execucao: d ? Math.round((e / d) * 1000) / 10 : 0 }); }
  const funcoes: PpaFuncao[] = [...map.entries()].map(([funcao, subs]) => { const dot = subs.reduce((s, x) => s + x.dotacao, 0), emp = subs.reduce((s, x) => s + x.empenhado, 0); return { funcao, dotacao: dot, empenhado: emp, execucao: dot ? Math.round((emp / dot) * 1000) / 10 : 0, subfuncoes: subs }; }).filter((f) => f.dotacao > 0).sort((a, b) => b.dotacao - a.dotacao);
  return { ano, funcoes, totalDotacao: funcoes.reduce((s, x) => s + x.dotacao, 0), totalEmpenhado: funcoes.reduce((s, x) => s + x.empenhado, 0) };
}

// ACOMPANHAMENTO intra-anual — execução do orçamento até o bimestre (RREO vigente) vs ritmo esperado.
export type AcompanhamentoSC = {
  ano: number; bimestre: number; mesAte: number; ritmoEsperado: number;
  receitaPrevista: number; receitaRealizada: number; receitaPct: number;
  despesaDotacao: number; despesaEmpenhada: number; despesaPct: number;
  receitaUfMedia: number;
} | null;
export async function getAcompanhamentoSC(cod: string): Promise<AcompanhamentoSC> {
  const [r, uf] = await Promise.all([
    query<Record<string, unknown>>(`SELECT * FROM acompanhamento_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT round(avg(receita_realizada/NULLIF(receita_prevista,0))*100,1) m FROM acompanhamento_sc WHERE ano=(SELECT max(ano) FROM acompanhamento_sc) AND receita_prevista>0`).catch(() => []),
  ]);
  if (!r.length) return null;
  const x = r[0];
  const recPrev = num(x.receita_prevista), recReal = num(x.receita_realizada), despDot = num(x.despesa_dotacao), despEmp = num(x.despesa_empenhada);
  const bim = num(x.bimestre);
  return {
    ano: num(x.ano), bimestre: bim, mesAte: bim * 2, ritmoEsperado: Math.round((bim * 2 / 12) * 1000) / 10,
    receitaPrevista: recPrev, receitaRealizada: recReal, receitaPct: recPrev ? Math.round((recReal / recPrev) * 1000) / 10 : 0,
    despesaDotacao: despDot, despesaEmpenhada: despEmp, despesaPct: despDot ? Math.round((despEmp / despDot) * 1000) / 10 : 0,
    receitaUfMedia: num(uf[0]?.m),
  };
}

// CAUC — regularidade fiscal para transferências voluntárias (Tesouro; lê CADIN diariamente)
export type CaucItem = { codigo: string; status: "regular" | "vencido" | "pendente" | "desabilitado"; validade: string | null };
export type CaucSC = { dataPesquisa: string | null; apto: boolean; nPendencias: number; pendencias: string[]; grupos: string[]; itens: CaucItem[] } | null;
export async function getCaucSC(cod: string): Promise<CaucSC> {
  const r = (await query<Record<string, unknown>>(`SELECT to_char(data_pesquisa,'DD/MM/YYYY') dp, apto, n_pendencias, pendencias, grupos_pendentes FROM cauc_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  // extrato item a item (cauc_detalhe_sc): "comprovado" vira regular/vencido conforme a validade vs hoje
  const det = await query<Record<string, unknown>>(`SELECT codigo, status, to_char(validade,'DD/MM/YYYY') validade, (validade < current_date) vencido FROM cauc_detalhe_sc WHERE cod_ibge=$1 ORDER BY string_to_array(codigo,'.')::int[]`, [cod]).catch(() => []);
  const itens: CaucItem[] = det.map((x) => {
    let status = String(x.status);
    if (status === "comprovado") status = x.vencido === true ? "vencido" : "regular";
    else if (status !== "pendente" && status !== "desabilitado") status = "pendente";
    return { codigo: String(x.codigo), status: status as CaucItem["status"], validade: x.validade ? String(x.validade) : null };
  });
  return { dataPesquisa: r.dp ? String(r.dp) : null, apto: !!r.apto, nPendencias: num(r.n_pendencias), pendencias: Array.isArray(r.pendencias) ? (r.pendencias as string[]) : [], grupos: Array.isArray(r.grupos_pendentes) ? (r.grupos_pendentes as string[]) : [], itens };
}

// Assistência Social (MDS / MI Social) — consolidado (CadÚnico, Bolsa Família, CRAS/CREAS) + série FNAS (PSB/PSE).
export type AssistenciaSocialSC = {
  refMes: string | null; populacao: number;
  cras: number; creas: number; acolhimento: number; habPorCras: number | null; deficitCras: boolean;
  cadFamilias: number; cadPessoas: number; cadPobreza: number; cadRendaZero: number; cadTaxaAtualizacao: number | null;
  pbfFamilias: number; pbfBeneficioMedio: number | null;
  gapCobertura: number; // famílias em pobreza no CadÚnico que ainda não recebem o Bolsa Família (busca ativa)
  bpcBeneficiarios: number; bpcValorMes: number; bpcIdosos: number; bpcDeficientes: number; // BPC (idosos/deficientes de baixa renda)
  condSaude: { cobertura: number; mediana: number; periodo: string; deficit: boolean } | null; // acompanhamento de saúde do PBF (condicionalidade)
  serieVulnerab: { ano: number; pbf: number; bpc: number }[]; // trajetória da proteção social (MI Social, série anual)
  trajetoria: { pbfVar: number | null; bpcVar: number | null; anos: number } | null; // variação % no período
  fnasUltimoAno: number; anoUlt: number;
  serie: { ano: number; total: number; psb: number; pse: number }[];
} | null;
const REF_CRAS_HAB = 20000; // NOB-SUAS: 1 CRAS por ~20 mil hab
export async function getAssistenciaSocialSC(cod: string): Promise<AssistenciaSocialSC> {
  const r = (await query<Record<string, unknown>>(`SELECT anomes_ref, populacao, cras, creas, acolhimento, hab_por_cras, cad_familias, cad_pessoas, cad_familias_pobreza, cad_familias_renda_zero, cad_taxa_atualizacao, pbf_familias, pbf_beneficio_medio, bpc_beneficiarios, bpc_valor, bpc_idosos, bpc_deficientes, fnas_repasse_ult_ano, ano_ult FROM assistencia_social_sc WHERE cod_ibge=$1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  const serieRows = await query<Record<string, unknown>>(`SELECT ano, fnas_total, fnas_psb, fnas_pse FROM assistencia_repasse_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []);
  // condicionalidade de saúde do Bolsa Família (cobertura de acompanhamento) vs mediana de SC — última vigência disponível
  const cs = (await query<Record<string, unknown>>(`WITH p AS (SELECT max(anomes) m FROM mi_social_serie_sc WHERE indicador='cond_saude_cobertura' AND valor>0),
      c AS (SELECT cod_ibge, valor FROM mi_social_serie_sc WHERE indicador='cond_saude_cobertura' AND anomes=(SELECT m FROM p) AND valor>0 AND length(cod_ibge)=7)
      SELECT (SELECT m FROM p) periodo, (SELECT valor FROM c WHERE cod_ibge=$1) minha, percentile_cont(0.5) WITHIN GROUP (ORDER BY valor) mediana FROM c`, [cod]).catch(() => []))[0];
  // trajetória da proteção social: série anual (último mês de cada ano) de famílias no PBF e beneficiários do BPC
  const svRows = await query<Record<string, unknown>>(`WITH base AS (
      SELECT left(anomes,4)::int ano, indicador, valor, row_number() OVER (PARTITION BY left(anomes,4), indicador ORDER BY anomes DESC) rn
      FROM mi_social_serie_sc WHERE cod_ibge=$1 AND indicador IN ('pbf_familias','bpc_beneficiarios') AND valor>0)
      SELECT ano, indicador, valor FROM base WHERE rn=1 AND ano>=2010 ORDER BY ano`, [cod]).catch(() => []);
  const am = String(r.anomes_ref || ""); // "AAAAMM" → "MM/AAAA"
  const refMes = /^\d{6}$/.test(am) ? `${am.slice(4, 6)}/${am.slice(0, 4)}` : am || null;
  const hpc = r.hab_por_cras != null ? num(r.hab_por_cras) : null;
  const cras = num(r.cras), pop = num(r.populacao);
  const svMap = new Map<number, { ano: number; pbf: number; bpc: number }>();
  for (const x of svRows) { const a = num(x.ano); const e = svMap.get(a) || { ano: a, pbf: 0, bpc: 0 }; if (x.indicador === "pbf_familias") e.pbf = num(x.valor); else e.bpc = num(x.valor); svMap.set(a, e); }
  const serieVulnerab = [...svMap.values()].sort((a, b) => a.ano - b.ano);
  let trajetoria: { pbfVar: number | null; bpcVar: number | null; anos: number } | null = null;
  if (serieVulnerab.length >= 2) {
    const ult = serieVulnerab[serieVulnerab.length - 1];
    const ref = serieVulnerab.find((s) => s.ano >= ult.ano - 5) ?? serieVulnerab[0];
    trajetoria = { pbfVar: ref.pbf > 0 ? Math.round(((ult.pbf - ref.pbf) / ref.pbf) * 100) : null, bpcVar: ref.bpc > 0 ? Math.round(((ult.bpc - ref.bpc) / ref.bpc) * 100) : null, anos: ult.ano - ref.ano };
  }
  return {
    refMes, populacao: pop, cras, creas: num(r.creas), acolhimento: num(r.acolhimento), habPorCras: hpc,
    deficitCras: (cras === 0 && pop > 0) || (hpc != null && hpc > REF_CRAS_HAB),
    cadFamilias: num(r.cad_familias), cadPessoas: num(r.cad_pessoas), cadPobreza: num(r.cad_familias_pobreza), cadRendaZero: num(r.cad_familias_renda_zero),
    cadTaxaAtualizacao: r.cad_taxa_atualizacao != null ? num(r.cad_taxa_atualizacao) : null,
    pbfFamilias: num(r.pbf_familias), pbfBeneficioMedio: r.pbf_beneficio_medio != null ? num(r.pbf_beneficio_medio) : null,
    gapCobertura: Math.max(0, num(r.cad_familias_pobreza) - num(r.pbf_familias)),
    bpcBeneficiarios: num(r.bpc_beneficiarios), bpcValorMes: num(r.bpc_valor), bpcIdosos: num(r.bpc_idosos), bpcDeficientes: num(r.bpc_deficientes),
    condSaude: cs && cs.minha != null && num(cs.mediana) > 0
      ? { cobertura: num(cs.minha), mediana: num(cs.mediana), periodo: `${String(cs.periodo).slice(4, 6)}/${String(cs.periodo).slice(0, 4)}`, deficit: num(cs.minha) < num(cs.mediana) }
      : null,
    serieVulnerab, trajetoria,
    fnasUltimoAno: num(r.fnas_repasse_ult_ano), anoUlt: num(r.ano_ult),
    serie: serieRows.map((x) => ({ ano: num(x.ano), total: num(x.fnas_total), psb: num(x.fnas_psb), pse: num(x.fnas_pse) })),
  };
}

// Equipamentos da Assistência Social (unidades CRAS/CREAS/Centro POP/Acolhimento…) — CadSUAS, uma a uma.
export type EquipamentosSuasSC = {
  total: number; comEndereco: number;
  porTipo: { tipo: string; n: number }[];
  lista: { nome: string; tipo: string; nrId: string | null; endereco: string | null; telefone: string | null }[];
} | null;
export async function getEquipamentosSuasSC(cod: string): Promise<EquipamentosSuasSC> {
  const rows = await query<Record<string, unknown>>(`SELECT nome, tipo, nr_identificador, endereco, telefone FROM equipamentos_suas_sc WHERE cod_ibge=$1 ORDER BY tipo, nome`, [cod]).catch(() => []);
  if (!rows.length) return null;
  const m = new Map<string, number>();
  for (const r of rows) { const t = String(r.tipo || "OUTRA"); m.set(t, (m.get(t) || 0) + 1); }
  return {
    total: rows.length, comEndereco: rows.filter((r) => r.endereco).length,
    porTipo: [...m.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    lista: rows.map((r) => ({ nome: String(r.nome || ""), tipo: String(r.tipo || ""), nrId: r.nr_identificador ? String(r.nr_identificador) : null, endereco: r.endereco ? String(r.endereco) : null, telefone: r.telefone ? String(r.telefone) : null })),
  };
}

// Mapa unificado de equipamentos PÚBLICOS (saúde + educação + assistência) com coordenadas, por município.
export type CatEquip = "saude" | "saude_filantropica" | "educacao" | "assistencia" | "prisional" | "socioeducativo" | "policia" | "guarda_municipal" | "bombeiros" | "defesa_civil" | "esporte";
export type PontoEquip = { cat: CatEquip; nome: string; tipo: string; bairro: string | null; lat: number; lon: number; aprox?: boolean; afd?: number | null; tdi?: number | null; atu?: number | null };
export type MapaEquipamentosSC = { pontos: PontoEquip[]; porCat: Record<string, number>; center: [number, number]; assistOcultos: number } | null;
export async function getMapaEquipamentosSC(cod: string): Promise<MapaEquipamentosSC> {
  const [sau, fil, edu, ass, jus, ocultosR, esp] = await Promise.all([
    query<Record<string, unknown>>(`SELECT nome, tipo, bairro, latitude lat, longitude lon FROM estabelecimentos_saude_sc WHERE cod_ibge=$1 AND natureza_grupo='Público' AND latitude IS NOT NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT nome, tipo, bairro, latitude lat, longitude lon FROM estabelecimentos_saude_sc WHERE cod_ibge=$1 AND natureza_grupo='Filantrópico' AND latitude IS NOT NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT s.nome, s.dependencia, s.bairro, s.latitude lat, s.longitude lon,
      (SELECT coalesce(fun_ai,fun_af,ed_inf) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='AFD' ORDER BY ano DESC LIMIT 1) afd,
      (SELECT coalesce(fun_ai,fun_af) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='TDI' ORDER BY ano DESC LIMIT 1) tdi,
      (SELECT coalesce(fun_ai,fun_af,ed_inf) FROM indicadores_inep_escola_sc WHERE co_entidade=s.co_entidade AND indicador='ATU' ORDER BY ano DESC LIMIT 1) atu
      FROM escolas_sc s WHERE s.cod_ibge=$1 AND s.dependencia::text IN ('1','2','3') AND s.latitude IS NOT NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT nome, tipo, latitude lat, longitude lon, geo_fonte FROM equipamentos_suas_sc WHERE cod_ibge=$1 AND latitude IS NOT NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT cat, nome, tipo, latitude lat, longitude lon, aprox FROM equipamentos_justica_sc WHERE cod_ibge=$1 AND latitude IS NOT NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n FROM equipamentos_suas_sc WHERE cod_ibge=$1 AND latitude IS NULL`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT nome, tipo, latitude lat, longitude lon FROM equipamentos_esporte_sc WHERE cod_ibge=$1 AND latitude IS NOT NULL`, [cod]).catch(() => []),
  ]);
  const assistOcultos = num(ocultosR[0]?.n);
  const DEP: Record<string, string> = { "1": "Escola Federal", "2": "Escola Estadual", "3": "Escola Municipal" };
  const pontos: PontoEquip[] = [
    ...sau.map((r) => ({ cat: "saude" as const, nome: String(r.nome || ""), tipo: String(r.tipo || "Saúde"), bairro: r.bairro ? String(r.bairro) : null, lat: num(r.lat), lon: num(r.lon) })),
    ...fil.map((r) => ({ cat: "saude_filantropica" as const, nome: String(r.nome || ""), tipo: String(r.tipo || "Saúde filantrópica"), bairro: r.bairro ? String(r.bairro) : null, lat: num(r.lat), lon: num(r.lon) })),
    ...edu.map((r) => ({ cat: "educacao" as const, nome: String(r.nome || ""), tipo: DEP[String(r.dependencia)] || "Escola pública", bairro: r.bairro ? String(r.bairro) : null, lat: num(r.lat), lon: num(r.lon), afd: r.afd != null ? num(r.afd) : null, tdi: r.tdi != null ? num(r.tdi) : null, atu: r.atu != null ? num(r.atu) : null })),
    ...ass.map((r) => ({ cat: "assistencia" as const, nome: String(r.nome || ""), tipo: String(r.tipo || "SUAS"), bairro: null, lat: num(r.lat), lon: num(r.lon), aprox: r.geo_fonte === "cep" })),
    ...jus.map((r) => ({ cat: String(r.cat) as CatEquip, nome: String(r.nome || ""), tipo: String(r.tipo || ""), bairro: null, lat: num(r.lat), lon: num(r.lon), aprox: r.aprox === true })),
    ...esp.map((r) => ({ cat: "esporte" as const, nome: String(r.nome || ""), tipo: String(r.tipo || "Equipamento esportivo"), bairro: null, lat: num(r.lat), lon: num(r.lon) })),
  ].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0 && p.lat > -34 && p.lat < 6);
  if (!pontos.length) return null;
  const center: [number, number] = [pontos.reduce((s, p) => s + p.lat, 0) / pontos.length, pontos.reduce((s, p) => s + p.lon, 0) / pontos.length];
  const porCat: Record<string, number> = {};
  for (const p of pontos) porCat[p.cat] = (porCat[p.cat] || 0) + 1;
  return { pontos, porCat, center, assistOcultos };
}

export type RgfResumo = { ano: number; pessoalPct: number; rclAjustada: number; dclPct: number | null } | null;
export async function getRgfResumoSC(cod: string): Promise<RgfResumo> {
  const r = (await query<Record<string, unknown>>(`SELECT ano, pessoal_pct, rcl_ajustada, dcl_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY ano DESC LIMIT 1`, [cod]).catch(() => []))[0];
  if (!r) return null;
  return { ano: num(r.ano), pessoalPct: num(r.pessoal_pct), rclAjustada: num(r.rcl_ajustada), dclPct: r.dcl_pct == null ? null : num(r.dcl_pct) };
}

// Central de Alertas — amarra os pontos cegos do município num feed priorizado (risco a evitar + ação).
export type Alerta = { sev: "critico" | "alto" | "medio"; area: string; titulo: string; detalhe: string; acao: string };
export async function getAlertasSC(cod: string): Promise<Alerta[]> {
  const [crp, cauc, assist, cs, rf, conv, draa, semrreo] = await Promise.all([
    query<Record<string, unknown>>(`SELECT tp_crp, ds_situacao, dt_validade FROM rpps_crp_sc WHERE cod_ibge=$1 ORDER BY dt_emissao DESC NULLS LAST LIMIT 1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) FILTER (WHERE status='pendente') venc, count(*) tot FROM cauc_detalhe_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT GREATEST(0, cad_familias_pobreza - pbf_familias) gap, cras, hab_por_cras, populacao FROM assistencia_social_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`WITH p AS (SELECT max(anomes) m FROM mi_social_serie_sc WHERE indicador='cond_saude_cobertura' AND valor>0),
      c AS (SELECT cod_ibge, valor FROM mi_social_serie_sc WHERE indicador='cond_saude_cobertura' AND anomes=(SELECT m FROM p) AND valor>0 AND length(cod_ibge)=7)
      SELECT (SELECT valor FROM c WHERE cod_ibge=$1) minha, percentile_cont(0.5) WITHIN GROUP (ORDER BY valor) mediana FROM c`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) FILTER (WHERE sancionado AND share_pct > 25) crit FROM red_flags_fornecedores_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(valor),0) v FROM convenios_captados_sc WHERE cod_ibge=$1 AND situacao IN ('INADIMPLENTE','PRESTAÇÃO DE CONTAS REJEITADA')`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT EXISTS(SELECT 1 FROM rpps_sc WHERE cod_ibge=$1) tem_rpps, EXISTS(SELECT 1 FROM rpps_atuarial_sc WHERE cod_ibge=$1) tem_draa`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT (EXISTS(SELECT 1 FROM financas_sc WHERE cod_ibge=$1) AND NOT EXISTS(SELECT 1 FROM rreo_const_sc WHERE cod_ibge=$1) AND NOT EXISTS(SELECT 1 FROM rgf_sc WHERE cod_ibge=$1)) sem_rreo`, [cod]).catch(() => []),
  ]);
  const A: Alerta[] = [];
  // CRP previdenciário
  const c0 = crp[0];
  if (c0 && (/VENC/i.test(String(c0.tp_crp || "")) || (c0.dt_validade && new Date(String(c0.dt_validade)) < new Date()))) {
    A.push({ sev: "critico", area: "Previdência", titulo: "CRP previdenciário vencido", detalhe: `Situação: ${c0.ds_situacao || c0.tp_crp}. Sem CRP regular, o ente fica bloqueado de transferências voluntárias e contratos com a União.`, acao: "Regularizar o RPPS junto à SPREV/Min. da Previdência para reemitir o CRP." });
  }
  // RPPS sem DRAA (estudo atuarial) no CADPREV — obrigatório e condição do CRP
  if (draa[0]?.tem_rpps && !draa[0]?.tem_draa) {
    A.push({ sev: "alto", area: "Previdência", titulo: "RPPS sem estudo atuarial (DRAA) no CADPREV", detalhe: "O ente tem RPPS mas não há DRAA (avaliação atuarial) enviado ao CADPREV. O DRAA é obrigatório e condição para o CRP — sua ausência arrisca a regularidade previdenciária e o recebimento de transferências voluntárias.", acao: "Elaborar e enviar o DRAA ao CADPREV/SPREV (avaliação atuarial anual do RPPS)." });
  }
  // Município não publica RREO/RGF no SICONFI (só a DCA) — obrigatórios pela LRF + cega o acompanhamento
  if (semrreo[0]?.sem_rreo) {
    A.push({ sev: "medio", area: "Fiscal", titulo: "Município não publica RREO/RGF no SICONFI", detalhe: "O ente publica a DCA anual, mas não há RREO (bimestral) nem RGF (quadrimestral) no SICONFI — ambos obrigatórios pela LRF (arts. 52–55). A ausência é ponto de transparência e deixa o acompanhamento orçamentário e o controle de pessoal/LRF sem base atualizada.", acao: "Publicar o RREO e o RGF no SICONFI dentro dos prazos legais (Siconfi/Tesouro Nacional)." });
  }
  // CAUC
  const cv = num(cauc[0]?.venc);
  if (cv > 0) A.push({ sev: "critico", area: "Fiscal", titulo: `${cv} requisito(s) pendente(s) no CAUC`, detalhe: "Pendências no CAUC bloqueiam a celebração de convênios e o recebimento de transferências voluntárias.", acao: "Regularizar os itens pendentes no extrato do CAUC (Tesouro) para destravar repasses." });
  // Convênios inadimplentes / prestação de contas rejeitada
  const cvn = num(conv[0]?.n), cvv = num(conv[0]?.v);
  if (cvn > 0) A.push({ sev: "critico", area: "Captação", titulo: `${cvn} convênio(s) inadimplente(s)/com prestação rejeitada`, detalhe: `Valor envolvido: ${cvv >= 1e6 ? `R$ ${(cvv / 1e6).toFixed(1)} mi` : `R$ ${cvv.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}. A inadimplência em convênio inscreve o ente no CAUC e bloqueia novas transferências voluntárias da União.`, acao: "Regularizar a prestação de contas ou o débito do convênio junto ao órgão concedente/Transferegov." });
  // Assistência: gap BF + déficit CRAS
  const a0 = assist[0];
  if (a0) {
    const gap = num(a0.gap);
    if (gap > 0) A.push({ sev: "alto", area: "Assistência", titulo: `${gap.toLocaleString("pt-BR")} famílias pobres fora do Bolsa Família`, detalhe: "Famílias em pobreza no CadÚnico que ainda não recebem o benefício — renda federal na mesa, sem custo próprio.", acao: "Busca ativa dessas famílias para inclusão no Bolsa Família." });
    const hpc = a0.hab_por_cras != null ? num(a0.hab_por_cras) : null;
    if (num(a0.cras) === 0 || (hpc != null && hpc > 20000)) A.push({ sev: "medio", area: "Assistência", titulo: "Cobertura de CRAS abaixo da referência", detalhe: `Referência NOB-SUAS: 1 CRAS por 20 mil habitantes.${hpc != null ? ` Hoje: 1 para ${Math.round(hpc).toLocaleString("pt-BR")} hab.` : ""}`, acao: "Ampliar a rede de CRAS ou pactuar regionalmente para destravar cofinanciamento." });
  }
  // Condicionalidade de saúde do PBF
  const csMin = cs[0]?.minha != null ? num(cs[0].minha) : null, csMed = num(cs[0]?.mediana);
  if (csMin != null && csMed > 0 && csMin < csMed) A.push({ sev: "medio", area: "Assistência", titulo: `Acompanhamento de saúde do Bolsa Família baixo (${(csMin * 100).toFixed(0)}%)`, detalhe: `Abaixo da mediana de SC (${(csMed * 100).toFixed(0)}%). Cobertura baixa da condicionalidade arrisca o bloqueio do benefício das famílias.`, acao: "Reforçar a busca ativa de saúde (vacinação, pré-natal, acompanhamento infantil)." });
  // Red flags de fornecedores
  const rc = num(rf[0]?.crit);
  if (rc > 0) A.push({ sev: "alto", area: "Compras", titulo: `${rc} fornecedor(es) com concentração + sanção`, detalhe: "Fornecedores que concentram >25% das compras E têm sanção vigente — combinação que merece verificação.", acao: "Revisar a regularidade e a competitividade desses contratos (decisão discricionária do órgão)." });
  const ordem = { critico: 0, alto: 1, medio: 2 };
  return A.sort((x, y) => ordem[x.sev] - ordem[y.sev]);
}

// Catálogo UNIFICADO de programas federais: curados (descrição rica) + Transferegov (fundoafundo + gestão ágil), classificados por área.
export type CatalogoItem = ProgramaFederal & { curado: boolean; modalidade: string };
function classificaAreaPrograma(txt: string): string {
  const s = txt.toUpperCase();
  if (/CULTURA|ALDIR|PAULO GUSTAVO|MINC|PATRIMON|MUSEU|BIBLIOTEC/.test(s)) return "cultura";
  if (/SEGURAN|SENASP|PENITENC|\bFNSP\b|PRISION|GUARDA MUNICIPAL/.test(s)) return "seguranca";
  if (/SA[ÚU]DE|\bSUS\b|\bFNS\b|FARM[ÁA]C|SAMU|HOSPITAL|UPA|UBS/.test(s)) return "saude";
  if (/EDUCA|FNDE|ESCOLA|CRECHE|ENSINO/.test(s)) return "educacao";
  if (/HABITA|MORADIA|MINHA CASA/.test(s)) return "habitacao";
  if (/ASSIST|SUAS|\bCRAS\b|SOCIAL|FOME|ALIMENTA|CADUNICO|CRIAN[ÇC]A|IDOSO/.test(s)) return "assistencia";
  if (/AGRICUL|RURAL|PESCA|ABASTECIMENTO|PRODUTOR/.test(s)) return "agricultura";
  if (/ESPORTE|DESPORTO/.test(s)) return "esporte";
  if (/CIDADES|MOBILIDAD|PAVIMENTA|SANEAMENTO|URBAN|INFRAESTRUT|DRENAGEM|ESTRADA|PONTE|TRANSPORTE/.test(s)) return "infraestrutura";
  return "outros";
}
export async function getCatalogoProgramasSC(): Promise<CatalogoItem[]> {
  const [curados, tg] = await Promise.all([
    query<Record<string, unknown>>(`SELECT id, area, nome, objeto, orgao, fonte, link, elegibilidade, janela FROM programas_federais_sc`).catch(() => []),
    query<Record<string, unknown>>(`SELECT id_programa, nome, orgao, modalidade, objetivo, dt_fim_vol FROM programas_transferegov WHERE nome IS NOT NULL ORDER BY nome`).catch(() => []),
  ]);
  const cur: CatalogoItem[] = curados.map((r) => ({ id: String(r.id), area: String(r.area || ""), nome: String(r.nome || ""), objeto: String(r.objeto || ""), orgao: String(r.orgao || ""), fonte: String(r.fonte || ""), link: String(r.link || ""), elegibilidade: String(r.elegibilidade || ""), janela: String(r.janela || ""), curado: true, modalidade: "Curado" }));
  const modLbl = (m: string) => (/AGIL/i.test(m) ? "fundo a fundo (gestão ágil)" : /FUNDO/i.test(m) ? "fundo a fundo" : m || "Transferegov");
  const tgItems: CatalogoItem[] = tg.map((r) => {
    const nome = String(r.nome || ""), orgao = String(r.orgao || "");
    const fim = r.dt_fim_vol ? new Date(String(r.dt_fim_vol)) : null;
    const aberto = fim && fim >= new Date();
    return { id: "tg-" + String(r.id_programa), area: classificaAreaPrograma(nome + " " + orgao), nome, objeto: String(r.objetivo || ""), orgao: orgao || "Transferegov", fonte: "Transferegov · " + modLbl(String(r.modalidade || "")), link: "https://www.gov.br/transferegov/pt-br", elegibilidade: "", janela: aberto ? `Janela voluntária aberta até ${fim!.toLocaleDateString("pt-BR")}` : "Consultar janela no Transferegov", curado: false, modalidade: String(r.modalidade || "") };
  });
  return [...cur, ...tgItems].sort((a, b) => (a.curado === b.curado ? a.nome.localeCompare(b.nome) : a.curado ? -1 : 1));
}

// Indícios de sobrepreço em MEDICAMENTOS vs o teto legal CMED/PMVG (a verificar; casado por substância+dosagem).
export type SobreprecoMedItem = { descricao: string; dose: string; paga: number; teto: number; excessoPct: number; quantidade: number; economia: number; nPmvg: number };
export type SobreprecoMedicamentosSC = { n: number; economiaTotal: number; itens: SobreprecoMedItem[] } | null;
export async function getSobreprecoMedicamentosSC(cod: string): Promise<SobreprecoMedicamentosSC> {
  const [itens, tot] = await Promise.all([
    query<Record<string, unknown>>(`SELECT descricao, dose, paga, teto, excesso_pct, quantidade, economia, n_pmvg FROM sobrepreco_medicamentos_sc WHERE cod_ibge=$1 ORDER BY economia DESC NULLS LAST LIMIT 20`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT count(*) n, coalesce(sum(economia),0) eco FROM sobrepreco_medicamentos_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
  ]);
  if (!itens.length) return null;
  return {
    n: num(tot[0]?.n), economiaTotal: num(tot[0]?.eco),
    itens: itens.map((r) => ({ descricao: String(r.descricao || ""), dose: String(r.dose || ""), paga: num(r.paga), teto: num(r.teto), excessoPct: num(r.excesso_pct), quantidade: num(r.quantidade), economia: num(r.economia), nPmvg: num(r.n_pmvg) })),
  };
}

// AGRICULTURA e AGRICULTURA FAMILIAR (Censo Agropecuário 2017, IBGE) — estabelecimentos + área, familiar vs não-familiar.
export type AgropecuariaSC = {
  estabTotal: number; estabFamiliar: number; estabNaoFamiliar: number; areaTotal: number; areaFamiliar: number; areaNaoFamiliar: number; pctEstabFamiliar: number; pctAreaFamiliar: number; medEstabFamiliarSC: number;
  caf: { fisica: number; rural: number; juridica: number; competencia: string | null } | null;
  car: { total: number; ativos: number } | null;
  pronaf: { anoMax: number; vlTotal: number; vlCusteio: number; vlInvestimento: number; serie: { ano: number; vl: number }[] } | null;
} | null;
export async function getAgropecuariaSC(cod: string): Promise<AgropecuariaSC> {
  const [r, med, caf, car, pronaf] = await Promise.all([
    query<Record<string, unknown>>(`SELECT estab_total, estab_familiar, estab_nao_familiar, area_total_ha, area_familiar_ha, area_nao_familiar_ha FROM agropecuaria_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY estab_familiar/NULLIF(estab_total,0)*100) m FROM agropecuaria_sc WHERE estab_total>0 AND length(cod_ibge)=7`).catch(() => []),
    query<Record<string, unknown>>(`SELECT caf_fisica, caf_rural, caf_juridica, to_char(competencia,'YYYY-MM') comp FROM caf_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT imoveis_total, imoveis_ativos FROM car_sc WHERE cod_ibge=$1`, [cod]).catch(() => []),
    query<Record<string, unknown>>(`SELECT ano, vl_total, vl_custeio, vl_investimento FROM pronaf_sc WHERE cod_ibge=$1 ORDER BY ano`, [cod]).catch(() => []),
  ]);
  if (!r.length || num(r[0].estab_total) === 0) return null;
  const x = r[0]; const et = num(x.estab_total), ef = num(x.estab_familiar), at = num(x.area_total_ha), af = num(x.area_familiar_ha);
  const pr = pronaf.length ? pronaf[pronaf.length - 1] : null;
  return {
    estabTotal: et, estabFamiliar: ef, estabNaoFamiliar: num(x.estab_nao_familiar),
    areaTotal: at, areaFamiliar: af, areaNaoFamiliar: num(x.area_nao_familiar_ha),
    pctEstabFamiliar: et > 0 ? Math.round((ef / et) * 1000) / 10 : 0, pctAreaFamiliar: at > 0 ? Math.round((af / at) * 1000) / 10 : 0,
    medEstabFamiliarSC: Math.round(num(med[0]?.m) * 10) / 10,
    caf: caf.length ? { fisica: num(caf[0].caf_fisica), rural: num(caf[0].caf_rural), juridica: num(caf[0].caf_juridica), competencia: (caf[0].comp as string) || null } : null,
    car: car.length ? { total: num(car[0].imoveis_total), ativos: num(car[0].imoveis_ativos) } : null,
    pronaf: pr ? { anoMax: num(pr.ano), vlTotal: num(pr.vl_total), vlCusteio: num(pr.vl_custeio), vlInvestimento: num(pr.vl_investimento), serie: pronaf.map((p) => ({ ano: num(p.ano), vl: num(p.vl_total) })) } : null,
  };
}
