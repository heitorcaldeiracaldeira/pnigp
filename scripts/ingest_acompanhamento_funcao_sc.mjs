// ETL — ACOMPANHAMENTO por FUNÇÃO (intra-anual): orçado (dotação) × realizado (empenhado) ATÉ O BIMESTRE vigente,
// por função, por município. Tabela SEPARADA da anual (despesa_subfuncao_sc) p/ NÃO contaminar as análises de ano fechado.
// node scripts/ingest_acompanhamento_funcao_sc.mjs   (ANO opcional = ano corrente)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const ANO = Number(process.env.ANO || new Date().getFullYear());
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const FUNCOES = ["Legislativa", "Judiciária", "Essencial à Justiça", "Administração", "Defesa Nacional", "Segurança Pública", "Relações Exteriores", "Assistência Social", "Previdência Social", "Saúde", "Trabalho", "Educação", "Cultura", "Direitos da Cidadania", "Urbanismo", "Habitação", "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia", "Agricultura", "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações", "Energia", "Transporte", "Desporto e Lazer", "Encargos Especiais"];
const FSET = new Set(FUNCOES.map(norm));
const COL_EMP = "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)", COL_DOT = "DOTAÇÃO ATUALIZADA (a)";
const ehAgreg = (c) => /despesas|subtotal|^total|reserva de conting|exceto|intra|\(i+\)/i.test(c || ""); // "reserva de conting" específico — NÃO casar "pReSERVAção e conservação ambiental"
// soma por FUNÇÃO (agrega subfunções), só despesa normal (exceto intra), para uma coluna
function walkFuncao(items, coluna) {
  const rows = items.filter((x) => x.coluna === coluna);
  let funcAtual = null, intraMode = false; const acc = new Map();
  for (const x of rows) {
    const conta = String(x.conta || "").trim();
    if (/intra/i.test(conta) && !/exceto/i.test(conta)) { intraMode = true; funcAtual = null; continue; }
    if (intraMode) continue;
    if (ehAgreg(conta)) { funcAtual = null; continue; }
    if (FSET.has(norm(conta))) { funcAtual = conta; continue; }
    if (!funcAtual) continue;
    const val = Number(x.valor) || 0; if (val === 0) continue;
    acc.set(funcAtual, (acc.get(funcAtual) || 0) + val);
  }
  return acc;
}
async function fetchAnexo(ano, periodo, id) {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(`${SIC}?an_exercicio=${ano}&nr_periodo=${periodo}&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&co_esfera=M&id_ente=${id}`, { signal: AbortSignal.timeout(45000) }); if (r.ok) return (await r.json()).items || []; } catch {}
    await sleep(1500 * (t + 1));
  }
  return null;
}
async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS acompanhamento_funcao_sc (cod_ibge TEXT, ano INT, bimestre INT, funcao TEXT, dotacao NUMERIC, empenhado NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano, funcao))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC' ORDER BY cod_ibge`)).rows;
  // último bimestre publicado (testa 6..1 no 1º ente)
  let bim = 0;
  for (let p = 6; p >= 1; p--) { const it = await fetchAnexo(ANO, p, entes[0].cod_ibge); if (it && it.length) { bim = p; break; } }
  if (!bim) { console.log(`Sem RREO ${ANO}.`); await db.end(); return; }
  console.log(`${ANO}: bimestre ${bim} (até mês ${bim * 2})`);
  let ok = 0;
  for (const e of entes) {
    const items = await fetchAnexo(ANO, bim, e.cod_ibge);
    if (!items) continue;
    const emp = walkFuncao(items, COL_EMP), dot = walkFuncao(items, COL_DOT);
    const funcs = new Set([...emp.keys(), ...dot.keys()]);
    if (!funcs.size) continue;
    await q(`DELETE FROM acompanhamento_funcao_sc WHERE cod_ibge=$1 AND ano=$2`, [e.cod_ibge, ANO]);
    for (const f of funcs)
      await q(`INSERT INTO acompanhamento_funcao_sc (cod_ibge,ano,bimestre,funcao,dotacao,empenhado) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge,ano,funcao) DO UPDATE SET bimestre=EXCLUDED.bimestre,dotacao=EXCLUDED.dotacao,empenhado=EXCLUDED.empenhado,atualizado=now()`,
        [e.cod_ibge, ANO, bim, f, Math.round((dot.get(f) || 0) * 100) / 100, Math.round((emp.get(f) || 0) * 100) / 100]);
    ok++;
    if (ok % 50 === 0) console.log(`  ${ok} municípios`);
    await sleep(90);
  }
  console.log(`Concluído ${ANO}/bim${bim}: ${ok} municípios por função`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
