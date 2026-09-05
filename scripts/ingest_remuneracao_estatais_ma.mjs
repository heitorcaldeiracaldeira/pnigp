// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ma.mjs — Maranhão: o formulário de busca do portal (jQuery Chosen + selects
// dependentes) resistiu a toda automação (erro 500 mesmo com ano/mês/órgão corretamente selecionados via UI) —
// achei um caminho melhor: dados.ma.gov.br publica a FOLHA INTEIRA em CSV aberto por mês (FOLHA_2026_07.csv,
// 80 mil linhas, órgão/nome/cargo/valores).
//
// Única estatal clara no cadastro: MAPA (Maranhão Parcerias — inclui a EMARHP, que no dropdown do portal aparece
// como órgão "aninhado" dela). Não achei "INVESTE MA" nem outra estatal na folha de julho/2026.
//
// node scripts/ingest_remuneracao_estatais_ma.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const FONTE = "dados.ma.gov.br/?q=dataset/folha-de-pagamento-2026 (FOLHA_2026_07.csv)";

await q(`create table if not exists remuneracao_dirigentes_estatais_ma_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, total_vantagens numeric,
  competencia text, fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const r = { sigla: "MAPA", nome_empresa: "Maranhão Parcerias S.A.", cargo: "Diretor Presidente",
  nome: "Anibal Verri Pinheiro", valor: 25439.64, competencia: "2026-07", fonte: FONTE };
const hash = crypto.createHash("sha256").update(`MA|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
await q(`insert into remuneracao_dirigentes_estatais_ma_individual
  (empresa_sigla,empresa_nome,cargo,nome,total_vantagens,competencia,fonte,_hash)
  values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (_hash) do nothing`,
  [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, hash]);

console.table((await q(`select * from remuneracao_dirigentes_estatais_ma_individual`)).rows);
await db.end();
