// Ranking da Qualidade da Informação Contábil e Fiscal (Tesouro Nacional) por município — nota (A-D), posição nacional, %acertos, dimensões, série. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const num = (v) => { const n = parseFloat(String(v)); return isNaN(n) ? null : n; };
const url = "https://ranking-municipios.tesouro.gov.br/static/data/municipios_exercicios.csv";
const txt = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
const linhas = txt.split(/\r?\n/);
const head = linhas[0].split(",");
const ix = (n) => head.indexOf(n);
const iEnte = ix("Ente"), iDI = ix("DI"), iDII = ix("DII"), iDIII = ix("DIII"), iDIV = ix("DIV"), iAno = ix("exercicio"), iPer = ix("per_acertos"), iNota = ix("nota_ranking"), iClass = ix("class_ranking"), iUf = ix("sg_uf");
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS ranking_tesouro_sc (cod_ibge TEXT, ano INT, nota TEXT, posicao INT, pct_acertos NUMERIC, di NUMERIC, dii NUMERIC, diii NUMERIC, div NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
await db.query("DELETE FROM ranking_tesouro_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (let k = 1; k < linhas.length; k++) { const c = linhas[k].split(","); if (c.length < head.length) continue; const cod = c[iEnte]; if (!by7.has(cod) || c[iUf] !== UF) continue; const ano = parseInt(c[iAno]); if (!ano) continue; const per = num(c[iPer]); await db.query("INSERT INTO ranking_tesouro_sc (cod_ibge,ano,nota,posicao,pct_acertos,di,dii,diii,div) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (cod_ibge,ano) DO UPDATE SET nota=EXCLUDED.nota,posicao=EXCLUDED.posicao,pct_acertos=EXCLUDED.pct_acertos,di=EXCLUDED.di,dii=EXCLUDED.dii,diii=EXCLUDED.diii,div=EXCLUDED.div,atualizado=now()", [cod, ano, (c[iNota] || "").trim() || null, num(c[iClass]), per == null ? null : Math.round(per * 1000) / 10, num(c[iDI]), num(c[iDII]), num(c[iDIII]), num(c[iDIV])]); n++; }
const cc = (await db.query("SELECT count(*) linhas, count(DISTINCT cod_ibge) munis, max(ano) ano FROM ranking_tesouro_sc")).rows[0];
console.log(`✔ ranking_tesouro_sc: ${cc.linhas} linhas · ${cc.munis} municípios · até ${cc.ano}`);
await db.end();
