// Exporta as descrições coloquiais de BEM mais frequentes de itens_sc (n>=N_MIN) para rotulagem do gabarito de SC.
// node scripts/export_sc_top.mjs
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const N_MIN = Number(process.env.N_MIN || 20);
const OUT = process.env.SCRATCH || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 180000 }); db.on("error", () => {});
const F = `unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento' AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`;
// uma passada só: materializa NORM em `base`, agrega, e pega o exemplo mais longo por window function (sem subconsulta correlacionada)
const rows = (await db.query(`
  WITH base AS (SELECT ${NORM} chave, descricao, unidade FROM itens_sc WHERE ${F}),
  d AS (SELECT chave, count(*) n, string_agg(DISTINCT unidade, ',') unidades FROM base GROUP BY 1
        HAVING count(*)>=${N_MIN} AND length(chave) BETWEEN 4 AND 90),
  ranked AS (SELECT b.chave, b.descricao, row_number() OVER (PARTITION BY b.chave ORDER BY length(b.descricao) DESC) rn
             FROM base b JOIN d ON d.chave=b.chave)
  SELECT d.chave, d.n, r.descricao exemplo, d.unidades
  FROM d JOIN ranked r ON r.chave=d.chave AND r.rn=1 ORDER BY d.n DESC`)).rows;
const out = fs.createWriteStream(OUT + "/sc_top.tsv");
out.write("chave\tn\texemplo\tunidades\n");
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
for (const r of rows) out.write([clean(r.chave), r.n, clean(r.exemplo), clean(r.unidades)].join("\t") + "\n");
out.end();
console.log(`sc_top.tsv: ${rows.length.toLocaleString()} descrições coloquiais (n>=${N_MIN}) · volume ${rows.reduce((a, r) => a + Number(r.n), 0).toLocaleString()} linhas`);
await new Promise((r) => out.on("finish", r));
await db.end();
