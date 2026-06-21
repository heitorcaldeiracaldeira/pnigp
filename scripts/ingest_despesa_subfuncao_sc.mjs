// ETL — Despesa por FUNÇÃO → SUBFUNÇÃO (drill real: Atenção Básica, Ensino Fundamental…) via SICONFI
// RREO Anexo 02. Hierarquia é por ordem: linha de função (lista oficial) e depois suas subfunções.
// node scripts/ingest_despesa_subfuncao_sc.mjs   (ANOS opcional)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = new Date().getFullYear();
const ANOS = (process.env.ANOS || `${ANO - 3},${ANO - 2},${ANO - 1}`).split(",").map(Number);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// 28 funções orçamentárias oficiais (Portaria MOG 42/1999)
const FUNCOES = ["Legislativa", "Judiciária", "Essencial à Justiça", "Administração", "Defesa Nacional", "Segurança Pública", "Relações Exteriores", "Assistência Social", "Previdência Social", "Saúde", "Trabalho", "Educação", "Cultura", "Direitos da Cidadania", "Urbanismo", "Habitação", "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia", "Agricultura", "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações", "Energia", "Transporte", "Desporto e Lazer", "Encargos Especiais"];
const FSET = new Set(FUNCOES.map(norm));
const COL_EMP = "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)";
const ehAgreg = (c) => /despesas|subtotal|^total|reserva|exceto|intra|\(i+\)/i.test(c || "");

async function fetchAnexo(ano, id, esfera) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&co_esfera=${esfera}&id_ente=${id}`, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      return (await r.json()).items || [];
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS despesa_subfuncao_sc (cod_ibge TEXT, ano INTEGER, funcao TEXT, subfuncao TEXT, empenhado NUMERIC, PRIMARY KEY (cod_ibge, ano, funcao, subfuncao))`);
  await db.query(`CREATE TABLE IF NOT EXISTS despesa_sub_check (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY tipo='E' DESC, cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge||'-'||ano k FROM despesa_sub_check`)).rows.map((r) => r.k));
  let grav = 0, proc = 0;
  for (const ano of ANOS) {
    for (const e of entes) {
      if (feitos.has(`${e.cod_ibge}-${ano}`)) continue;
      const items = await fetchAnexo(ano, e.cod_ibge, e.tipo === "E" ? "E" : "M");
      if (items == null) continue;
      const emp = items.filter((x) => x.coluna === COL_EMP); // ordem preserva hierarquia
      let funcAtual = null;
      const acc = new Map(); // "funcao|subfuncao" -> soma (normal + intra)
      for (const x of emp) {
        const conta = String(x.conta || "").trim();
        if (ehAgreg(conta)) { funcAtual = null; continue; }
        if (FSET.has(norm(conta))) { funcAtual = conta; continue; } // linha de função (total) — pula
        if (!funcAtual) continue;
        const val = Number(x.valor) || 0;
        if (val === 0) continue;
        const sub = conta.replace(/^FU\d+\s*-\s*/i, ""); // limpa prefixo "FUxx - "
        const k = `${funcAtual}|${sub}`;
        acc.set(k, (acc.get(k) || 0) + val);
      }
      for (const [k, val] of acc) {
        const [funcao, sub] = k.split("|");
        await q(`INSERT INTO despesa_subfuncao_sc (cod_ibge,ano,funcao,subfuncao,empenhado) VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (cod_ibge,ano,funcao,subfuncao) DO UPDATE SET empenhado=EXCLUDED.empenhado`, [e.cod_ibge, ano, funcao, sub, Math.round(val * 100) / 100]);
        grav++;
      }
      await q(`INSERT INTO despesa_sub_check (cod_ibge,ano) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [e.cod_ibge, ano]);
      proc++;
      if (proc % 40 === 0) console.log(`  ${ano}: ${proc} entes (gravados ${grav})`);
      await sleep(100);
    }
    console.log(`Ano ${ano} concluído.`);
  }
  const c = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n FROM despesa_subfuncao_sc`);
  console.log(`Subfunção concluído: ${grav} nesta rodada · ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
