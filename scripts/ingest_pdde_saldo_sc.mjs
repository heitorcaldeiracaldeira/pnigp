// PDDE — SALDO acumulado das UEx (verba escolar PARADA / não executada) por município. Fonte: FNDE (Plataforma Antonieta de Barros). State-agnostic (UF env).
import fs from "fs"; import pg from "pg"; import zlib from "zlib";
const UF = process.env.UF || "SC";
const u = "https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/70/artifact";
const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
const buf = Buffer.from(await r.arrayBuffer());
let txt; try { txt = zlib.gunzipSync(buf).toString("utf8"); } catch { txt = buf.toString("utf8"); }
const linhas = txt.split(/\r?\n/); const head = linhas[0].split(";");
const iUf = head.indexOf("uf"), iCod = head.indexOf("codigo_municipio"), iSaldo = head.indexOf("saldo_acumulado"), iAno = head.indexOf("an_exercicio"), iEsf = head.indexOf("esfera_administrativa");
const agg = new Map(); let ano = "";
// SÓ escolas da rede MUNICIPAL (excluir estadual/federal — não é verba da prefeitura). Ver contaminação estadual.
for (let k = 1; k < linhas.length; k++) { const c = linhas[k].split(";"); if (c[iUf] !== UF) continue; const esf = c[iEsf] || ""; if (!/MUNICIPAL/i.test(esf) || /ESTADUAL|FEDERAL/i.test(esf)) continue; ano = c[iAno] || ano; const cod = c[iCod]; const s = parseFloat((c[iSaldo] || "0").replace(",", ".")) || 0; if (!agg.has(cod)) agg.set(cod, { saldo: 0, escolas: 0 }); const o = agg.get(cod); o.saldo += s; o.escolas++; }
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS pdde_saldo_sc (cod_ibge TEXT PRIMARY KEY, ano TEXT, saldo NUMERIC, escolas INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM pdde_saldo_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod6, o] of agg) { const cod = by6.get(String(cod6).slice(0, 6)); if (!cod) continue; await db.query("INSERT INTO pdde_saldo_sc (cod_ibge,ano,saldo,escolas) VALUES ($1,$2,$3,$4) ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano,saldo=EXCLUDED.saldo,escolas=EXCLUDED.escolas,atualizado=now()", [cod, ano, o.saldo, o.escolas]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(saldo)/1e6,1) mi FROM pdde_saldo_sc")).rows[0];
console.log(`✔ pdde_saldo_sc: ${n} munis · ano ${ano} · saldo parado total R$ ${c.mi} mi`);
await db.end();
