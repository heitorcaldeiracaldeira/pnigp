// Conab PAA — Programa de Aquisição de Alimentos (agricultura familiar): formalizado/executado/DEVOLVIDO por município. Fonte: Conab. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const numBR = (s) => parseFloat(String(s || "0").replace(/\./g, "").replace(",", ".")) || 0;
const r = await fetch("https://portaldeinformacoes.conab.gov.br/downloads/arquivos/PAA_PropostaFormalizadasExecutada.txt", { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" } });
const txt = Buffer.from(await r.arrayBuffer()).toString("latin1");
const L = txt.split(/\r?\n/); const H = L[0].split(";");
const iUf = H.indexOf("uf"), iCod = H.indexOf("cod_ibge"), iAno = H.indexOf("ano"), iF = H.indexOf("valor_formalizado"), iE = H.indexOf("valor_executado"), iD = H.indexOf("valor_devolvido");
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
const agg = new Map();
for (let k = 1; k < L.length; k++) { const c = L[k].split(";"); if ((c[iUf] || "").trim() !== UF) continue; const cod = by6.get(String(c[iCod] || "").trim().slice(0, 6)); if (!cod) continue; if (!agg.has(cod)) agg.set(cod, { form: 0, exec: 0, dev: 0, ultAno: "" }); const o = agg.get(cod); o.form += numBR(c[iF]); o.exec += numBR(c[iE]); o.dev += numBR(c[iD]); const ano = (c[iAno] || "").split(",")[0]; if (ano > o.ultAno) o.ultAno = ano; }
await db.query(`CREATE TABLE IF NOT EXISTS paa_sc (cod_ibge TEXT PRIMARY KEY, formalizado NUMERIC, executado NUMERIC, devolvido NUMERIC, ultimo_ano TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM paa_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { await db.query("INSERT INTO paa_sc (cod_ibge,formalizado,executado,devolvido,ultimo_ano) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cod_ibge) DO UPDATE SET formalizado=EXCLUDED.formalizado,executado=EXCLUDED.executado,devolvido=EXCLUDED.devolvido,ultimo_ano=EXCLUDED.ultimo_ano,atualizado=now()", [cod, o.form, o.exec, o.dev, o.ultAno]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(executado)/1e6,1) ex, round(sum(devolvido)/1e6,1) dev FROM paa_sc")).rows[0];
console.log(`✔ paa_sc: ${n} munis · executado R$ ${c.ex} mi · devolvido R$ ${c.dev} mi (recurso perdido)`);
await db.end();
