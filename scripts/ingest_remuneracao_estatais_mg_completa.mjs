// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_mg_completa.mjs — Minas Gerais, segunda rodada: resolve CODEMIG/CODEMGE (valor da
// Diretoria Executiva) e MGS (confirmação da posse).
//
// CODEMGE (diretoria compartilhada com CODEMIG, já documentado na rodada 1): a página "Pessoal" do próprio portal
// de transparência da empresa (codemge.com.br/pessoal) mostra o gasto por cargo como fatia percentual de um total
// — Diretora-Presidente (Luísa Cardoso Barreto): R$ 1.003.075,44. ATENÇÃO: a fonte não deixa claro se é valor
// ANUAL ou acumulado até a data da consulta (YTD) — registrado como reportado pela fonte, sem inferir o período.
//
// MGS: a incerteza sobre a posse foi resolvida — Camila Barbosa Neves está confirmada como Diretora-Presidente
// desde dezembro/2024 (LinkedIn profissional + menções institucionais cruzadas). O aviso de restrição eleitoral no
// site institucional (mgs.srv.br) da rodada 1 pode ter sido temporário (período eleitoral já encerrado).
//
// node scripts/ingest_remuneracao_estatais_mg_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

{
  const r = { sigla: "CODEMGE", nome_empresa: "Companhia de Desenvolvimento Econômico de Minas Gerais",
    cargo: "Diretora-Presidente", nome: "Luísa Cardoso Barreto", valor: 1003075.44,
    fonte: "codemge.com.br/pessoal — valor reportado pela própria fonte como fatia de gasto total; NÃO especifica se é anual ou acumulado até a data (YTD), registrado como está publicado" };
  const hash = crypto.createHash("sha256").update(`MG|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_mg_individual
    (empresa_sigla,empresa_nome,cargo,nome,matricula,remuneracao_basica,mes_referencia,fonte,_hash)
    values ($1,$2,$3,$4,null,$5,'2026 (período exato não especificado pela fonte)',$6,$7)
    on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.fonte, hash]);
}

{
  const r = { sigla: "MGS", nome_empresa: "Minas Gerais Administração e Serviços S.A.",
    cargo: "Diretora-Presidente (CEO)", nome: "Camila Barbosa Neves", valor: null,
    fonte: "confirmação cruzada: LinkedIn profissional + menções institucionais (posse dez/2024)" };
  const hash = crypto.createHash("sha256").update(`MG|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_mg_individual
    (empresa_sigla,empresa_nome,cargo,nome,matricula,remuneracao_basica,mes_referencia,fonte,_hash)
    values ($1,$2,$3,$4,null,$5,null,$6,$7)
    on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.fonte, hash]);
}

await q(`delete from estatais_pendencias where uf='MG' and empresa_sigla in ('CODEMIG','MGS')`);

console.log("=== Minas Gerais — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, remuneracao_basica from remuneracao_dirigentes_estatais_mg_individual where empresa_sigla in ('CODEMGE','MGS') order by empresa_sigla`)).rows);
await db.end();
