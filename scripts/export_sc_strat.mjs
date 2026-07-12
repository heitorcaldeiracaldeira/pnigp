// Amostra ESTRATIFICADA por banda de frequência das descrições de bem de itens_sc — p/ traçar a curva
// acurácia × frequência do classificador (onde o trigrama degrada na cauda). node scripts/export_sc_strat.mjs
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PER = Number(process.env.PER || 18);  // descrições por banda
const OUT = process.env.SCRATCH || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 300000 }); db.on("error", () => {});
const F = `unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento' AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`;
const rows = (await db.query(`
  WITH base AS (SELECT ${NORM} chave, descricao FROM itens_sc WHERE ${F}),
  d AS (SELECT chave, count(*) n FROM base GROUP BY 1 HAVING length(chave) BETWEEN 4 AND 90 AND count(*)>=2),
  banded AS (SELECT chave, n,
      CASE WHEN n>=200 THEN 'A_200+' WHEN n>=50 THEN 'B_50-199' WHEN n>=20 THEN 'C_20-49' WHEN n>=5 THEN 'D_5-19' ELSE 'E_2-4' END band FROM d),
  samp AS (SELECT chave, n, band, row_number() OVER (PARTITION BY band ORDER BY md5(chave)) rn FROM banded),
  pick AS (SELECT chave, n, band FROM samp WHERE rn<=${PER}),
  ranked AS (SELECT b.chave, b.descricao, row_number() OVER (PARTITION BY b.chave ORDER BY length(b.descricao) DESC) rr
             FROM base b JOIN pick p ON p.chave=b.chave)
  SELECT p.band, p.chave, p.n, r.descricao exemplo FROM pick p JOIN ranked r ON r.chave=p.chave AND r.rr=1
  ORDER BY p.band, p.n DESC`)).rows;
const out = fs.createWriteStream(OUT + "/sc_strat.tsv");
out.write("band\tchave\tn\texemplo\n");
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
for (const r of rows) out.write([r.band, clean(r.chave), r.n, clean(r.exemplo)].join("\t") + "\n");
out.end();
const byBand = {}; for (const r of rows) byBand[r.band] = (byBand[r.band] || 0) + 1;
console.log(`sc_strat.tsv: ${rows.length} descrições · por banda:`, byBand);
await new Promise((r) => out.on("finish", r));
await db.end();
