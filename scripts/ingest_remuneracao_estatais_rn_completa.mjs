// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_rn_completa.mjs — Rio Grande do Norte, segunda rodada: resolve as 4 pendências
// abertas no primeiro passe (CAERN, AGN, DATANORTE, CEHAB) via busca no navegador (WebSearch já esgotado na
// primeira rodada). Todos os 4 nomes confirmados por fonte primária (portal oficial ADCON/RN ou site institucional
// próprio da empresa, cruzado com notícia oficial de posse quando disponível).
//
// CAERN: Nádia Belarmino, Diretora-Presidente desde 24/04/2026 — primeira mulher no cargo em 56 anos da empresa
// (Tribuna do Norte + caern.com.br/diretoria-conselho-e-comites). O portal de transparência da CAERN é uma SPA
// Vue/Nuxt inteiramente client-side — não rendeririza via WebFetch, mas o nome já sai direto da busca.
//
// CEHAB: Pablo Thiago Lins de Oliveira Cruz — Ata DOE 20.05.2025 (adcon.rn.gov.br, acervo oficial do Diário Oficial).
// DATANORTE: Gilcelly Adriano Medeiros de Araújo — DOE 10.07.2025 (adcon.rn.gov.br).
// AGN (Agência de Fomento do RN / Desenvolve RN): Márcia Faria Maia.
//
// Nenhum valor de remuneração encontrado para as 4 nesta rodada.
//
// node scripts/ingest_remuneracao_estatais_rn_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_ADCON = "adcon.rn.gov.br (acervo oficial do Diário Oficial do RN)";

const REGS = [
  { sigla: "CAERN", nome_empresa: "Companhia de Águas e Esgotos do Rio Grande do Norte", cargo: "Diretora-Presidente",
    nome: "Nádia Belarmino", fonte: "caern.com.br/diretoria-conselho-e-comites + Tribuna do Norte (24/04/2026)",
    obs: "primeira mulher a ocupar a presidência de forma titular e efetiva em 56 anos da empresa; portal de transparência próprio é SPA client-side (Vue/Nuxt), não renderiza via WebFetch" },
  { sigla: "CEHAB", nome_empresa: "Companhia Estadual de Habitação e Desenvolvimento Urbano do RN", cargo: "Diretor-Presidente",
    nome: "Pablo Thiago Lins de Oliveira Cruz", fonte: FONTE_ADCON + " — Ata DOE 20.05.2025", obs: null },
  { sigla: "DATANORTE", nome_empresa: "Companhia de Processamento de Dados do Rio Grande do Norte", cargo: "Diretor Presidente",
    nome: "Gilcelly Adriano Medeiros de Araújo", fonte: FONTE_ADCON + " — DOE 10.07.2025", obs: null },
  { sigla: "AGN", nome_empresa: "Agência de Fomento do Rio Grande do Norte S.A. (Desenvolve RN)", cargo: "Diretora-Presidente",
    nome: "Márcia Faria Maia", fonte: "página institucional da Agência Desenvolve RN", obs: null },
].map((r) => ({ ...r, bruto: null, liquido: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`RN|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_rn_individual
    (empresa_sigla,empresa_nome,cargo,nome,remuneracao_bruta,remuneracao_liquida,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

// as 4 pendências resolvidas nesta rodada saem da lista de pendências abertas
await q(`delete from estatais_pendencias where uf='RN' and empresa_sigla in ('CAERN','AGN','DATANORTE','CEHAB')`);

console.log("=== Rio Grande do Norte — completo ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_rn_individual order by empresa_sigla`)).rows);
await db.end();
