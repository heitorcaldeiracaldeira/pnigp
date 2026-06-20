// ETL — TODOS os processos de contratação do PNCP em SC (todas as modalidades, todos os anos).
// Fonte: API Consulta /v1/contratacoes/publicacao (exige codigoModalidadeContratacao; limite 365 dias).
// Universo completo para a coleta de itens (preço unitário). Idempotente/resumível por (modalidade, ano).
// node scripts/ingest_processos_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const B = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const ANO = new Date().getFullYear();
const ANOS = []; for (let a = Number(process.env.ANO_MIN || 2021); a <= ANO; a++) ANOS.push(a);
const MODALIDADES = (process.env.MODS || "1,2,3,4,5,6,7,8,9,10,11,12,13").split(",").map(Number); // 1..13 (todas)
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const d10 = (s) => (s ? String(s).slice(0, 10) : null);

async function pagina(mod, ano, pg_) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${B}?dataInicial=${ano}0101&dataFinal=${ano}1231&uf=SC&codigoModalidadeContratacao=${mod}&pagina=${pg_}&tamanhoPagina=50`, { signal: AbortSignal.timeout(40000) });
      if (r.status === 204 || r.status === 404) return { data: [], totalPaginas: 0 };
      if (!r.ok) throw 0;
      return await r.json();
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS processos_sc (
    numero_controle TEXT PRIMARY KEY, cod_ibge TEXT, cnpj_orgao TEXT, ano INTEGER, sequencial INTEGER,
    modalidade_id INTEGER, modalidade TEXT, objeto TEXT, valor_estimado NUMERIC, situacao TEXT, data_pub DATE, atualizado timestamptz DEFAULT now() )`);
  await db.query(`CREATE TABLE IF NOT EXISTS processos_feitos (modalidade INTEGER, ano INTEGER, n INTEGER, concluido_em timestamptz DEFAULT now(), PRIMARY KEY (modalidade, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 12; t++) { try { return await db.query(s, p); } catch { await sleep(1500 * (t + 1)); } } throw new Error("db"); };
  const cod6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc`)).rows.map((r) => [r.cod_ibge.slice(0, 6), r.cod_ibge]));
  const feitos = new Set((await db.query(`SELECT modalidade||'-'||ano k FROM processos_feitos WHERE ano < ${ANO}`)).rows.map((r) => r.k)); // ano corrente sempre recoleta

  let totalGravados = 0;
  for (const ano of ANOS) {
    for (const mod of MODALIDADES) {
      if (feitos.has(`${mod}-${ano}`)) continue;
      let p = 1, totalPag = 1, n = 0;
      do {
        const j = await pagina(mod, ano, p);
        if (j == null) { console.log(`  mod ${mod}/${ano} pág ${p}: falha — interrompe combo`); break; }
        totalPag = Number(j.totalPaginas) || 1;
        for (const x of (j.data || [])) {
          const ibge = String(x.unidadeOrgao?.codigoIbge || x.unidadeOrgao?.municipioIbge || "").replace(/\D/g, "");
          const cnpj = String(x.orgaoEntidade?.cnpj || "").replace(/\D/g, "");
          const cod = cod6.get(ibge.slice(0, 6)) || cod6.get(cnpj.slice(0, 6)) || null;
          await q(`INSERT INTO processos_sc (numero_controle,cod_ibge,cnpj_orgao,ano,sequencial,modalidade_id,modalidade,objeto,valor_estimado,situacao,data_pub)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                   ON CONFLICT (numero_controle) DO UPDATE SET situacao=EXCLUDED.situacao,valor_estimado=EXCLUDED.valor_estimado,atualizado=now()`,
            [x.numeroControlePNCP, cod, cnpj, Number(x.anoCompra) || ano, Number(x.sequencialCompra) || null, mod, String(x.modalidadeNome || ""),
             String(x.objetoCompra || "").slice(0, 300), Number(x.valorTotalEstimado) || null, String(x.situacaoCompraNome || ""), d10(x.dataPublicacaoPncp)]);
          n++; totalGravados++;
        }
        p++;
        if (p % 50 === 0) console.log(`  mod ${mod}/${ano}: pág ${p}/${totalPag} (${n})`);
      } while (p <= totalPag && p <= 2000);
      if (p > totalPag) await q(`INSERT INTO processos_feitos (modalidade,ano,n) VALUES ($1,$2,$3) ON CONFLICT (modalidade,ano) DO UPDATE SET n=EXCLUDED.n, concluido_em=now()`, [mod, ano, n]);
      console.log(`mod ${mod}/${ano}: ${n} processos`);
    }
  }
  const c = await db.query(`SELECT count(*) total, count(distinct cod_ibge) entes FROM processos_sc`);
  console.log(`Processos concluído: ${totalGravados} nesta rodada · total ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
