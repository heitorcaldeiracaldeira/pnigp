// Recuperação dos municípios SC sem RREO: usa a DCA (Declaração de Contas Anuais) do SICONFI.
// DCA-Anexo I-C (receita), I-D (despesa por categoria), I-E (despesa por função). node scripts/recover_dca.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getDCA(ano, ibge) {
  const u = `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca?an_exercicio=${ano}&id_ente=${ibge}`;
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(45000) }); if (r.status === 204) return []; if (!r.ok) throw 0; return (await r.json()).items || []; }
    catch { await sleep(800 * (t + 1)); }
  }
  return null;
}

// função código (2 díg.) → bucket
const BUCKET = { "10": "saude", "12": "educacao", "06": "seguranca", "08": "assistencia",
  "15": "infraestrutura", "17": "infraestrutura", "16": "infraestrutura", "18": "infraestrutura", "26": "infraestrutura", "25": "infraestrutura",
  "04": "administracao", "01": "administracao", "02": "administracao", "03": "administracao" };

function extrair(items) {
  const IC = items.filter((x) => x.anexo === "DCA-Anexo I-C");
  const ID = items.filter((x) => x.anexo === "DCA-Anexo I-D");
  const IE = items.filter((x) => x.anexo === "DCA-Anexo I-E");
  if (!IC.length || !ID.length) return null;
  const recCol = (conta, col) => IC.filter((x) => x.coluna === col && norm(x.conta).endsWith(norm(conta))).reduce((s, x) => s + +x.valor, 0);
  const recLiq = (conta) => recCol(conta, "Receitas Brutas Realizadas") - recCol(conta, "Deduções - FUNDEB") - recCol(conta, "Outras Deduções da Receita");
  const receita = r2(recLiq("Receitas Correntes") + recLiq("Receitas de Capital"));
  const tributaria = r2(recLiq("Impostos, Taxas e Contribuições de Melhoria"));
  const transferencias = r2(recLiq("Transferências Correntes") + recLiq("Transferências de Capital"));
  const dEmp = (frag) => ID.filter((x) => x.coluna === "Despesas Empenhadas" && norm(x.conta).endsWith(norm(frag))).reduce((s, x) => s + +x.valor, 0);
  const despesa = r2(dEmp("Total Geral da Despesa"));
  const pessoal = r2(dEmp("Pessoal e Encargos Sociais"));
  const custeio = r2(dEmp("Outras Despesas Correntes"));
  const investimento = r2(dEmp("Investimentos") + dEmp("Inversões Financeiras"));
  const divida = r2(dEmp("Juros e Encargos da Dívida") + dEmp("Amortização da Dívida"));
  // função (I-E): conta tipo "10 - Saúde" (top-level, sem ponto no código)
  const buckets = { saude: 0, educacao: 0, seguranca: 0, assistencia: 0, infraestrutura: 0, administracao: 0 };
  const funcoes = [];
  for (const x of IE) {
    if (x.coluna !== "Despesas Empenhadas") continue;
    const m = String(x.conta).match(/^(\d{2})\s*-\s*(.+)$/); // só função de 2 dígitos (sem subfunção "12.365")
    if (!m) continue;
    const val = +x.valor || 0;
    funcoes.push({ nome: m[2].trim(), dotacao: r2(val), empenhado: r2(val) });
    const b = BUCKET[m[1]];
    if (b) buckets[b] = r2(buckets[b] + val);
  }
  funcoes.sort((a, b) => b.empenhado - a.empenhado);
  if (receita <= 0 && despesa <= 0) return null;
  return { receita, receita_prevista: receita, tributaria, transferencias, outras: r2(receita - tributaria - transferencias),
    despesa, resultado: r2(receita - despesa), pessoal, custeio, investimento, divida, ...buckets, funcoes: funcoes.slice(0, 18) };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  const munis = JSON.parse(fs.readFileSync(path.join(__dirname, "sc_munis.json"), "utf8"));
  const tem = new Set((await db.query(`SELECT cod_ibge FROM entes_sc`)).rows.map((r) => r.cod_ibge));
  const faltam = munis.filter((m) => !tem.has(String(m.id)));
  console.log(`Recuperando ${faltam.length} municípios via DCA...`);
  let ok = 0, falha = 0;
  for (const m of faltam) {
    const cod = String(m.id);
    let gravou = false;
    for (const ano of ANOS) {
      const items = await getDCA(ano, cod);
      if (!items || !items.length) continue;
      const d = extrair(items);
      if (!d) continue;
      await db.query(
        `INSERT INTO financas_sc (cod_ibge,ano,receita,receita_prevista,tributaria,transferencias,outras,despesa,resultado,pessoal,custeio,investimento,divida,saude,educacao,seguranca,assistencia,infraestrutura,administracao,funcoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (cod_ibge,ano) DO UPDATE SET receita=EXCLUDED.receita,receita_prevista=EXCLUDED.receita_prevista,tributaria=EXCLUDED.tributaria,transferencias=EXCLUDED.transferencias,outras=EXCLUDED.outras,despesa=EXCLUDED.despesa,resultado=EXCLUDED.resultado,pessoal=EXCLUDED.pessoal,custeio=EXCLUDED.custeio,investimento=EXCLUDED.investimento,divida=EXCLUDED.divida,saude=EXCLUDED.saude,educacao=EXCLUDED.educacao,seguranca=EXCLUDED.seguranca,assistencia=EXCLUDED.assistencia,infraestrutura=EXCLUDED.infraestrutura,administracao=EXCLUDED.administracao,funcoes=EXCLUDED.funcoes`,
        [cod, ano, d.receita, d.receita_prevista, d.tributaria, d.transferencias, d.outras, d.despesa, d.resultado, d.pessoal, d.custeio, d.investimento, d.divida, d.saude, d.educacao, d.seguranca, d.assistencia, d.infraestrutura, d.administracao, JSON.stringify(d.funcoes)],
      );
      gravou = true;
    }
    if (gravou) {
      await db.query(`INSERT INTO entes_sc (cod_ibge,nome,uf,tipo,populacao) VALUES ($1,$2,'SC','M',NULL) ON CONFLICT (cod_ibge) DO UPDATE SET nome=EXCLUDED.nome`, [cod, m.nome]);
      ok++; console.log(`✓ ${m.nome}`);
    } else { falha++; console.log(`✗ ${m.nome} (sem DCA)`); }
  }
  const c = await db.query(`SELECT count(*) n FROM entes_sc WHERE tipo='M'`);
  console.log(`\nRecuperação: ok=${ok} | sem dados=${falha} | total municípios agora=${c.rows[0].n}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
