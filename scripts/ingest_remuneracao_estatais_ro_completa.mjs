// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ro_completa.mjs — Rondônia, segunda rodada: abri os 2 PDFs oficiais da JUCER
// (relação de cadastro por natureza jurídica) que a rodada 1 não tinha aberto.
//
// ACHADO: das 7 sociedades de economia mista historicamente registradas em RO, 6 estão explicitamente marcadas
// "EM LIQUIDAÇÃO" no próprio cadastro da JUCER (BERON, CDHUR, CODARI, CAGERO, ENARO, CEPRORD) — só CAERD (já
// coberta) e RONGÁS (Companhia Rondoniense de Gás S.A.) aparecem ATIVAS. RONGÁS era uma estatal que a rodada 1
// não tinha encontrado — lista agora está completa e verificada contra a fonte oficial.
//
// RONGÁS: Maria Auxiliadora de Oliveira Silva aparece como contato/responsável institucional em documentos do
// Diário Oficial de RO até fev/2026, e um documento do TCE-RO de 2016 já a identificava como "Presidente da
// RONGAS". Confiança MENOR que os demais registros — não há confirmação explícita e recente do cargo atual, só
// continuidade como referência institucional ao longo dos anos.
//
// node scripts/ingest_remuneracao_estatais_ro_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const r = { sigla: "RONGÁS", nome_empresa: "Companhia Rondoniense de Gás S.A.", cargo: "Presidente",
  nome: "Maria Auxiliadora de Oliveira Silva", valor: null, competencia: null,
  fonte: "JUCER (cadastro de sociedades de economia mista, empresa ATIVA) + TCE-RO (2016, 'Presidente da RONGAS') + Diário Oficial de RO (fev/2026, ainda como contato institucional)",
  obs: "confiança menor que os demais registros — sem confirmação explícita e recente do cargo atual, só continuidade como referência institucional" };

const hash = crypto.createHash("sha256").update(`RO|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
await q(`insert into remuneracao_dirigentes_estatais_ro_individual
  (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
  [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);

await q(`update estatais_pendencias set detalhe = 'Lista oficial JUCER obtida e conferida: 6 das 7 estatais historicas de RO estão EM LIQUIDAÇÃO (BERON, CDHUR, CODARI, CAGERO, ENARO, CEPRORD); RONGÁS confirmada ATIVA e adicionada ao banco; CAERD já estava coberta. Lista agora completa e verificada.' where uf='RO'`);

console.log("=== Rondônia — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome from remuneracao_dirigentes_estatais_ro_individual`)).rows);
await db.end();
