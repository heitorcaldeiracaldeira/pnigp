// ETL — Votos dos SENADORES da bancada por município. Senador é eleito por eleição própria (2018/2022) e os
// SUPLENTES em exercício não têm votos próprios → usamos os votos do TITULAR que eles substituem.
// Mapa (bancada → titular eleito + ano): Amin=titular 2018; Hermes Klann=suplente de Jorge Seif (2022); Ivete da Silveira=suplente de Dário Berger (2018).
// node scripts/ingest_votos_senadores_sc.mjs
import fs from "fs"; import pg from "pg"; import readline from "readline"; import { spawn } from "child_process";
import { SG_UF } from "./_uf.mjs";   // NACIONAL-READY: UF=SP roda SP (era 'SC' fixo)
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const DIR = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
// bancada nome (para achar id) -> titular a buscar + ano
const MAPA = [
  { bench: "Esperidião Amin", titular: "ESPERIDIAO AMIN", ano: 2018 },
  { bench: "Hermes Klann", titular: "JORGE SEIF", ano: 2022 },
  { bench: "Ivete da Silveira", titular: "JORGINHO MELLO", ano: 2018 },
];

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS votos_bancada_sc (bancada_id TEXT, cod_ibge TEXT, votos INT, atualizado timestamptz DEFAULT now(), PRIMARY KEY (bancada_id, cod_ibge))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const banc = (await db.query(`SELECT id, nome FROM bancada_federal_sc WHERE uf='${SG_UF}' AND casa='senado'`)).rows;
  const idDe = (nome) => banc.find((b) => norm(b.nome) === norm(nome))?.id;
  const munToCod = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  // agrupa por ano p/ ler cada arquivo uma vez
  const porAno = {};
  for (const m of MAPA) { const id = idDe(m.bench); if (!id) { console.log(`! bancada não achada: ${m.bench}`); continue; } (porAno[m.ano] ||= []).push({ id, bench: m.bench, tokens: norm(m.titular).split(" ").filter((t) => t.length > 2) }); }

  for (const ano of Object.keys(porAno)) {
    const zip = `${DIR}/tse${ano}.zip`, membro = `votacao_candidato_munzona_${ano}_SC.csv`;
    if (!fs.existsSync(zip)) { console.log(`! zip ${ano} ausente (${zip}) — pulei`); continue; }
    const alvos = porAno[ano];
    const acc = new Map(); // `${id}|${cod}` -> votos
    const proc = spawn("unzip", ["-p", zip, membro]); proc.stderr.on("data", () => {}); proc.stdout.setEncoding("latin1");
    const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let idx = null, linhas = 0;
    for await (const line of rl) {
      if (!line) continue; const c = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
      if (idx === null) { const h = c.map((x) => x.trim().toUpperCase()); idx = { cargo: h.indexOf("CD_CARGO"), turno: h.indexOf("NR_TURNO"), mun: h.indexOf("NM_MUNICIPIO"), nm: h.indexOf("NM_CANDIDATO"), urna: h.indexOf("NM_URNA_CANDIDATO"), votos: h.indexOf("QT_VOTOS_NOMINAIS"), uf: h.indexOf("SG_UF") }; continue; }
      linhas++;
      if (idx.uf >= 0 && c[idx.uf] !== SG_UF) continue;
      if (c[idx.cargo] !== "5") continue; // 5 = Senador
      if (idx.turno >= 0 && c[idx.turno] !== "1") continue;
      const cn = new Set(norm(c[idx.nm]).split(" ").filter((t) => t.length > 2));
      const cu = new Set(norm(c[idx.urna]).split(" ").filter((t) => t.length > 2));
      const alvo = alvos.find((a) => a.tokens.every((t) => cn.has(t)) || a.tokens.every((t) => cu.has(t)));
      if (!alvo) continue;
      const cod = munToCod.get(norm(c[idx.mun])); if (!cod) continue;
      const k = `${alvo.id}|${cod}`; acc.set(k, (acc.get(k) || 0) + (parseInt(c[idx.votos], 10) || 0));
    }
    await new Promise((res) => proc.on("close", res));
    let n = 0;
    for (const [k, v] of acc) { const [id, cod] = k.split("|"); if (v <= 0) continue; await q(`INSERT INTO votos_bancada_sc (bancada_id,cod_ibge,votos) VALUES ($1,$2,$3) ON CONFLICT (bancada_id,cod_ibge) DO UPDATE SET votos=EXCLUDED.votos,atualizado=now()`, [id, cod, v]); n++; }
    const nomes = [...new Set(alvos.map((a) => a.bench))].join(", ");
    console.log(`  ${ano}: ${linhas} linhas · ${n} pares gravados (${nomes})`);
  }
  const tot = (await db.query(`SELECT b.nome, sum(v.votos) t FROM votos_bancada_sc v JOIN bancada_federal_sc b ON b.id=v.bancada_id WHERE b.casa='senado' GROUP BY b.nome ORDER BY t DESC`)).rows;
  console.log("Senadores (votos do titular em SC):"); tot.forEach((r) => console.log(`   ${r.nome}: ${Number(r.t).toLocaleString("pt-BR")}`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
