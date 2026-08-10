// ETL — Indicadores educacionais INEP por município (rede MUNICIPAL): AFD (formação docente adequada, CAT_1),
// TDI (distorção idade-série, CAT_0), ATU (alunos por turma, CAT_0). Por etapa. Fonte: download.inep.gov.br (xlsx).
// Sub-aba "Indicadores" da Educação. node scripts/ingest_indicadores_inep_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
// ═══ O ANO NÃO SE PRESUME, SE DESCOBRE ═══
// Estava cravado em 2025. Funcionava hoje e quebraria calado quando o INEP publicasse 2026 — a tabela
// seguiria mostrando 2025 sem nenhum erro. Mesma lei dos setores do IBGE: procurar se há dado novo.
// ANO= força um ano específico (para reprocessar histórico); sem ANO=, varre do ano corrente para trás.
const ANO_FIXO = process.env.ANO ? Number(process.env.ANO) : null;
const ANO_TOPO = new Date().getFullYear();
const urlDe = (ind, mapa, ano) => {
  const base = `https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/${ano}`;
  return mapa.arq ? `${base}/${mapa.arq}_${ano}.zip` : `${base}/${ind}_${ano}_MUNICIPIOS.zip`;
};
// mapa etapa → coluna por indicador. AFD = CAT_1 (adequado). TDI/ATU = CAT_0.
const IND = {
  AFD: { ed_inf: "ED_INF_CAT_1", fun_ai: "FUN_AI_CAT_1", fun_af: "FUN_AF_CAT_1", medio: "MED_CAT_1" },
  DSU: { ed_inf: "ED_INF_CAT_0", fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" }, // % docentes com curso superior
  TDI: { ed_inf: null, fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
  ATU: { ed_inf: "ED_INF_CAT_0", fun_ai: "FUN_AI_CAT_0", fun_af: "FUN_AF_CAT_0", medio: "MED_CAT_0" },
  APROVACAO: { arq: "tx_rend_municipios", ed_inf: null, fun_ai: "1_CAT_FUN_AI", fun_af: "1_CAT_FUN_AF", medio: "1_CAT_MED" }, // taxa de aprovação
  ABANDONO: { arq: "tx_rend_municipios", ed_inf: null, fun_ai: "3_CAT_FUN_AI", fun_af: "3_CAT_FUN_AF", medio: "3_CAT_MED" }, // taxa de abandono
};
const nv = (v) => { const s = String(v ?? "").replace(",", ".").trim(); if (!s || s === "--" || s === "") return null; const x = Number(s); return Number.isFinite(x) ? x : null; };

// ═══ O INEP RESPONDE 200 PARA CAMINHO QUE NÃO EXISTE ═══
// Medido em 10/ago: `curl -I` devolveu HTTP 200 para TODOS os anos testados, inclusive os que não existem —
// é soft 404, uma página de erro servida com status de sucesso. Checar o código de status aqui não prova
// nada. Os BYTES provam: zip de verdade começa com `PK`, página de erro começa com `<`.
function ehZip(url) {
  const p = path.join(os.tmpdir(), "_inep_probe.bin");
  try { fs.rmSync(p, { force: true }); } catch { /* ignora */ }
  // ignoro o código de saída do curl de propósito: com -r pode vir 206, e se o servidor ignorar o range o
  // --max-time corta no meio — em qualquer um dos casos o que interessa são os dois primeiros bytes.
  try { execFileSync("curl", ["-sL", "--max-time", "25", "-r", "0-1", "-A", "Mozilla/5.0", "-o", p, url], { stdio: "ignore" }); } catch { /* ver os bytes */ }
  try { const fd = fs.openSync(p, "r"); const b = Buffer.alloc(2); const n = fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); return n === 2 && b.toString("latin1") === "PK"; } catch { return false; }
}

const anoCache = new Map();   // tx_rend é o mesmo arquivo para APROVACAO e ABANDONO: não sondar duas vezes
function descobreAno(ind, mapa) {
  if (ANO_FIXO) return ANO_FIXO;
  const chave = mapa.arq || ind;
  if (anoCache.has(chave)) return anoCache.get(chave);
  let achado = null;
  for (let a = ANO_TOPO; a >= ANO_TOPO - 4 && achado === null; a--) if (ehZip(urlDe(ind, mapa, a))) achado = a;
  anoCache.set(chave, achado);
  return achado;
}

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS indicadores_inep_sc (cod_ibge TEXT, ano INTEGER, indicador TEXT, ed_inf NUMERIC, fun_ai NUMERIC, fun_af NUMERIC, medio NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, indicador))`);

  const { extraiPlano, zipIntegro } = await import("./descompacta.mjs");
  const feito = {};   // indicador → nº de linhas GRAVADAS NESTA EXECUÇÃO (ou o motivo da falha)
  let anoUsado = null;

  for (const [ind, mapa] of Object.entries(IND)) {
    const ANO = descobreAno(ind, mapa);
    if (!ANO) { feito[ind] = "sem arquivo publicado"; console.log(`  ${ind}: nenhum ano de ${ANO_TOPO - 4} a ${ANO_TOPO} tem zip`); continue; }
    anoUsado = anoUsado ?? ANO;
    const arq = mapa.arq || `${ind}_${ANO}_MUNICIPIOS`;
    const url = urlDe(ind, mapa, ANO);
    const xlsx = path.join(os.tmpdir(), mapa.arq ? `${mapa.arq}_${ANO}.xlsx` : `${ind}_MUNICIPIOS_${ANO}.xlsx`);
    if (!fs.existsSync(xlsx)) { // baixa só se ainda não extraído (rendimento é 1 arquivo p/ APROVACAO + ABANDONO)
      const zip = path.join(os.tmpdir(), `inep_${arq}.zip`);
      // ═══ O TETO FIXO CORTAVA O ARQUIVO MAIOR ═══
      // Medido em 10/ago: o INEP entrega a ~446 KB/s, e oscila. `tx_rend` tem 32,8 MB (~74 s no melhor
      // caso); AFD tem 23,5 MB e passava. Não era URL errada nem fonte fora do ar — era o `--max-time 180`
      // apostando na velocidade da origem, e o maior arquivo perdendo a aposta. Daí "APROVACAO: download
      // falhou" e, logo atrás, "ABANDONO: xlsx não encontrado": um erro só, dois sintomas, porque os dois
      // dividem o mesmo zip. --speed-limit/--speed-time aborta se ESTAGNAR, não por ser grande e lento.
      if (!zipIntegro(zip)) {
        try { fs.rmSync(zip, { force: true }); } catch { /* ignora */ }
        try {
          execFileSync("curl", ["-sSL", "--fail", "--max-time", "1800", "--speed-limit", "1024", "--speed-time", "60",
            "--retry", "3", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", zip, url], { stdio: "ignore" });
        } catch (e) { feito[ind] = "download falhou"; console.log(`  ${ind} ${ANO}: download falhou — ${String(e.message).slice(0, 80)}`); continue; }
      }
      // tamanho não prova integridade: 17 MB truncados passam em qualquer teste de tamanho e não abrem
      if (!zipIntegro(zip)) { feito[ind] = "zip truncado"; console.log(`  ${ind} ${ANO}: zip veio truncado (${fs.existsSync(zip) ? fs.statSync(zip).size : 0} bytes, sem EOCD)`); continue; }
      extraiPlano(zip, os.tmpdir());  // ACHATA como o antigo `unzip -j`: o script espera o xlsx na raiz do tmpdir
    }
    if (!fs.existsSync(xlsx)) { feito[ind] = "xlsx não encontrado"; console.log(`  ${ind} ${ANO}: xlsx não encontrado`); continue; }
    const wb = XLSX.readFile(xlsx);   // era readFile DUAS VEZES na mesma linha: 30 MB de xlsx parseados em dobro
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.includes("CO_MUNICIPIO")); const H = rows[hi];
    const ix = (n) => (n ? H.indexOf(n) : -1);
    const iUF = H.indexOf("SG_UF"), iCod = H.indexOf("CO_MUNICIPIO"), iCat = H.indexOf("NO_CATEGORIA"), iDep = H.indexOf("NO_DEPENDENCIA");
    const cols = { ed_inf: ix(mapa.ed_inf), fun_ai: ix(mapa.fun_ai), fun_af: ix(mapa.fun_af), medio: ix(mapa.medio) };
    // uma ida ao banco por município era 295 idas por indicador, ~1.770 no total, para gravar 295 linhas.
    // O banco é o gargalo: junta tudo e manda de uma vez, por unnest.
    const L = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (r[iUF] !== UF) continue;
      if (!/municipal/i.test(String(r[iDep])) || !/total/i.test(String(r[iCat]))) continue; // rede municipal, localização total
      const cod = String(r[iCod]).replace(/\D/g, ""); if (cod.length !== 7) continue;
      L.push([cod, cols.ed_inf >= 0 ? nv(r[cols.ed_inf]) : null, nv(r[cols.fun_ai]), nv(r[cols.fun_af]), nv(r[cols.medio])]);
    }
    if (L.length) {
      await db.query(`INSERT INTO indicadores_inep_sc (cod_ibge,ano,indicador,ed_inf,fun_ai,fun_af,medio,atualizado)
        SELECT c, $2, $3, e, ai, af, m, now() FROM unnest($1::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[]) AS t(c,e,ai,af,m)
        ON CONFLICT (cod_ibge,ano,indicador) DO UPDATE SET ed_inf=EXCLUDED.ed_inf,fun_ai=EXCLUDED.fun_ai,fun_af=EXCLUDED.fun_af,medio=EXCLUDED.medio,atualizado=now()`,
        [L.map((x) => x[0]), ANO, ind, L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3]), L.map((x) => x[4])]);
    }
    feito[ind] = L.length;
    console.log(`  ✔ ${ind} ${ANO}: ${L.length} municípios`);
  }
  // ═══ O ✔ FINAL CONTAVA A TABELA, NÃO A EXECUÇÃO ═══
  // Antes ele lia `SELECT count(*) ... WHERE ano=$1` e anunciava "APROVACAO=295" mesmo quando o download
  // de APROVACAO tinha falhado naquela rodada — estava contando linhas que outra rodada gravou. Foi assim
  // que quatro fontes ficaram meses paradas mostrando ✔. O que interessa é o que ESTA rodada escreveu.
  const ok = Object.entries(feito).filter(([, v]) => typeof v === "number" && v > 0);
  const ruim = Object.entries(feito).filter(([, v]) => typeof v !== "number" || v === 0);
  console.log(`${ruim.length ? "⚠" : "✔"} indicadores_inep_sc ${anoUsado ?? "?"}: ${ok.map(([k, v]) => k + "=" + v).join(" · ") || "nada gravado"}`);
  if (ruim.length) {
    console.log(`  FALHARAM: ${ruim.map(([k, v]) => `${k} (${v})`).join(" · ")}`);
    process.exitCode = 1;   // o orquestrador precisa VER a falha, não receber um ✔ e seguir
  }
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
