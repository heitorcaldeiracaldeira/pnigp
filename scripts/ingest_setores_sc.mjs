// IBGE Censo 2022 — dados por SETOR CENSITÁRIO (menor unidade): população, domicílios, densidade, bairro. Base do mapa intraurbano. Fonte: IBGE FTP Agregados por Setores. State-agnostic.
import fs from "fs"; import pg from "pg"; import readline from "readline";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
// Sem argumento, BUSCA sozinho no FTP do IBGE (versão mais recente). Antes disto o script quebrava em
// `fs.createReadStream(undefined)` sempre que o orquestrador o chamava — e o orquestrador nunca passa
// argumento. Ficou semanas com "erro(1)" sem produzir uma linha, porque o erro era descartado.
const { garanteArquivo } = await import("./baixa_setores_ibge.mjs");
const CSV = process.argv[2] || process.env.SETOR_CSV || await garanteArquivo("basico");
const uq = (x) => (x || "").replace(/^"|"$/g, "");
const nInt = (x) => { const n = parseInt(uq(x).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const nFlt = (x) => { const n = parseFloat(uq(x).replace(",", ".")); return isNaN(n) ? 0 : n; };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
await db.query(`CREATE TABLE IF NOT EXISTS setores_censitarios_sc (cod_setor TEXT PRIMARY KEY, cod_ibge TEXT, bairro TEXT, area_km2 NUMERIC, populacao INT, domicilios INT, densidade_dom NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_setores_mun ON setores_censitarios_sc(cod_ibge)`);
await db.query(`DELETE FROM setores_censitarios_sc WHERE cod_ibge LIKE '${UFC}%'`);
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: "latin1" }) });
let i = 0, n = 0, batch = [];
const flush = async () => { if (!batch.length) return; const vals = [], ph = []; batch.forEach((r, k) => { const b = k * 7; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`); vals.push(...r); }); await db.query(`INSERT INTO setores_censitarios_sc (cod_setor,cod_ibge,bairro,area_km2,populacao,domicilios,densidade_dom) VALUES ${ph.join(",")} ON CONFLICT (cod_setor) DO UPDATE SET populacao=EXCLUDED.populacao,domicilios=EXCLUDED.domicilios,densidade_dom=EXCLUDED.densidade_dom`, vals); batch = []; };
for await (const l of rl) { if (i++ === 0) continue; if (!l.startsWith(`"${UFC}`)) continue; const c = l.split(";"); const setor = uq(c[0]); if (setor.slice(0, 2) !== UFC) continue; batch.push([setor, uq(c[9]), uq(c[16]) || null, nFlt(c[4]), nInt(c[29]), nInt(c[35]), nFlt(c[33])]); n++; if (batch.length >= 500) await flush(); }
await flush();
const cc = (await db.query(`SELECT count(*) n, count(DISTINCT cod_ibge) m, sum(populacao) p FROM setores_censitarios_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows[0];
console.log(`✔ setores_censitarios_sc: ${cc.n} setores · ${cc.m} municípios · ${cc.p} habitantes (soma dos setores)`);
await db.end();
