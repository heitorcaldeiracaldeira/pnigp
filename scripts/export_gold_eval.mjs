// Exporta o gabarito (painel_gold) + nomes de PDM para TSV, insumo da bancada de avaliação de classificação.
// Ponte por arquivo (mesmo padrão do treino). node scripts/export_gold_eval.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const OUT = process.env.SCRATCH || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 }); db.on("error", () => {});
const q = async (s) => (await db.query(s)).rows;
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();

// só PDMs com >=8 exemplos (precisa de treino E teste); rótulo = codigo_pdm
const rows = await q(`WITH c AS (SELECT codigo_pdm FROM painel_gold GROUP BY 1 HAVING count(*)>=8)
  SELECT g.descricao_item, g.descricao_detalhada, g.marca, g.unidade, g.codigo_pdm, g.nome_pdm, g.codigo_classe, g.nome_classe
  FROM painel_gold g JOIN c ON c.codigo_pdm=g.codigo_pdm WHERE g.descricao_item IS NOT NULL`);
const out = fs.createWriteStream(OUT + "/gold.tsv");
out.write("descricao\tdetalhada\tmarca\tunidade\tcodigo_pdm\tnome_pdm\tcodigo_classe\tnome_classe\n");
for (const r of rows) out.write([clean(r.descricao_item), clean(r.descricao_detalhada), clean(r.marca), clean(r.unidade), r.codigo_pdm, clean(r.nome_pdm), r.codigo_classe ?? "", clean(r.nome_classe)].join("\t") + "\n");
out.end();

// nomes canônicos de PDM (baseline "nearest PDM name" = o que a produção faz por trigrama)
const pdms = await q(`SELECT codigo_pdm, nome_pdm, nome_classe FROM catmat_pdm`);
const o2 = fs.createWriteStream(OUT + "/pdm_names.tsv");
o2.write("codigo_pdm\tnome_pdm\tnome_classe\n");
for (const r of pdms) o2.write([r.codigo_pdm, clean(r.nome_pdm), clean(r.nome_classe)].join("\t") + "\n");
o2.end();

const nPdm = new Set(rows.map((r) => r.codigo_pdm)).size;
console.log(`gold.tsv: ${rows.length.toLocaleString()} pares · ${nPdm} PDMs (>=8 ex) · pdm_names.tsv: ${pdms.length.toLocaleString()}`);
await new Promise((r) => out.on("finish", r));
await db.end();
