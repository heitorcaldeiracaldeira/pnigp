// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_mg_rs.mjs — remuneração dos dirigentes das estatais de MG e RS.
//
// POR QUÊ é diferente de SP/RJ: nem MG nem RS têm um portal estadual único cobrindo a folha das estatais (SP e RJ
// têm; MG tem até uma Portaria — nº 233/2012, art. 6º — dizendo EXPLICITAMENTE que empresa pública e sociedade de
// economia mista "devem publicar a remuneração de servidores", mas "a publicação no Portal da Transparência não é
// necessária" — conferido direto na API do portal de MG: os 77 órgãos nela NÃO incluem CEMIG, CODEMIG, MGS, BDMG.
// RS não tem nem essa portaria — simplesmente não achei nenhum portal consolidado.
//
// A ÚNICA fonte comum às duas: CEMIG (MG) e Banrisul (RS) são companhias abertas na B3, então publicam a
// remuneração de administradores no Formulário de Referência (CVM) — mas em formato AGREGADO POR ÓRGÃO (Conselho
// de Administração / Diretoria Estatutária / Conselho Fiscal), com valor máximo/mínimo/médio ANUAL, não por nome
// nem por mês (é assim que a CVM permite: art. 12 da Resolução CVM 80/22 dispensa a divulgação individualizada por
// administrador). Fonte: dataset nacional da CVM (dados.cvm.gov.br/dataset/cia_aberta-doc-fre), arquivo
// fre_cia_aberta_2026.zip — cobre TODAS as companhias abertas do Brasil, não só essas duas.
//
// O nome do atual Diretor-Presidente vem do MESMO pacote CVM (arquivo administrador_membro_conselho_fiscal), que
// lista quem ocupa cada cargo — mas não there o valor individual, só a órgão-agregada acima.
//
// BDMG, CODEMIG, MGS (MG) e Badesul, CADIP (RS) NÃO são companhias abertas — não têm Formulário de Referência.
// Não achei fonte de remuneração individualizada ou agregada para elas nesta rodada; ficaram de fora.
//
// node scripts/ingest_remuneracao_estatais_mg_rs.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "dados.cvm.gov.br/dataset/cia_aberta-doc-fre (fre_cia_aberta_2026.zip)";
const EXERCICIO = "2025-01-01 a 2025-12-31";

const REGS = [
  // CEMIG — Companhia Energética de Minas Gerais (17.155.730/0001-64)
  { uf: "MG", sigla: "CEMIG", nome_empresa: "Companhia Energética de Minas Gerais", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 9, valor_maximo_anual: 387631.56, valor_minimo_anual: 298747.08,
    valor_medio_anual: 343189.32, ceo_nome: null, ceo_cargo: null },
  { uf: "MG", sigla: "CEMIG", nome_empresa: "Companhia Energética de Minas Gerais", orgao: "Diretoria Estatutária",
    numero_membros: 7, numero_membros_remunerados: 7, valor_maximo_anual: 1684135.20, valor_minimo_anual: 1074021.96,
    valor_medio_anual: 1379078.58, ceo_nome: "Alexandre Ramos Peixoto", ceo_cargo: "Diretor Presidente / Superintendente" },
  { uf: "MG", sigla: "CEMIG", nome_empresa: "Companhia Energética de Minas Gerais", orgao: "Conselho Fiscal",
    numero_membros: 9, numero_membros_remunerados: 9, valor_maximo_anual: 208673.52, valor_minimo_anual: 166936.20,
    valor_medio_anual: 187804.86, ceo_nome: null, ceo_cargo: null },
  // Banrisul — Banco do Estado do Rio Grande do Sul (92.702.067/0001-96) — só total por órgão, sem max/min
  { uf: "RS", sigla: "Banrisul", nome_empresa: "Banco do Estado do Rio Grande do Sul S.A.", orgao: "Conselho de Administração",
    numero_membros: 11, numero_membros_remunerados: 7, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 1856744.08 / 7, ceo_nome: null, ceo_cargo: null },
  { uf: "RS", sigla: "Banrisul", nome_empresa: "Banco do Estado do Rio Grande do Sul S.A.", orgao: "Diretoria Estatutária",
    numero_membros: 9, numero_membros_remunerados: 8.58, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 14479859.97 / 8.58, ceo_nome: "Fernando Guerreiro de Lemos", ceo_cargo: "Vice-Pres. do C.A. e Diretor Presidente" },
  { uf: "RS", sigla: "Banrisul", nome_empresa: "Banco do Estado do Rio Grande do Sul S.A.", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 1107766.80 / 5, ceo_nome: null, ceo_cargo: null },
];

await q(`create table if not exists remuneracao_dirigentes_estatais_estaduais (
  uf text, empresa_sigla text, empresa_nome text, orgao_administracao text, numero_membros numeric,
  numero_membros_remunerados numeric, valor_maximo_anual numeric, valor_minimo_anual numeric,
  valor_medio_anual numeric, ceo_nome text, ceo_cargo text, exercicio_referencia text, granularidade text,
  fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${EXERCICIO}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'agregado_cvm_por_orgao',$13,$14)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo, EXERCICIO, FONTE, hash]);
}

const { rows } = await q(`select uf, empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal from remuneracao_dirigentes_estatais_estaduais order by uf, empresa_sigla, orgao_administracao`);
console.table(rows);
await db.end();
