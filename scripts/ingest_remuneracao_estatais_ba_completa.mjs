// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ba_completa.mjs — Bahia, segunda rodada: fecha a lacuna das DUAS MAIORES estatais do
// estado (DESENBAHIA e EMBASA), que na rodada 1 estavam totalmente ausentes ("fora_do_cadastro").
//
// DESENBAHIA (Agência de Fomento do Estado da Bahia): Paulo de Oliveira Costa, Presidente — confirmado em fonte
// primária (desenbahia.ba.gov.br/sobre/estrutura-organizacional).
// EMBASA (Empresa Baiana de Águas e Saneamento): Gildeone Almeida Santos, Presidente desde dez/2024 (aprovado
// pelo CONSAD, Conselho de Administração) — confirmado em fonte primária (embasa.ba.gov.br/presidente-...).
//
// Nenhum valor de remuneração encontrado para nenhuma das duas nesta rodada — ambas têm páginas de "Transparência
// Salarial"/"Relação de Empregados" próprias mas não abertas com sucesso nesta rodada; ficam pendentes de nova
// tentativa, não como ausência de fonte.
//
// CERB e Bahiapesca continuam com nome confirmado e valor NÃO decodificado (formato comprimido do Power BI, DSR) —
// mantidos como pendência, decisão de não adivinhar o valor permanece.
//
// node scripts/ingest_remuneracao_estatais_ba_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "DESENBAHIA", nome_empresa: "Agência de Fomento do Estado da Bahia S.A.", cargo: "Presidente",
    nome: "Paulo de Oliveira Costa", fonte: "desenbahia.ba.gov.br/sobre/estrutura-organizacional",
    obs: "empresa tem página própria de Transparência Salarial (desenbahia.ba.gov.br/transparencia-salarial), não aberta com sucesso nesta rodada — valor pendente" },
  { sigla: "EMBASA", nome_empresa: "Empresa Baiana de Águas e Saneamento S.A.", cargo: "Presidente",
    nome: "Gildeone Almeida Santos", fonte: "embasa.ba.gov.br/presidente-gildeone-almeida-santos",
    obs: "no cargo desde dez/2024 (aprovado pelo CONSAD); empresa publica 'Relação de Empregados' mensal própria, URL exata não localizada nesta rodada — valor pendente" },
].map((r) => ({ ...r, proventos: null, descontos: null, liquido: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`BA|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ba_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.proventos, r.descontos, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

await q(`delete from estatais_pendencias where uf='BA' and empresa_sigla = 'DESENBAHIA/EMBASA'`);
await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
  ('BA','DESENBAHIA','Agência de Fomento do Estado da Bahia S.A.','valor_nao_publicado','Nome confirmado; página de Transparência Salarial própria não aberta com sucesso nesta rodada',$1,$2)
  on conflict (_hash) do nothing`, ["desenbahia.ba.gov.br/transparencia-salarial", crypto.createHash("sha256").update("BA|DESENBAHIA|valor_nao_publicado").digest("hex")]);
await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
  ('BA','EMBASA','Empresa Baiana de Águas e Saneamento S.A.','valor_nao_publicado','Nome confirmado; página de Relação de Empregados mensal própria não localizada com sucesso nesta rodada',$1,$2)
  on conflict (_hash) do nothing`, ["embasa.ba.gov.br", crypto.createHash("sha256").update("BA|EMBASA|valor_nao_publicado").digest("hex")]);

console.log("=== Bahia — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_ba_individual order by empresa_sigla`)).rows);
console.log("=== Bahia — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='BA'`)).rows);
await db.end();
