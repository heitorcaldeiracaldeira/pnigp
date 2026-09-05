// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pb.mjs — Paraíba: TODO O DOMÍNIO .pb.gov.br estava inacessível nesta rodada
// (confirmado por timeout em curl E em WebFetch — ECONNREFUSED — em paraiba.pb.gov.br, jucep.pb.gov.br,
// auniao.pb.gov.br, transparencia.pb.gov.br, dados.pb.gov.br: é uma indisponibilidade real do lado da fonte,
// não um bloqueio específico deste ambiente). O portal central de folha (transparencia.pb.gov.br/pessoal) não
// pôde nem ser verificado quanto a cobrir ou não as estatais.
//
// Como só o domínio .pb.gov.br caiu, cagepa.pb.gov.br respondeu (WebFetch) mas os documentos de remuneração
// ficam em pastas do Google Drive (não navegáveis por scraping) — e pbgas.com.br (domínio PRÓPRIO, fora do
// .gov.br) respondeu normalmente, mas o "Relatório de Administração 2025" publicado é uma reprodução ESCANEADA
// do jornal oficial (A União) — texto extraído do PDF é só cabeçalho/rodapé, o conteúdo financeiro está em
// imagem, exigiria OCR (não tentado nesta rodada).
//
// 4 estatais confirmadas: CAGEPA (água/esgoto), CINEP (desenvolvimento industrial), PBGÁS (75,5% Estado / 24,5%
// Mitsui Gás e Energia do Brasil), EMPASA (abastecimento agrícola). Nome do dirigente atual confirmado para as
// 4 via fonte relativamente forte (site institucional ou posse recente noticiada oficialmente) — NENHUM valor
// de remuneração obtido nesta rodada, por indisponibilidade genuína da fonte, não por falta de busca.
//
// node scripts/ingest_remuneracao_estatais_pb.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_pb_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric, competencia text,
  fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const NOME_SEM_VALOR = [
  { sigla: "CAGEPA", nome_empresa: "Companhia de Água e Esgotos da Paraíba", cargo: "Diretor Presidente",
    nome: "Marcus Vinícius Fernandes Neves",
    fonte: "cagepa.pb.gov.br/institucional/perfil-da-diretoria (2ª gestão do dirigente, 1ª foi 2015-2017)",
    obs: "Documentos de remuneração (Relatório de Administração e Sustentabilidade, Demonstrativos Contábeis) hospedados em pastas do Google Drive linkadas pelo próprio site — não navegáveis por scraping nesta rodada" },
  { sigla: "CINEP", nome_empresa: "Companhia de Desenvolvimento da Paraíba", cargo: "Diretor Presidente",
    nome: "Rômulo Soares Polari Filho", fonte: "cinep.pb.gov.br (posse noticiada pelo próprio site institucional, no cargo desde 2019)",
    obs: "transparencia.pb.gov.br (portal central) e demais páginas de remuneração sob .pb.gov.br inacessíveis nesta rodada (outage confirmado do domínio)" },
  { sigla: "PBGÁS", nome_empresa: "Companhia Paraibana de Gás", cargo: "Diretor Presidente",
    nome: "Jailson José Galvão", fonte: "pbgas.com.br/institucional + pbgas.com.br/portal-da-transparencia (relatório de administração 2025)",
    obs: "Relatório de Administração 2025 (pbgas.com.br/wp-content/uploads/2026/07/...) é reprodução ESCANEADA do jornal oficial A União — conteúdo financeiro em imagem, sem camada de texto extraível; exigiria OCR, não tentado nesta rodada" },
  { sigla: "EMPASA", nome_empresa: "Empresa Paraibana de Abastecimento e Serviços Agrícolas", cargo: "Presidente",
    nome: "Fábio Andrade Medeiros", fonte: "notícia institucional do governo do Estado (posse em 17/02/2025)",
    obs: "Não localizado portal de transparência próprio da EMPASA nem página com remuneração; transparencia.pb.gov.br inacessível nesta rodada" },
];

for (const r of NOME_SEM_VALOR) {
  const hash = crypto.createHash("sha256").update(`PB|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pb_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,null,null,$5,$6,$7) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("PB|dominio_pb_gov_br|outage").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('PB','TODAS','Companhia de Água e Esgotos da Paraíba / Companhia de Desenvolvimento da Paraíba / Companhia Paraibana de Gás / Empresa Paraibana de Abastecimento e Serviços Agrícolas',
     'dominio_fonte_indisponivel',
     'Todo o domínio .pb.gov.br (incluindo transparencia.pb.gov.br, dados.pb.gov.br, paraiba.pb.gov.br, jucep.pb.gov.br, auniao.pb.gov.br) esteve inacessível nesta rodada (timeout em curl e ECONNREFUSED em WebFetch) — não foi possível confirmar se o portal central de folha cobre as estatais, nem baixar documentos de remuneração hospedados sob esse domínio. Nomes dos 4 dirigentes atuais confirmados por fontes alternativas (sites institucionais próprios fora do .gov.br ou notícias oficiais).',
     'tentativas diretas em transparencia.pb.gov.br, dados.pb.gov.br (04/09/2026)', $1) on conflict (_hash) do nothing`, [hash]);
}

console.log("=== Paraíba — nome sem valor (outage da fonte) ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_pb_individual`)).rows);
console.log("=== Paraíba — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='PB'`)).rows);
await db.end();
