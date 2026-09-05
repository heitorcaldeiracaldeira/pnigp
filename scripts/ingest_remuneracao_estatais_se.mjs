// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_se.mjs — Sergipe: 4 sociedades de economia mista (BANESE, DESO, CODISE, EMSETUR).
//
// BANESE é companhia aberta (B3) — mesmo pipeline CVM das demais. Diretor Presidente/Superintendente: Marco
// Antonio Queiroz (desde 10/03/2023), achado no arquivo de administradores da CVM.
//
// DESO: nome achado tinha 3 candidatos concorrentes na busca — "Carlos Melo" descartado por ser gestão ANTIGA
// (2015/2019, confirmado por notícia própria); "Paulo Henrique Machado Sobral" é na verdade Diretor-Presidente da
// CODERSE (outra entidade, assinou o mesmo documento ao lado da DESO) — não é da DESO. Prevaleceu Luciano Góis
// Paul, confirmado em documento oficial da PRÓPRIA DESO (contrato administrativo nº 044/2026, 11/06/2026,
// "por seu Diretor-Presidente Luciano Gois Paul").
//
// CODISE e EMSETUR confirmados via páginas oficiais do governo de Sergipe (sedetec.se.gov.br e
// se.gov.br/identificacao_dos_dirigentes).
//
// Nenhum valor de remuneração individualizado encontrado para DESO/CODISE/EMSETUR nesta rodada.
//
// node scripts/ingest_remuneracao_estatais_se.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_CVM = "dados.cvm.gov.br/dataset/cia_aberta-doc-fre (fre_cia_aberta_2026.zip)";
const EXERCICIO = "2025-01-01 a 2025-12-31";

await q(`create table if not exists remuneracao_dirigentes_estatais_estaduais (
  uf text, empresa_sigla text, empresa_nome text, orgao_administracao text, numero_membros numeric,
  numero_membros_remunerados numeric, valor_maximo_anual numeric, valor_minimo_anual numeric,
  valor_medio_anual numeric, ceo_nome text, ceo_cargo text, exercicio_referencia text, granularidade text,
  fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CVM_REGS = [
  { uf: "SE", sigla: "BANESE", nome_empresa: "Banco do Estado de Sergipe S.A.", orgao: "Conselho de Administração",
    numero_membros: 8, numero_membros_remunerados: 8, valor_maximo_anual: 131563.81, valor_minimo_anual: 131563.81,
    valor_medio_anual: 131563.81, ceo_nome: null, ceo_cargo: null },
  { uf: "SE", sigla: "BANESE", nome_empresa: "Banco do Estado de Sergipe S.A.", orgao: "Diretoria Estatutária",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: 1126389.82, valor_minimo_anual: 841840.33,
    valor_medio_anual: 937308.16, ceo_nome: "Marco Antonio Queiroz", ceo_cargo: "Diretor Presidente / Superintendente (desde 10/03/2023)" },
  { uf: "SE", sigla: "BANESE", nome_empresa: "Banco do Estado de Sergipe S.A.", orgao: "Conselho Fiscal",
    numero_membros: 4, numero_membros_remunerados: 4, valor_maximo_anual: 54775.92, valor_minimo_anual: 54775.92,
    valor_medio_anual: 54775.92, ceo_nome: null, ceo_cargo: null },
];

for (const r of CVM_REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${EXERCICIO}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'agregado_cvm_por_orgao',$13,$14)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo, EXERCICIO, FONTE_CVM, hash]);
}

await q(`create table if not exists remuneracao_dirigentes_estatais_se_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const INDIVIDUAL = [
  { sigla: "DESO", nome_empresa: "Companhia de Saneamento de Sergipe", cargo: "Diretor-Presidente",
    nome: "Luciano Góis Paul", fonte: "transparencia.deso-se.com.br — contrato administrativo nº 044/2026 (11/06/2026)",
    obs: "nomes concorrentes descartados: Carlos Melo (gestão antiga, 2015/2019) e Paulo Henrique Machado Sobral (na verdade é da CODERSE, não da DESO)" },
  { sigla: "CODISE", nome_empresa: "Companhia de Desenvolvimento Econômico de Sergipe", cargo: "Diretor-Presidente",
    nome: "Ronaldo Botelho Guimarães", fonte: "sedetec.se.gov.br (05/02/2026)", obs: null },
  { sigla: "EMSETUR", nome_empresa: "Empresa Sergipana de Turismo", cargo: "Diretor Presidente",
    nome: "Mauricio Carvalho Gomes", fonte: "se.gov.br/identificacao_dos_dirigentes (10/04/2026)", obs: null },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of INDIVIDUAL) {
  const hash = crypto.createHash("sha256").update(`SE|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_se_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

console.log("=== Sergipe — CVM (BANESE) ===");
console.table((await q(`select empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal from remuneracao_dirigentes_estatais_estaduais where uf='SE' order by orgao_administracao`)).rows);
console.log("=== Sergipe — individual ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_se_individual order by empresa_sigla`)).rows);
await db.end();
