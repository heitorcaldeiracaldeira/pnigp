// ETL — Educação Especial por município (INEP Censo Escolar, Tabela_Matricula). Detalhe do ano corrente:
// total (QT_MAT_ESP), INCLUÍDOS em classes comuns (QT_MAT_ESP_CC → inclusão), exclusivas (=total−CC), por etapa.
// Grão do arquivo = escola (CO_ENTIDADE); casa CO_ENTIDADE→cod_ibge via escolas_sc/escolas_hist_sc. Filtra SC pelo mapa.
// "AEE" (atendimento especializado) é o serviço DENTRO da educação especial — aqui medimos educação especial (Censo).
// Idempotente (UPSERT por cod_ibge+ano). node scripts/ingest_censo_especial_sc.mjs  (ZIP já baixado em SCRATCH)
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = process.env.ANO || "2025";
const ZIP = process.env.ZIP || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/censo2025.zip";
const ENTRY = `microdados_censo_escolar_${ANO}/dados/Tabela_Matricula_${ANO}.csv`;
const nn = (v) => { const x = Number(String(v || "").trim()); return Number.isFinite(x) ? x : 0; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  // mapa CO_ENTIDADE -> cod_ibge (SC): escolas_sc (ano corrente) + histórico como fallback
  const ents = (await db.query(`SELECT co_entidade, cod_ibge FROM escolas_sc UNION SELECT co_entidade, cod_ibge FROM escolas_hist_sc`)).rows;
  const byEnt = new Map(ents.map((e) => [String(e.co_entidade), e.cod_ibge]));
  console.log(`mapa CO_ENTIDADE→município: ${byEnt.size} escolas SC`);

  // extrai o CSV de matrícula para disco (90MB) e lê em streaming
  const tmp = path.join(os.tmpdir(), `matricula_${ANO}.csv`);
  console.log("extraindo Tabela_Matricula…");
  execFileSync("unzip", ["-o", "-j", ZIP, ENTRY, "-d", os.tmpdir()], { stdio: "ignore" });
  const real = path.join(os.tmpdir(), `Tabela_Matricula_${ANO}.csv`);
  const src = fs.existsSync(real) ? real : tmp;

  const rl = readline.createInterface({ input: fs.createReadStream(src, { encoding: "latin1" }), crlfDelay: Infinity });
  let head = null, idx = {}, linha = 0;
  const M = new Map(); // cod_ibge -> agregados
  for await (const line of rl) {
    if (!head) { head = line.split(";").map((h) => h.replace(/^"|"$/g, "").trim()); const at = (n) => head.indexOf(n); idx = { ent: at("CO_ENTIDADE"), esp: at("QT_MAT_ESP"), cc: at("QT_MAT_ESP_CC"), inf: at("QT_MAT_ESP_INF"), fund: at("QT_MAT_ESP_FUND"), med: at("QT_MAT_ESP_MED") }; continue; }
    const c = line.split(";"); if (c.length < head.length) continue;
    const cod = byEnt.get(String(c[idx.ent]).replace(/^"|"$/g, "").trim()); if (!cod) continue; // não-SC ou sem mapa → pula
    if (!M.has(cod)) M.set(cod, { total: 0, incluidos: 0, inf: 0, fund: 0, med: 0, escolas_esp: 0 });
    const m = M.get(cod); const esp = nn(c[idx.esp]);
    m.total += esp; m.incluidos += nn(c[idx.cc]); m.inf += nn(c[idx.inf]); m.fund += nn(c[idx.fund]); m.med += nn(c[idx.med]);
    if (esp > 0) m.escolas_esp += 1;
    linha++;
  }
  fs.unlinkSync(src);

  await db.query(`CREATE TABLE IF NOT EXISTS educacao_especial_sc (
    cod_ibge TEXT, ano INTEGER, total INTEGER, incluidos INTEGER, exclusivas INTEGER,
    esp_infantil INTEGER, esp_fundamental INTEGER, esp_medio INTEGER, escolas_com_esp INTEGER,
    atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  let n = 0;
  for (const [cod, m] of M) {
    await db.query(`INSERT INTO educacao_especial_sc (cod_ibge,ano,total,incluidos,exclusivas,esp_infantil,esp_fundamental,esp_medio,escolas_com_esp,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT (cod_ibge,ano) DO UPDATE SET total=EXCLUDED.total,incluidos=EXCLUDED.incluidos,exclusivas=EXCLUDED.exclusivas,esp_infantil=EXCLUDED.esp_infantil,esp_fundamental=EXCLUDED.esp_fundamental,esp_medio=EXCLUDED.esp_medio,escolas_com_esp=EXCLUDED.escolas_com_esp,atualizado=now()`,
      [cod, Number(ANO), m.total, m.incluidos, Math.max(0, m.total - m.incluidos), m.inf, m.fund, m.med, m.escolas_esp]);
    n++;
  }
  const chk = (await db.query(`SELECT count(*) munis, sum(total) tot, sum(incluidos) inc, round(100.0*sum(incluidos)/nullif(sum(total),0),1) pct_incl FROM educacao_especial_sc WHERE ano=$1`, [Number(ANO)])).rows[0];
  console.log(`✔ educacao_especial_sc ${ANO}: ${n} municípios · ${chk.tot} matrículas educação especial · ${chk.inc} incluídos (${chk.pct_incl}% em classe comum)`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
