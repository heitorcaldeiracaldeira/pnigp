// ETL — Bolsa Atleta por município. Fonte: Ministério do Esporte (dados abertos, XLSX no SharePoint mdsgov).
// Download via SharePoint _layouts/15/download.aspx?share={token}. Agrega nº de atletas + valor pago + top modalidades
// por (município, ano/edital). State-agnostic (UF env). node scripts/ingest_bolsa_atleta_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const SITE = "https://mdsgov.sharepoint.com/sites/cgti.dadosabertos.mesp/_layouts/15/download.aspx?share=";
// tokens dos XLSX (folha-de-pagamento-bolsa-atleta em dados.gov.br → org Min. Esporte). Refresh: rebuscar via navegador.
const TOKENS = ["IQC1FbUqI5G2Rr4xqCoo67zBAbQYQccXtTu5gdxBCn6UtvY", "IQB7VMld1GyEQ4MQcxdYknboAberog6phgxEgt0vloobX7k", "IQBhhaeR-Bd3T67b7O0DYLwbAeLRI4_0IkAKHlFXJBOq358", "IQBp9Ba7ApcDR4insi5C9UqSAb-fO5bPtfNK5tHXz2pIMqw", "IQD54hVstqdRR5pAOR8m7kQ1ARdStdf53PTcz6kIEGcj8yY"];
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byName = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  const M = new Map(); // cod|ano -> {atletas:Set, valor, mods:Map}
  for (let i = 0; i < TOKENS.length; i++) {
    const xl = path.join(os.tmpdir(), `ba_${i}.xlsx`);
    if (!fs.existsSync(xl) || fs.statSync(xl).size < 1e4) { try { execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", xl, SITE + TOKENS[i]], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(xl) || fs.statSync(xl).size < 1e4) { console.log(`  ⚠ token ${i}: sem arquivo`); continue; }
    let rows; try { const wb = XLSX.readFile(xl); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }); } catch (e) { console.log(`  ⚠ token ${i}: xlsx inválido`); continue; }
    let nSC = 0;
    for (const r of rows) {
      if (String(r["UF"] || "").trim().toUpperCase() !== UF) continue;
      const cod = byName.get(norm(r["Municipio"])); if (!cod) continue;
      const ano = parseInt(r["Edital"]) || parseInt(String(r["Data de referência"] || "").slice(0, 4)); if (!ano) continue;
      const k = cod + "|" + ano;
      if (!M.has(k)) M.set(k, { cod, ano, atletas: new Set(), valor: 0, mods: new Map() });
      const m = M.get(k); m.atletas.add(norm(r["Nome do Atleta"]));
      const v = Number(r["Valor Pago"]) || 0; m.valor += v;
      const mod = String(r["Modalidade"] || "").trim(); if (mod) m.mods.set(mod, (m.mods.get(mod) || 0) + 1);
      nSC++;
    }
    console.log(`  ✓ arquivo ${i + 1}/${TOKENS.length}: ${rows.length} linhas · ${nSC} de ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS bolsa_atleta_sc (cod_ibge TEXT, ano INTEGER, n_atletas INTEGER, valor_pago NUMERIC, top_modalidades JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  for (const m of M.values()) {
    const top = [...m.mods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([modalidade, n]) => ({ modalidade, n }));
    await db.query(`INSERT INTO bolsa_atleta_sc (cod_ibge,ano,n_atletas,valor_pago,top_modalidades,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET n_atletas=EXCLUDED.n_atletas,valor_pago=EXCLUDED.valor_pago,top_modalidades=EXCLUDED.top_modalidades,atualizado=now()`,
      [m.cod, m.ano, m.atletas.size, Math.round(m.valor), JSON.stringify(top)]);
  }
  const chk = (await db.query(`SELECT count(*) l, count(distinct cod_ibge) m, sum(n_atletas) atl, round(sum(valor_pago)/1e3,0) mil, min(ano) mi, max(ano) ma FROM bolsa_atleta_sc`)).rows[0];
  console.log(`✔ bolsa_atleta_sc: ${chk.l} linhas · ${chk.m} municípios · ${chk.atl} atletas · R$ ${chk.mil} mil · ${chk.mi}-${chk.ma}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
