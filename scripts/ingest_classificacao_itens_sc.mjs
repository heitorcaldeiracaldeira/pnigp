// ETL — Classificação dos itens de compra → CATMAT/CATSER. Dicionário por descritivo normalizado distinto
// (matcher léxico v2: fuzzy-prefixo + head livre + limiar de especificidade). Depende de catalogo_govbr_sc
// e de itens_sc. Rebuild idempotente. node scripts/ingest_classificacao_itens_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const fmtBi = (n) => "R$ " + (Number(n || 0) / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi";
const VERSAO = "lexico-v2";

// stopwords: ligação + termos genéricos de compra/processo (head vira o substantivo real)
const STOP = new Set(["DE","DA","DO","DOS","DAS","PARA","COM","SEM","EM","POR","TIPO","UN","UND","UNIDADE","PCT","CX","KG","ML","MG","MCG","MATERIAL","OU","A","O","E","NA","NO","AO","AOS","AS",
  "SERVICO","SERVICOS","PRESTACAO","CONTRATACAO","CONTRATO","EMPRESA","ESPECIALIZADA","ESPECIALIZADOS","EXECUCAO","FORNECIMENTO","AQUISICAO","LOCACAO","GERAL","DIVERSOS","OUTROS","MUNICIPIO","MUNICIPAL","PUBLICO","PUBLICA","ATENDER","DEMANDA","REFERENTE","CONFORME","VISANDO","JUNTO","ATRAVES","COMPOSICAO","MARCA","REFERENCIA"]);
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => [...new Set(norm(s).split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)))];
const pfx = (w) => w.slice(0, 5);
const fuzzyEq = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));

function idx(arr) { const m = new Map(); for (const p of arr) for (const tk of p.t) { const k = pfx(tk); if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return m; }
function casar(dt, headIndex) {
  if (!dt.length) return null; const head = dt[0];
  const cands = headIndex.get(pfx(head)) || [];
  let best = null, bestScore = 0; const seen = new Set();
  for (const p of cands) {
    if (seen.has(p)) continue; seen.add(p); if (!p.t.length) continue;
    if (!p.t.some((w) => fuzzyEq(head, w))) continue;
    const shared = p.t.filter((w) => dt.some((d) => fuzzyEq(d, w))).length;
    if (p.t.length > 1 && shared < 2) continue;
    const cob = shared / p.t.length;
    if (cob < 0.5) continue;
    const score = shared + cob;
    if (score > bestScore) { bestScore = score; best = { p, shared, cob, score }; }
  }
  return best;
}
const confDe = (m) => !m ? "sem" : (m.cob >= 0.8 && m.shared >= 2 ? "alta" : "media");

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 600000 });

  // 1) carrega catálogo da base, separa índices por tipo
  console.log("carregando catalogo_govbr_sc…");
  const cat = (await db.query(`SELECT nivel, tipo, cod, nome, classe FROM catalogo_govbr_sc`)).rows
    .map((r) => ({ ...r, t: toks(r.nome) }));
  if (!cat.length) throw new Error("catalogo_govbr_sc vazio — rode ingest_catalogo_govbr_sc.mjs antes");
  const idxMat = idx(cat.filter((c) => c.tipo === "Material"));                 // PDMs
  const srv = cat.filter((c) => c.tipo === "Serviço");
  const idxSrvItem = idx(srv.filter((c) => c.nivel === "ITEM"));
  const idxSrvClasse = idx(srv.filter((c) => c.nivel === "CLASSE"));
  console.log(`  catálogo: ${cat.length} entradas`);

  // 2) descritivos distintos por tipo (com peso)
  const N = `trim(regexp_replace(upper(regexp_replace(translate(descricao,'ÁÀÃÂÉÊÍÓÔÕÚÜÇáàãâéêíóôõúüç','AAAAEEIOOOUUCAAAAEEIOOOUUC'),'[^A-Za-z0-9 ]',' ','g')),'\\s+',' ','g'))`;
  console.log("agregando descritivos distintos de itens_sc…");
  const rows = (await db.query(`
    SELECT ${N} k, tipo, count(*) n, sum(quantidade*unit_homologado) valor
    FROM itens_sc
    WHERE unit_homologado>0 AND quantidade>0 AND quantidade*unit_homologado<=200000000 AND ${N} <> ''
    GROUP BY 1,2`)).rows;
  console.log(`  descritivos distintos: ${rows.length.toLocaleString("pt-BR")}`);

  // 3) tabela destino + rebuild
  await db.query(`CREATE TABLE IF NOT EXISTS itens_classificacao_sc (
    descr_norm TEXT NOT NULL, tipo TEXT NOT NULL,
    cat_nivel TEXT, cat_cod TEXT, cat_nome TEXT, cat_classe TEXT,
    shared INT, cobertura NUMERIC, score NUMERIC, confianca TEXT,
    metodo TEXT DEFAULT '${VERSAO}', n_ocorrencias INT, valor_total NUMERIC,
    atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (descr_norm, tipo))`);
  await db.query(`TRUNCATE itens_classificacao_sc`);

  // 4) casa + insere em lotes; acumula cobertura
  const acc = { Material: { v: 0, vo: 0, l: 0, lo: 0 }, "Serviço": { v: 0, vo: 0, l: 0, lo: 0 } };
  let buf = [], inseridos = 0;
  const flush = async () => {
    if (!buf.length) return;
    const ph = [], vals = [];
    buf.forEach((r, j) => { const b = j * 12; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`); vals.push(...r); });
    await db.query(`INSERT INTO itens_classificacao_sc
      (descr_norm,tipo,cat_nivel,cat_cod,cat_nome,cat_classe,shared,cobertura,score,confianca,n_ocorrencias,valor_total)
      VALUES ${ph.join(",")}`, vals);
    inseridos += buf.length; buf = [];
  };
  for (const r of rows) {
    const dt = toks(r.k), v = Number(r.valor) || 0, n = Number(r.n) || 0;
    const a = acc[r.tipo]; if (a) { a.v += v; a.l += n; }
    let m = null;
    if (r.tipo === "Material") m = casar(dt, idxMat);
    else if (r.tipo === "Serviço") m = casar(dt, idxSrvItem) || casar(dt, idxSrvClasse);
    if (m && a) { a.vo += v; a.lo += n; }
    const conf = confDe(m);
    buf.push([r.k, r.tipo, m?.p.nivel ?? null, m?.p.cod ?? null, m?.p.nome ?? null, m?.p.classe ?? null,
      m?.shared ?? null, m ? Number(m.cob.toFixed(3)) : null, m ? Number(m.score.toFixed(3)) : null, conf, n, Math.round(v)]);
    if (buf.length >= 1000) await flush();
  }
  await flush();

  // 5) índices + relatório
  await db.query(`CREATE INDEX IF NOT EXISTS ix_classif_cod ON itens_classificacao_sc (cat_cod)`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_classif_conf ON itens_classificacao_sc (confianca, tipo)`);
  console.log(`\nitens_classificacao_sc: ${inseridos.toLocaleString("pt-BR")} descritivos classificados`);
  for (const t of ["Material", "Serviço"]) {
    const a = acc[t];
    console.log(`  [${t}] LINHAS ${(a.lo/a.l*100).toFixed(1)}% · VALOR ${(a.vo/a.v*100).toFixed(1)}% (${fmtBi(a.vo)} de ${fmtBi(a.v)})`);
  }
  const conf = (await db.query(`SELECT tipo, confianca, count(*) n FROM itens_classificacao_sc GROUP BY 1,2 ORDER BY 1,2`)).rows;
  console.log("  por confiança:", conf.map((c) => `${c.tipo[0]}/${c.confianca}=${c.n}`).join(" · "));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
