// ETL — Votos de cada parlamentar da BANCADA por município (TSE, eleição 2022) p/ o targeting de emendas.
// Fonte: TSE votação nominal por município/zona 2022 (zip nacional; extrai só o CSV de SC via `unzip -p`).
// Casa candidatos do TSE (dep. federal CD_CARGO=6, senador=5) aos membros de bancada_federal_sc por nome.
// node scripts/ingest_votos_bancada_sc.mjs   (ZIP=<caminho do zip> opcional)
import fs from "fs"; import pg from "pg"; import readline from "readline"; import { spawn } from "child_process";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ZIP = process.env.ZIP || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/tse2022.zip";
const MEMBRO = "votacao_candidato_munzona_2022_SC.csv";
const UF = process.env.UF || "SC";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS votos_bancada_sc (bancada_id TEXT, cod_ibge TEXT, votos INT, atualizado timestamptz DEFAULT now(), PRIMARY KEY (bancada_id, cod_ibge))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };

  // mapa nome normalizado -> bancada_id (aceita nome parlamentar)
  const banc = (await db.query(`SELECT id, nome FROM bancada_federal_sc WHERE uf=$1`, [UF])).rows;
  const nomeToId = new Map(banc.map((b) => [norm(b.nome), b.id]));
  // fallback por tokens: todos os tokens significativos do nome da bancada presentes no nome do candidato
  const STOP = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);
  const benchTokens = banc.map((b) => ({ id: b.id, tokens: norm(b.nome).split(" ").filter((t) => t.length > 2 && !STOP.has(t)) })).filter((b) => b.tokens.length);
  const matchTokens = (nomeCand) => { const ct = new Set(norm(nomeCand).split(" ").filter((t) => t.length > 2)); for (const bt of benchTokens) { if (bt.tokens.every((t) => ct.has(t))) return bt.id; } return null; };
  // mapa município normalizado -> cod_ibge
  const ent = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const munToCod = new Map(ent.map((e) => [norm(e.nome), e.cod_ibge]));

  // stream do CSV de SC dentro do zip (latin1, ; delimitado)
  const proc = spawn("unzip", ["-p", ZIP, MEMBRO]);
  proc.stderr.on("data", () => {});
  proc.stdout.setEncoding("latin1");
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

  let idx = null, linhas = 0;
  const acc = new Map(); // `${bancadaId}|${cod}` -> votos
  const semMatchBanc = new Set();
  for await (const line of rl) {
    if (!line) continue;
    const c = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
    if (idx === null) { // header
      const h = c.map((x) => x.trim().toUpperCase());
      idx = { cargo: h.indexOf("CD_CARGO"), turno: h.indexOf("NR_TURNO"), mun: h.indexOf("NM_MUNICIPIO"), nm: h.indexOf("NM_CANDIDATO"), urna: h.indexOf("NM_URNA_CANDIDATO"), votos: h.indexOf("QT_VOTOS_NOMINAIS"), uf: h.indexOf("SG_UF") };
      continue;
    }
    linhas++;
    if (idx.uf >= 0 && c[idx.uf] !== UF) continue;
    const cargo = c[idx.cargo];
    if (cargo !== "6" && cargo !== "5") continue; // 6=Dep Federal, 5=Senador
    if (idx.turno >= 0 && c[idx.turno] !== "1") continue;
    // casa candidato -> bancada (exato por urna/nome, senão por tokens do nome completo)
    let id = nomeToId.get(norm(c[idx.urna])) || nomeToId.get(norm(c[idx.nm])) || matchTokens(c[idx.nm]) || matchTokens(c[idx.urna]);
    if (!id) { semMatchBanc.add(norm(c[idx.urna])); continue; }
    const cod = munToCod.get(norm(c[idx.mun])); if (!cod) continue;
    const v = parseInt(c[idx.votos], 10) || 0;
    const k = `${id}|${cod}`; acc.set(k, (acc.get(k) || 0) + v);
  }
  await new Promise((res) => proc.on("close", res));

  await q(`TRUNCATE votos_bancada_sc`);
  let n = 0;
  for (const [k, v] of acc) { const [id, cod] = k.split("|"); if (v <= 0) continue; await q(`INSERT INTO votos_bancada_sc (bancada_id,cod_ibge,votos) VALUES ($1,$2,$3) ON CONFLICT (bancada_id,cod_ibge) DO UPDATE SET votos=EXCLUDED.votos,atualizado=now()`, [id, cod, v]); n++; }
  const casados = new Set([...acc.keys()].map((k) => k.split("|")[0]));
  console.log(`Votos bancada ${UF}: ${linhas} linhas lidas · ${n} pares (parlamentar×município) · ${casados.size}/${banc.length} membros da bancada casados no TSE`);
  const tot = (await db.query(`SELECT b.nome, sum(v.votos) t FROM votos_bancada_sc v JOIN bancada_federal_sc b ON b.id=v.bancada_id GROUP BY b.nome ORDER BY t DESC LIMIT 5`)).rows;
  tot.forEach((r) => console.log(`   ${r.nome}: ${Number(r.t).toLocaleString("pt-BR")} votos em SC`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
