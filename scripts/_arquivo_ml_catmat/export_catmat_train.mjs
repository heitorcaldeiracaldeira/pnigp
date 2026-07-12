// Exporta o corpus rotulado (catmat_catalogo: descrição→PDM/classe) + as chaves distintas de bens de SC, p/ o
// treino do classificador TF-IDF+SVM (train_classify_catmat.py). Ponte por arquivo TSV. node scripts/export_catmat_train.mjs
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const OUT = process.env.OUT || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const clean = (s) => String(s || "").replace(/[\t\r\n]+/g, " ").trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });
  db.on("error", () => {});
  const c = await db.connect();

  // 1) treino: descrição do catálogo → codigo_pdm / codigo_classe / nome_pdm
  console.log("exportando treino (catmat_catalogo)…");
  const tr = fs.createWriteStream(OUT + "/catmat_train.tsv");
  tr.write("descricao\tcodigo_pdm\tcodigo_classe\tnome_pdm\n");
  const q1 = await c.query(`SELECT descricao, codigo_pdm, codigo_classe, nome_pdm FROM catmat_catalogo WHERE descricao IS NOT NULL AND length(descricao)>5 AND codigo_pdm IS NOT NULL`);
  for (const r of q1.rows) tr.write(`${clean(r.descricao)}\t${r.codigo_pdm}\t${r.codigo_classe ?? ""}\t${clean(r.nome_pdm)}\n`);
  tr.end(); console.log(`  ${q1.rows.length.toLocaleString()} exemplos de treino`);

  // 2) chaves a classificar: descrições normalizadas de BENS em SC (distintas), c/ frequência
  console.log("exportando chaves de SC (bens)…");
  const ks = fs.createWriteStream(OUT + "/sc_keys.tsv");
  ks.write("chave\tn_itens\n");
  const q2 = await c.query(`SELECT ${NORM} chave, count(*) n FROM itens_sc
    WHERE unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL
      AND descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
      AND unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'
    GROUP BY 1 HAVING length(${NORM}) BETWEEN 4 AND 90`);
  for (const r of q2.rows) ks.write(`${clean(r.chave)}\t${r.n}\n`);
  ks.end(); console.log(`  ${q2.rows.length.toLocaleString()} chaves distintas`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
