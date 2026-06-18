import "server-only";
import { query } from "./db";
import { fetchComprasPNCP } from "./pncp";

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
export type FuncaoSC = { nome: string; dotacao: number; empenhado: number };
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
): Promise<{ ente: EnteSC; serie: FinancaSCAno[]; funcoesLatest: FuncaoSC[] } | null> {
  const er = await query<Record<string, unknown>>(`SELECT cod_ibge, nome, tipo, populacao FROM entes_sc WHERE cod_ibge = $1`, [cod]);
  if (!er.length) return null;
  const ente: EnteSC = { cod_ibge: String(er[0].cod_ibge), nome: String(er[0].nome), tipo: er[0].tipo as "M" | "E", populacao: num(er[0].populacao) };
  const rows = await query<Record<string, unknown>>(`SELECT * FROM financas_sc WHERE cod_ibge = $1 ORDER BY ano`, [cod]);
  const serie: FinancaSCAno[] = rows.map((r) => ({
    ano: num(r.ano), receita: num(r.receita), receita_prevista: num(r.receita_prevista), tributaria: num(r.tributaria),
    transferencias: num(r.transferencias), outras: num(r.outras), despesa: num(r.despesa), resultado: num(r.resultado),
    pessoal: num(r.pessoal), custeio: num(r.custeio), investimento: num(r.investimento), divida: num(r.divida),
    saude: num(r.saude), educacao: num(r.educacao), seguranca: num(r.seguranca), assistencia: num(r.assistencia),
    infraestrutura: num(r.infraestrutura), administracao: num(r.administracao),
  }));
  const last = rows[rows.length - 1];
  const funcoesLatest = last && Array.isArray(last.funcoes) ? (last.funcoes as FuncaoSC[]) : [];
  return { ente, serie, funcoesLatest };
}

export type ComprasSC = {
  n_contratos: number; valor_estimado: number; valor_homologado: number;
  economia_pct: number; dispensa_pct: number;
  por_modalidade: { modalidade: string; n: number; valor: number }[];
  top: { objeto: string; modalidade: string; orgao: string; estimado: number; homologado: number; economia_pct: number | null; data: string }[];
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
