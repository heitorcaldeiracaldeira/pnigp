// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ro.mjs — Rondônia.
//
// Rondônia é um caso de UNIVERSO PEQUENO: CERON (Centrais Elétricas de Rondônia) e BERON (Banco do Estado de
// Rondônia) já eram privatizada/em liquidação há décadas (Wikipedia); TELERON foi privatizada em 1998 (sucessora
// é a Oi); ITERON foi extinto em 2000; EMATER-RO é AUTARQUIA (não empresa); CEHOP pertence a Sergipe, não a
// Rondônia (confusão de sigla descartada). Sobra CAERD (Companhia de Águas e Esgotos de Rondônia) como a única
// sociedade de economia mista claramente ativa encontrada nesta rodada.
//
// CAERD: Diretor-Presidente Cleverson Brancalhão da Silva, confirmado em fonte primária (caerd.ro.gov.br/diretoria),
// com a diretoria executiva inteira. Nenhum valor de remuneração publicado encontrado nesta rodada.
//
// PENDÊNCIA: a lista oficial completa de empresas públicas/economia mista de Rondônia está em 2 PDFs
// (rondonia.ro.gov.br/jucer) não abertos nesta rodada — pode haver outras estatais menores não cobertas aqui.
//
// node scripts/ingest_remuneracao_estatais_ro.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "caerd.ro.gov.br/diretoria";

await q(`create table if not exists remuneracao_dirigentes_estatais_ro_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const r = { sigla: "CAERD", nome_empresa: "Companhia de Águas e Esgotos de Rondônia", cargo: "Diretor-Presidente",
  nome: "Cleverson Brancalhão da Silva", valor: null, competencia: null, fonte: FONTE,
  obs: "diretoria executiva completa confirmada (Financeiro: Nestor Borralho Ribeiro Neto; Técnico Operacional: Tiago Fernandes Lima da Silva; Administrativa Comercial: Elisandra Loras de Aragão da Silva); valor de remuneração não encontrado nesta rodada" };
{
  const hash = crypto.createHash("sha256").update(`RO|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ro_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("RO|TODAS|lista_pode_estar_incompleta").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('RO','TODAS','—','lista_pode_estar_incompleta',
     'Lista oficial completa está em 2 PDFs (rondonia.ro.gov.br/jucer/relacao-de-empresas-publicas-e-de-sociedades-de-economia-mista) não abertos nesta rodada; CERON/BERON/TELERON já privatizadas ou em liquidação há décadas, ITERON extinto em 2000, EMATER-RO é autarquia — só CAERD confirmada como estatal ativa',
     $1, $2) on conflict (_hash) do nothing`, [FONTE, hash]);
}

console.log("=== Rondônia ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_ro_individual`)).rows);
await db.end();
