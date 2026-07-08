// Detalhe do Ranking Tesouro por município — verificações NÃO atendidas (o que corrigir p/ subir). Fonte: Tesouro ARQUIVOS_MUN/<cod>.csv + descricao_ranking.csv. State-agnostic.
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const H = { "User-Agent": "Mozilla/5.0" };
const BASE = "https://ranking-municipios.tesouro.gov.br/static/data/";
// parser CSV robusto (respeita aspas + separador configurável)
function parseCSV(txt, sep) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; } else cur += ch; } }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// de-para verificação -> {dimensao, desc, anexo}
const drows = parseCSV(await (await fetch(BASE + "descricao_ranking.csv", { headers: H })).text(), ";");
const dh = drows[0]; const di = (n) => dh.indexOf(n);
const dep = new Map();
for (let k = 1; k < drows.length; k++) { const c = drows[k]; const cod = (c[di("no_verificacao")] || "").trim(); if (!cod) continue; dep.set(cod, { dimensao: (c[di("no_dimensao")] || "").trim(), desc: (c[di("no_desc")] || "").trim(), anexo: (c[di("no_anexo")] || "").trim() }); }
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const munis = (await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge);
await db.query(`CREATE TABLE IF NOT EXISTS ranking_detalhe_sc (cod_ibge TEXT, ano INT, verificacao TEXT, dimensao TEXT, anexo TEXT, descricao TEXT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, verificacao))`);
await db.query("DELETE FROM ranking_detalhe_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let nMun = 0, nFalhas = 0;
for (const cod of munis) {
  const r = await fetch(`${BASE}ARQUIVOS_MUN/${cod}.csv`, { headers: H }).catch(() => null);
  if (!r || r.status !== 200) continue;
  const rows = parseCSV(await r.text(), ",");
  const h = rows[0]; const ix = (n) => h.indexOf(n);
  const iAno = ix("exercicio"), iVer = ix("verificacao"), iVal = ix("valor");
  const anos = rows.slice(1).map(c => parseInt(c[iAno])).filter(Boolean);
  if (!anos.length) continue; const ult = Math.max(...anos);
  const falhas = [];
  for (let k = 1; k < rows.length; k++) { const c = rows[k]; if (parseInt(c[iAno]) !== ult) continue; const val = parseFloat(c[iVal]); if (!(val < 1)) continue; const ver = (c[iVer] || "").trim(); const d = dep.get(ver) || {}; falhas.push([cod, ult, ver, d.dimensao || null, d.anexo || null, d.desc || null]); }
  for (const f of falhas) { await db.query("INSERT INTO ranking_detalhe_sc (cod_ibge,ano,verificacao,dimensao,anexo,descricao) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge,ano,verificacao) DO UPDATE SET dimensao=EXCLUDED.dimensao,anexo=EXCLUDED.anexo,descricao=EXCLUDED.descricao,atualizado=now()", f); nFalhas++; }
  nMun++; if (nMun % 60 === 0) console.log(`  ${nMun}/${munis.length} municípios...`);
}
console.log(`✔ ranking_detalhe_sc: ${nMun} municípios · ${nFalhas} verificações não atendidas (último ano)`);
await db.end();
