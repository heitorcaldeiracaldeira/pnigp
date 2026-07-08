// Transferências federais ao GOVERNO MUNICIPAL (CGU/Portal da Transparência — download em massa, contorna a API 504/403).
// Regra de contaminação: só TIPO FAVORECIDO = "Administração Pública Municipal" (exclui estadual/privado/sem fins lucrativos).
// Atribui ao município por NOME MUNICÍPIO (casa entes_sc) OU CNPJ (col 33 → cnpj_municipal_sc). State-agnostic (UF env).
// MESES=202401,202402,... (default = 2024 inteiro). Baixa o zip de cada mês (scratchpad) se não existir.
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { spawn, execFileSync } from "child_process"; import pg from "pg";
const UF = process.env.UF || "SC";
const SCR = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const MESES = (process.env.MESES || "202401,202402,202403,202404,202405,202406,202407,202408,202409,202410,202411,202412").split(",");
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
// mapa nome→cod_ibge (entes_sc) + CNPJ→cod_ibge (cnpj_municipal_sc)
const nomeMap = {}; for (const r of (await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows) nomeMap[norm(r.nome)] = r.cod_ibge;
const cnpjMap = {}; for (const r of (await db.query("SELECT cod_ibge, cnpj FROM cnpj_municipal_sc")).rows) cnpjMap[r.cnpj] = r.cod_ibge;
const flt = (v) => { const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

await db.query(`CREATE TABLE IF NOT EXISTS transferencias_cgu_sc (cod_ibge TEXT, ano_mes TEXT, tipo_transferencia TEXT, orgao TEXT, funcao TEXT, valor NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano_mes, tipo_transferencia, orgao, funcao))`);

for (const ym of MESES) {
  const zip = path.join(SCR, `transf_${ym}.zip`);
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 100000) {
    try { execFileSync("curl", ["-sk", "-L", "--max-time", "300", "--retry", "4", "-A", "Mozilla/5.0", "-o", zip, `https://portaldatransparencia.gov.br/download-de-dados/transferencias/${ym}`], { stdio: "ignore" }); } catch { console.log(`${ym}: download falhou`); continue; }
  }
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 100000) { console.log(`${ym}: zip vazio`); continue; }
  const entry = execFileSync("unzip", ["-Z1", zip]).toString().trim().split(/\r?\n/).find((e) => /\.csv$/i.test(e));
  const proc = spawn("unzip", ["-p", zip, entry]);
  proc.stdout.setEncoding("latin1"); // CSV do Portal é latin1 — evita mojibake em "Administração Pública Municipal"
  const rl = readline.createInterface({ input: proc.stdout });
  const agg = {}; let head = true, n = 0;
  await new Promise((resolve) => {
    rl.on("line", (l) => {
      if (head) { head = false; return; }
      const c = l.split(";"); if (c.length < 36) return;
      const g = (i) => (c[i] || "").replace(/^"|"$/g, "");
      if (g(3) !== UF) return;
      if (g(2) !== "Administração Pública Municipal") return; // só governo municipal
      const cod = nomeMap[norm(g(5))] || cnpjMap[g(33)]; if (!cod) return;
      const key = [cod, ym, g(1), g(7), g(11)].join("|");
      agg[key] = (agg[key] || 0) + flt(g(35)); n++;
    });
    rl.on("close", resolve);
  });
  await db.query("DELETE FROM transferencias_cgu_sc WHERE ano_mes=$1 AND cod_ibge LIKE $2", [ym, ({ SC: "42", SP: "35" }[UF] || "42") + "%"]);
  for (const [key, valor] of Object.entries(agg)) { const [cod, mes, tipo, orgao, funcao] = key.split("|"); await db.query("INSERT INTO transferencias_cgu_sc (cod_ibge,ano_mes,tipo_transferencia,orgao,funcao,valor) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge,ano_mes,tipo_transferencia,orgao,funcao) DO UPDATE SET valor=EXCLUDED.valor,atualizado=now()", [cod, mes, tipo, orgao, funcao, valor]); }
  console.log(`✔ ${ym}: ${n} linhas municipais → ${Object.keys(agg).length} agregados`);
}
const cc = (await db.query("SELECT count(DISTINCT cod_ibge) m, count(*) linhas, sum(valor) tot FROM transferencias_cgu_sc")).rows[0];
console.log(`✔ transferencias_cgu_sc: ${cc.m} municípios · ${cc.linhas} linhas · total R$${(cc.tot/1e9).toFixed(2)}bi`);
await db.end();
