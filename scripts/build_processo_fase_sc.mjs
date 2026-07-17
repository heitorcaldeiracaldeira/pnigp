// CONTADOR POR FASE — cada processo em UMA fase (partição limpa dos 241k). Tabela derivada, rebuildável, indexada:
// o app lê em <200ms. NÃO é view (view pesada não responde count em 120s — o erro do processos_sc, 16/07).
//
// AS FASES (só o que o PNCP publica — as 7 da lei viram estas; "adjudicado"/"em lances" NÃO existem):
//   recebendo_proposta   data_encerramento > now  · o que o FORNECEDOR quer ver
//   homologada           tem item situacao=Homologado (e ainda sem contrato)
//   contratada           virou contrato (contratos_sc) — mais avançada; homologada é subconjunto dela
//   deserta_fracassada   item situacao 4/5 — ninguém apareceu / todos inabilitados
//   cancelada            contratação Revogada/Anulada/Suspensa (situacao 2/3/4)
//   em_analise           🔴 O BALDE HONESTO: passou o prazo, sem desfecho publicado. MISTURA "de verdade em
//                        análise" com FANTASMA (morto no portal, o PNCP nunca soube — Entre Rios). NÃO colapsar,
//                        NÃO esconder. Rótulo separado até termos a regra de idade (processo de 2023 = fantasma).
//
// Ordem = mais avançada vence (contratada > homologada > ...). Derivada de compra: read-only, nunca apaga nada.
// node scripts/build_processo_fase_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
await db.connect();
const n = (x) => Number(x).toLocaleString("pt-BR");

console.log("classificando os processos por fase…");
await db.query(`DROP TABLE IF EXISTS processo_fase_sc`);
await db.query(`CREATE TABLE processo_fase_sc AS
  WITH sinal AS (
    SELECT c.cnpj, c.ano, c.seq, c.cod_ibge, c.municipio_nome, c.modalidade, c.modalidade_id,
      c.objeto, c.valor_estimado, c.valor_homologado, c.data_abertura, c.data_encerramento, c.situacao,
      EXISTS(SELECT 1 FROM itens_sc i WHERE i.cnpj=c.cnpj AND i.ano=c.ano AND i.seq=c.seq AND i.situacao='Homologado') hom,
      EXISTS(SELECT 1 FROM itens_sc i WHERE i.cnpj=c.cnpj AND i.ano=c.ano AND i.seq=c.seq AND i.situacao IN ('Deserto','Fracassado')) desf,
      EXISTS(SELECT 1 FROM contratos_sc k WHERE k.cnpj_compra=c.cnpj AND k.ano_compra=c.ano AND k.seq_compra=c.seq) tem_ctr
    FROM contratacoes_sc c
    WHERE c.cod_ibge IS NOT NULL AND length(c.cod_ibge)=7   -- só municipal (guard: Estado nunca em benchmark municipal)
  )
  SELECT *,
    CASE
      WHEN situacao IN ('Revogada','Anulada','Suspensa')                         THEN 'cancelada'
      WHEN tem_ctr                                                               THEN 'contratada'
      WHEN hom                                                                   THEN 'homologada'
      WHEN desf                                                                  THEN 'deserta_fracassada'
      WHEN situacao='Divulgada no PNCP' AND data_encerramento IS NOT NULL
           AND data_encerramento::timestamptz > now()                           THEN 'recebendo_proposta'
      ELSE 'em_analise'
    END AS fase
  FROM sinal`);
await db.query(`ALTER TABLE processo_fase_sc ADD PRIMARY KEY (cnpj, ano, seq)`);
await db.query(`CREATE INDEX ix_pf_fase ON processo_fase_sc (fase)`);
await db.query(`CREATE INDEX ix_pf_ibge ON processo_fase_sc (cod_ibge)`);
await db.query(`CREATE INDEX ix_pf_ibge_fase ON processo_fase_sc (cod_ibge, fase)`);

const r = await db.query(`SELECT fase, count(*) n,
  sum(coalesce(valor_homologado, valor_estimado)) valor FROM processo_fase_sc GROUP BY 1 ORDER BY 2 DESC`);
const tot = r.rows.reduce((a, x) => a + Number(x.n), 0);
const ORDEM = { recebendo_proposta: "🟢 recebendo proposta", homologada: "✅ homologada",
  contratada: "📄 contratada", deserta_fracassada: "⚠️  deserta/fracassada",
  cancelada: "🚫 cancelada", em_analise: "❓ em análise (contém fantasmas)" };
console.log(`\n✔ processo_fase_sc · ${n(tot)} processos municipais\n`);
for (const x of r.rows)
  console.log(`   ${(ORDEM[x.fase] || x.fase).padEnd(34)} ${n(x.n).padStart(9)}  (${(100*x.n/tot).toFixed(1)}%)  R$ ${n(Math.round(x.valor||0))}`);
console.log(`\n   as 5 primeiras são LIMPAS. A última é o balde honesto — rótulo próprio, não escondido.`);
console.log(`   leitura do app: SELECT fase, count(*) FROM processo_fase_sc WHERE cod_ibge=$1 GROUP BY 1  (<200ms)`);
await db.end();
