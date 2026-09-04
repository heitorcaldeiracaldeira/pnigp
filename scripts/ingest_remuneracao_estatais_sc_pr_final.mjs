// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_sc_pr_final.mjs — fecha a lista pedida: EPAGRI, CIDASC, SANTUR (SC) e CEASA-PR,
// Fomento Paraná, Águas Paraná (PR).
//
// SANTUR: EXTINTA — o governo de SC concluiu a extinção da empresa (notícia oficial sef.sc.gov.br). Não é uma
// pendência a resolver, é um estado de fato.
// Águas Paraná: EXTINTA desde 2019 — incorporada pelo IAT (Instituto Água e Terra), confirmado no próprio
// dropdown do portal da transparência do PR ("AGUASPARANA... INCORPORADO PELO IAT - 2019").
//
// CIDASC: achada no dataset de dados abertos de SC (dados.sc.gov.br, "Remuneração de Servidores" — o mesmo que
// documenta cobrir EPAGRI/SANTUR/COHAB/CIDASC) — sigla real no arquivo é "COMPANHIA INTEGRADA DE DESENVOLVIMENTO
// AGRICOLA DE SC". Individualizado por nome, mês 07/2026.
// COHAB-SC: achada de bônus na mesma varredura (não fazia parte do pedido original, mas veio junto).
// EPAGRI: aparece no MESMO dataset, mas o cargo "PRESIDENTE"/"DIRETOR" não existe entre os cargos listados —
// achei o nome do Diretor-Presidente (Dirceu Leite) só no site institucional, sem valor de remuneração
// encontrado em lugar nenhum (nem lá, nem no dataset, nem em disclosure próprio tipo "Anexo V" como CIASC/CEASA).
//
// CEASA-PR: achada no Portal da Transparência do PR (transparencia.pr.gov.br, mesmo padrão do SP — folha
// individualizada por nome/cargo/valor para TODA a administração indireta). Achei 2 diretores (Administrativo-
// Financeiro e Técnico) mas NENHUM "Diretor Presidente" na folha — o próprio Estatuto Social da CEASA-PR diz que
// "o Diretor Presidente, na qualidade de membro do Conselho de Administração, NÃO será remunerado" (achado via
// busca) — não é dado faltando, é a regra da própria empresa.
// Fomento Paraná (AFPR): NÃO está no portal central do PR — tem portal próprio (fomento.pr.gov.br), com XLSX
// mensal individualizado. Diretor-Presidente confirmado: Claudio Stabile.
//
// node scripts/ingest_remuneracao_estatais_sc_pr_final.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

// --- SC individual (mesma tabela do CEASA/CIASC) ---
const SC = [
  { empresa_sigla: "CIDASC", empresa_nome: "Companhia Integrada de Desenvolvimento Agrícola de Santa Catarina",
    cargo: "Presidente", nome: "Celles Regina de Matos", bruto: 24490.25, desconto: null, liquido: null,
    competencia: "2026-07", fonte: "dados.sc.gov.br/dataset/remuneracaoservidores (servidores-ativos-2026-07.csv)" },
  { empresa_sigla: "COHAB-SC", empresa_nome: "Companhia de Habitação do Estado de Santa Catarina",
    cargo: "Diretor Presidente", nome: "Marcos Daniel da Cunha", bruto: 14076.92, desconto: null, liquido: null,
    competencia: "2026-07", fonte: "dados.sc.gov.br/dataset/remuneracaoservidores (servidores-ativos-2026-07.csv) — achado extra, fora do pedido original" },
];

await q(`create table if not exists remuneracao_dirigentes_estatais_pr_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, proventos numeric, descontos numeric,
  liquido numeric, competencia text, fonte text, observacao text, _hash text primary key,
  _coletado_em timestamptz default now()
)`);

for (const r of SC) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_sc_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,desconto,salario_liquido,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.bruto, r.desconto, r.liquido, r.competencia, r.fonte, hash]);
}

// EPAGRI: só o nome, sem valor — registrado como observação, não como remuneração
await q(`create table if not exists dirigentes_sem_remuneracao_encontrada (
  uf text, empresa_sigla text, empresa_nome text, cargo text, nome text, observacao text, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
{
  const hash = crypto.createHash("sha256").update("SC|EPAGRI|Diretor Presidente|Dirceu Leite").digest("hex");
  await q(`insert into dirigentes_sem_remuneracao_encontrada
    (uf,empresa_sigla,empresa_nome,cargo,nome,observacao,fonte,_hash) values
    ('SC','EPAGRI','Empresa de Pesquisa Agropecuária e Extensão Rural de SC','Diretor Presidente','Dirceu Leite',
     'Cargo não aparece na folha de servidores do dataset estadual (dados.sc.gov.br) nem em disclosure próprio tipo Anexo V — nome confirmado só no site institucional',
     'epagri.sc.gov.br/a-epagri/administracao', $1) on conflict (_hash) do nothing`, [hash]);
}

// PR individual — CEASA (2 diretores, sem presidente) + Fomento Paraná (diretor presidente)
const PR = [
  { empresa_sigla: "CEASA-PR", empresa_nome: "Centrais de Abastecimento do Paraná S/A",
    cargo: "Diretor Administrativo Financeiro", nome: "Andrea Domingues Favarim", proventos: 28990.26, descontos: null, liquido: null,
    competencia: "2026 (mais recente disponível)", fonte: "transparencia.pr.gov.br/pte/pessoal/servidores/poderexecutivo/remuneracao", observacao: null },
  { empresa_sigla: "CEASA-PR", empresa_nome: "Centrais de Abastecimento do Paraná S/A",
    cargo: "Diretor Técnico", nome: "Antonio Leonardecz", proventos: 28990.26, descontos: null, liquido: null,
    competencia: "2026 (mais recente disponível)", fonte: "transparencia.pr.gov.br/pte/pessoal/servidores/poderexecutivo/remuneracao", observacao: null },
  { empresa_sigla: "CEASA-PR", empresa_nome: "Centrais de Abastecimento do Paraná S/A",
    cargo: "Diretor Presidente", nome: null, proventos: null, descontos: null, liquido: null,
    competencia: null, fonte: "estatuto social da CEASA-PR (ceasa.pr.gov.br)",
    observacao: "O próprio estatuto diz que o Diretor Presidente, por também ser membro do Conselho de Administração, NÃO É REMUNERADO — não é dado faltando." },
  { empresa_sigla: "AFPR", empresa_nome: "Agência de Fomento do Paraná S/A (Fomento Paraná)",
    cargo: "Diretor Presidente", nome: "Claudio Stabile", proventos: 40639.61, descontos: 14403.01, liquido: 26236.60,
    competencia: "2026-06", fonte: "fomento.pr.gov.br/Pagina/Transparencia/Pessoal (remunera_colaboradores_2026_junho.xlsx)", observacao: null },
];

for (const r of PR) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pr_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.proventos, r.descontos, r.liquido, r.competencia, r.fonte, r.observacao, hash]);
}

// Águas Paraná e SANTUR: registradas como extintas, não como pendência
await q(`create table if not exists estatais_extintas (
  uf text, sigla text, nome text, ano_extincao text, destino text, fonte text, _hash text primary key
)`);
const EXTINTAS = [
  { uf: "SC", sigla: "SANTUR", nome: "Santa Catarina Turismo S.A.", ano: "2026", destino: "extinção concluída pelo governo do estado",
    fonte: "sef.sc.gov.br — Governo de SC conclui extinção da Santur" },
  { uf: "PR", sigla: "Águas Paraná", nome: "Instituto das Águas do Paraná", ano: "2019", destino: "incorporada pelo IAT (Instituto Água e Terra)",
    fonte: "transparencia.pr.gov.br (dropdown de órgãos)" },
];
for (const e of EXTINTAS) {
  const hash = crypto.createHash("sha256").update(`${e.uf}|${e.sigla}`).digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values ($1,$2,$3,$4,$5,$6,$7) on conflict (_hash) do nothing`,
    [e.uf, e.sigla, e.nome, e.ano, e.destino, e.fonte, hash]);
}

console.log("=== SC individual ===");
console.table((await q(`select empresa_sigla, cargo, nome, salario_bruto from remuneracao_dirigentes_estatais_sc_individual where empresa_sigla in ('CIDASC','COHAB-SC')`)).rows);
console.log("=== PR individual ===");
console.table((await q(`select empresa_sigla, cargo, nome, proventos, observacao from remuneracao_dirigentes_estatais_pr_individual`)).rows);
console.log("=== extintas ===");
console.table((await q(`select uf, sigla, ano_extincao, destino from estatais_extintas`)).rows);
console.log("=== sem remuneração encontrada ===");
console.table((await q(`select uf, empresa_sigla, nome, observacao from dirigentes_sem_remuneracao_encontrada`)).rows);
await db.end();
