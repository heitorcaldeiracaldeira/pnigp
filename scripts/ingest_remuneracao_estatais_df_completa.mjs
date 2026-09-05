// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_df_completa.mjs — Distrito Federal, segunda rodada: resolve as 8 pendências abertas
// (CAESB, TERRACAP, CEASA-DF, Codeplan, BIOTIC, Metrô-DF, DF Gestão de Ativos, CEB Participações).
//
// ACHADO DE MÉTODO que destravou a rodada anterior: a função de presidência da CAESB no cadastro central NÃO é
// nenhuma das grafias óbvias testadas antes — é literalmente "- PRESIDENTE" (com hífen e espaço). A forma
// confiável de achar isso é buscar por NOME (usando o dirigente já identificado via Google) em vez de tentar
// adivinhar a grafia da função — bypassa completamente a ambiguidade.
//
// CAESB: Luís Antônio Almeida Reis, achado por nome no cadastro central — bruto R$70.648,24, líquido R$46.455,42
// (07/2026, cargo "DIRETOR GERAL DE EMPRESA E ORGANIZACAO" / função "- PRESIDENTE").
// Metrô-DF: Handerson Cabral Ribeiro, achado por nome — bruto R$16.790,73, líquido R$13.426,01 (07/2026).
//
// TERRACAP: Júlio César de Azevedo Reis, assumiu maio/2026 (substituiu Izídio Santos Jr) — busca por nome no
// cadastro central de julho/2026 não retornou resultado (pode ser lag de atualização pós-nomeação recente).
// CEASA-DF: Bruno Sena Rodrigues — busca por nome não retornou resultado.
// BIOTIC: Gustavo Dias Henrique — busca por nome não retornou resultado.
// Os 3 têm nome confirmado por fonte primária, valor pendente.
//
// CODEPLAN: DESCOBERTA ESTRUTURAL — a antiga Codeplan (sociedade de economia mista/empresa pública) está EM
// LIQUIDAÇÃO desde que seu acervo, atribuições e patrimônio foram transferidos para uma NOVA autarquia em regime
// especial, o IPEDF-Codeplan (Instituto de Pesquisa e Estatística do DF) — mesmo padrão já visto em Águas Paraná
// → IAT. Sai do escopo por natureza jurídica, não por falha de busca. O presidente do IPEDF, Manoel Clementino
// Barros Neto, JÁ ESTAVA no banco desde a rodada 1 (capturado como autarquia, corretamente fora do escopo de
// estatal).
//
// DF GESTÃO DE ATIVOS: confirmada EM LIQUIDAÇÃO/reorganização societária — sem Diretor-Presidente eleito
// atualmente ("até a eleição e posse de novo Diretor Presidente, competirá ao Diretor Administrativo Financeiro",
// segundo ato da Secretaria de Estado de Economia do DF).
//
// CEB PARTICIPAÇÕES: já resolvido na rodada 1 — roster completo sem cargo de presidente no grupo; mantido como
// pendência estrutural (não é falha de busca).
//
// node scripts/ingest_remuneracao_estatais_df_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_PORTAL = "transparencia.df.gov.br/#/servidores/remuneracao (busca por nome, competência 07/2026)";

const CONFIRMADOS = [
  { sigla: "CAESB", nome_empresa: "Companhia de Saneamento Ambiental do Distrito Federal", cargo: "Presidente",
    nome: "Luís Antônio Almeida Reis", bruto: 70648.24, liquido: 46455.42,
    obs: "cargo no cadastro: 'DIRETOR GERAL DE EMPRESA E ORGANIZACAO', função: '- PRESIDENTE' (grafia não-óbvia, achada via busca por nome)" },
  { sigla: "METRÔ-DF", nome_empresa: "Companhia do Metropolitano do Distrito Federal", cargo: "Diretor-Presidente",
    nome: "Handerson Cabral Ribeiro", bruto: 16790.73, liquido: 13426.01,
    obs: "biênio 2024/2026, Diretoria Colegiada (metro.df.gov.br/dircol)" },
  { sigla: "TERRACAP", nome_empresa: "Companhia Imobiliária de Brasília", cargo: "Diretor-Presidente",
    nome: "Júlio César de Azevedo Reis", bruto: null, liquido: null,
    obs: "assumiu maio/2026 (substituiu Izídio Santos Jr, retorno ao cargo que já ocupara em 2016-2018); busca por nome no cadastro de julho/2026 não retornou resultado — possível lag de nomeação recente" },
  { sigla: "CEASA-DF", nome_empresa: "Centrais de Abastecimento do Distrito Federal", cargo: "Presidente",
    nome: "Bruno Sena Rodrigues", bruto: null, liquido: null,
    obs: "fonte: ceasa.df.gov.br/quem-e-quem (16/06/2025); busca por nome no cadastro central não retornou resultado" },
  { sigla: "BIOTIC", nome_empresa: "BIOTIC S.A. (Parque Tecnológico de Brasília)", cargo: "Diretor Presidente",
    nome: "Gustavo Dias Henrique", bruto: null, liquido: null,
    obs: "fonte: bioticsa.com.br/diretoria; busca por nome no cadastro central não retornou resultado" },
].map((r) => ({ ...r, competencia: "2026-07", fonte: FONTE_PORTAL }));

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`DF|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_df_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,salario_liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("DF|CODEPLAN|extinta_virou_ipedf").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('DF','CODEPLAN','Companhia de Planejamento do Distrito Federal',null,
     'Em liquidação — acervo, atribuições e patrimônio transferidos para o IPEDF-Codeplan, uma NOVA autarquia em regime especial (pessoa jurídica de direito público). Mesmo padrão de Águas Paraná → IAT: sai do escopo de estatal por natureza jurídica, não por falha de busca. O presidente do IPEDF (Manoel Clementino Barros Neto) já estava corretamente registrado como autarquia desde a rodada 1.',
     'ipe.df.gov.br/base-juridica (atualizado julho/2026)', $1) on conflict (_hash) do nothing`, [hash]);
}
{
  const hash = crypto.createHash("sha256").update("DF|DF GESTAO DE ATIVOS|em_liquidacao_sem_presidente").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('DF','DF Gestão de Ativos','DF Gestão de Ativos S.A.',null,
     'Em processo de liquidação/reorganização societária — sem Diretor-Presidente eleito atualmente; até nova eleição, funções executivas ficam com o Diretor Administrativo Financeiro/liquidante (ex.: Valter Agapito Teixeira em atos recentes)',
     'Secretaria de Estado de Economia do DF (atos de deliberação)', $1) on conflict (_hash) do nothing`, [hash]);
}

await q(`delete from estatais_pendencias where uf='DF' and empresa_sigla in ('CAESB','TERRACAP','CEASA-DF','CODEPLAN','BIOTIC','METRÔ-DF','DF GESTÃO DE ATIVOS')`);

console.log("=== Distrito Federal — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, salario_bruto, salario_liquido from remuneracao_dirigentes_estatais_df_individual order by empresa_sigla`)).rows);
console.log("=== Distrito Federal — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='DF'`)).rows);
await db.end();
