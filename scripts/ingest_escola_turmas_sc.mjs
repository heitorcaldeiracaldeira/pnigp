// Número de TURMAS por escola e por etapa (creche/pré/fund AI/AF/médio/EJA/especial) + rede. Fonte: INEP Censo Escolar (microdados escola). State-agnostic.
import fs from "fs"; import pg from "pg"; import readline from "readline";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const CSV = process.argv[2];
const nI = (x) => { const n = parseInt(String(x || "").trim()); return isNaN(n) ? 0 : n; };
const DEP = { 1: "Federal", 2: "Estadual", 3: "Municipal", 4: "Privada" };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS escola_turmas_sc (co_entidade TEXT PRIMARY KEY, cod_ibge TEXT, ano INT, nome TEXT, rede TEXT, tur_total INT, tur_creche INT, tur_pre INT, tur_fund_ai INT, tur_fund_af INT, tur_medio INT, tur_eja INT, tur_esp INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_escturmas_mun ON escola_turmas_sc(cod_ibge)`);
await db.query(`DELETE FROM escola_turmas_sc WHERE cod_ibge LIKE '${UFC}%'`);
const I = { ent: 18, nome: 17, mun: 7, dep: 19, cre: 384, pre: 385, fai: 387, faf: 388, med: 389, eja: 392, esp: 395, tot: 382 };
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: "latin1" }) });
let i = 0, n = 0, batch = [];
const flush = async () => { if (!batch.length) return; const ph = [], vals = []; batch.forEach((r, k) => { const b = k * 13; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`); vals.push(...r); }); await db.query(`INSERT INTO escola_turmas_sc (co_entidade,cod_ibge,ano,nome,rede,tur_total,tur_creche,tur_pre,tur_fund_ai,tur_fund_af,tur_medio,tur_eja,tur_esp) VALUES ${ph.join(",")} ON CONFLICT (co_entidade) DO UPDATE SET tur_total=EXCLUDED.tur_total,rede=EXCLUDED.rede`, vals); batch = []; };
for await (const l of rl) { if (i++ === 0) continue; const c = l.split(";"); const mun = c[I.mun]; if (!mun || mun.slice(0, 2) !== UFC || !by7.has(mun)) continue; batch.push([c[I.ent], mun, 2023, c[I.nome], DEP[nI(c[I.dep])] || "?", nI(c[I.tot]), nI(c[I.cre]), nI(c[I.pre]), nI(c[I.fai]), nI(c[I.faf]), nI(c[I.med]), nI(c[I.eja]), nI(c[I.esp])]); n++; if (batch.length >= 500) await flush(); }
await flush();
const cc = (await db.query(`SELECT count(*) esc, sum(tur_total) tur FROM escola_turmas_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows[0];
console.log(`✔ escola_turmas_sc: ${cc.esc} escolas · ${cc.tur} turmas no total (${UFC})`);
await db.end();
