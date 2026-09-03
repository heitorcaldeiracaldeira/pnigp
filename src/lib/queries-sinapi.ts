import "server-only";
import { query } from "./db";
// SICRO (DNIT) mora no mesmo arquivo por ser a MESMA função — referência externa de preço para obra — e
// não por serem a mesma fonte. Ver scripts/ingest_sicro_sc.mjs para a origem e a ressalva de competência.

// SINAPI — referência federal de preço para OBRAS E SERVIÇOS DE ENGENHARIA (Caixa + IBGE), consultada pelo
// Banco de Preços ao lado do preço praticado do PNCP, NUNCA misturada com ele: `sinapi_insumos_sc` e
// `sinapi_composicoes_sc` são tabelas próprias, alimentadas por `scripts/ingest_sinapi_sc.mjs`, que não toca
// em nada gerado pela coleta do PNCP. Ver o cabeçalho daquele script para a ressalva de defasagem.
export const SINAPI_COMPETENCIA = "202412"; // dez/2024 — o mais recente que o canal público da Caixa serve hoje (03/set/2026)

export type SinapiComposicao = {
  codigo: number; descricao: string; unidade: string; classe: string; siglaClasse: string;
  tipo1: string; codAgrupador: string | null; descAgrupador: string | null; origemPreco: string; vinculo: string;
  custoNaoDesonerado: number | null; custoDesonerado: number | null;
};
export type SinapiInsumo = {
  codigo: number; descricao: string; unidade: string; origemPreco: string;
  precoNaoDesonerado: number | null; precoDesonerado: number | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

export async function getBuscaSinapi(termo: string): Promise<{ composicoes: SinapiComposicao[]; insumos: SinapiInsumo[] }> {
  const t = String(termo || "").trim();
  if (t.length < 3) return { composicoes: [], insumos: [] };
  // Busca por código exato (número puro) OU por trecho da descrição, com similaridade de trigrama para
  // ordenar — mesmo mecanismo do `app.item_busca`, mas contra um universo bem menor (7.829 composições).
  const porCodigo = /^\d+$/.test(t);
  const composicoes = await query<Record<string, unknown>>(
    porCodigo
      ? `SELECT * FROM sinapi_composicoes_sc WHERE codigo = $1 LIMIT 50`
      : `SELECT *, similarity(descricao, $1) sim FROM sinapi_composicoes_sc
          WHERE descricao ILIKE '%' || $1 || '%' OR descricao % $1
          ORDER BY (descricao ILIKE '%' || $1 || '%') DESC, similarity(descricao, $1) DESC LIMIT 50`,
    [porCodigo ? Number(t) : t],
  ).catch(() => []);
  const insumos = await query<Record<string, unknown>>(
    porCodigo
      ? `SELECT * FROM sinapi_insumos_sc WHERE codigo = $1 LIMIT 30`
      : `SELECT *, similarity(descricao, $1) sim FROM sinapi_insumos_sc
          WHERE descricao ILIKE '%' || $1 || '%'
          ORDER BY similarity(descricao, $1) DESC LIMIT 30`,
    [porCodigo ? Number(t) : t],
  ).catch(() => []);
  return {
    composicoes: composicoes.map((r) => ({
      codigo: num(r.codigo)!, descricao: String(r.descricao || ""), unidade: String(r.unidade || ""),
      classe: String(r.classe || ""), siglaClasse: String(r.sigla_classe || ""), tipo1: String(r.tipo1 || ""),
      codAgrupador: r.cod_agrupador ? String(r.cod_agrupador) : null, descAgrupador: r.desc_agrupador ? String(r.desc_agrupador) : null,
      origemPreco: String(r.origem_preco || ""), vinculo: String(r.vinculo || ""),
      custoNaoDesonerado: num(r.custo_nao_desonerado), custoDesonerado: num(r.custo_desonerado),
    })),
    insumos: insumos.map((r) => ({
      codigo: num(r.codigo)!, descricao: String(r.descricao || ""), unidade: String(r.unidade || ""),
      origemPreco: String(r.origem_preco || ""),
      precoNaoDesonerado: num(r.preco_nao_desonerado), precoDesonerado: num(r.preco_desonerado),
    })),
  };
}

// SICRO — referência do DNIT para OBRAS E SERVIÇOS DE INFRAESTRUTURA DE TRANSPORTES (Lei 14.133, art. 23
// §2º) — o par do SICRO com o SINAPI: SINAPI cobre "as demais obras", SICRO cobre estrada/ferrovia/porto/
// aeroporto. Tabelas próprias (`sicro_*_sc`), alimentadas por `scripts/ingest_sicro_sc.mjs`.
export const SICRO_COMPETENCIA = "202604"; // abril/2026 — mês mais recente publicado pelo DNIT para SC (03/set/2026)

export type SicroComposicao = { codigo: string; descricao: string; unidade: string; custo: number | null };
export type SicroInsumo = {
  codigo: string; descricao: string; tipo: "material" | "mao_de_obra"; unidade: string;
  precoNaoDesonerado: number | null; precoDesonerado: number | null;
};
export type SicroEquipamento = { codigo: string; descricao: string; custoProdutivoHora: number | null; custoImprodutivoHora: number | null };

export async function getBuscaSicro(termo: string): Promise<{ composicoes: SicroComposicao[]; insumos: SicroInsumo[]; equipamentos: SicroEquipamento[] }> {
  const t = String(termo || "").trim();
  if (t.length < 3) return { composicoes: [], insumos: [], equipamentos: [] };
  const porCodigo = /^[A-Za-z]?\d+$/.test(t);
  const composicoes = await query<Record<string, unknown>>(
    porCodigo
      ? `SELECT * FROM sicro_composicoes_sc WHERE codigo = $1 LIMIT 50`
      : `SELECT *, similarity(descricao, $1) sim FROM sicro_composicoes_sc
          WHERE descricao ILIKE '%' || $1 || '%' OR descricao % $1
          ORDER BY (descricao ILIKE '%' || $1 || '%') DESC, similarity(descricao, $1) DESC LIMIT 50`,
    [t],
  ).catch(() => []);
  const insumos = await query<Record<string, unknown>>(
    porCodigo
      ? `SELECT * FROM sicro_insumos_sc WHERE codigo = $1 LIMIT 30`
      : `SELECT * FROM sicro_insumos_sc WHERE descricao ILIKE '%' || $1 || '%' LIMIT 30`,
    [t],
  ).catch(() => []);
  const equipamentos = await query<Record<string, unknown>>(
    porCodigo
      ? `SELECT * FROM sicro_equipamentos_sc WHERE codigo = $1 LIMIT 30`
      : `SELECT * FROM sicro_equipamentos_sc WHERE descricao ILIKE '%' || $1 || '%' LIMIT 30`,
    [t],
  ).catch(() => []);
  return {
    composicoes: composicoes.map((r) => ({ codigo: String(r.codigo), descricao: String(r.descricao || ""), unidade: String(r.unidade || ""), custo: num(r.custo) })),
    insumos: insumos.map((r) => ({
      codigo: String(r.codigo), descricao: String(r.descricao || ""), tipo: r.tipo === "material" ? "material" : "mao_de_obra",
      unidade: String(r.unidade || ""), precoNaoDesonerado: num(r.preco_nao_desonerado), precoDesonerado: num(r.preco_desonerado),
    })),
    equipamentos: equipamentos.map((r) => ({
      codigo: String(r.codigo), descricao: String(r.descricao || ""),
      custoProdutivoHora: num(r.custo_produtivo_hora), custoImprodutivoHora: num(r.custo_improdutivo_hora),
    })),
  };
}
