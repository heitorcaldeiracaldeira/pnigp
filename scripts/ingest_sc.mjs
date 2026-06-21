// Ingestão de dados OFICIAIS de Santa Catarina (SICONFI/Tesouro) para o banco.
// 295 municípios (lista IBGE) + Estado de SC. Anos 2021–2024. RREO Anexos 01 e 02.
// Idempotente (UPSERT). Uso: node scripts/ingest_sc.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { SG_UF, COD_ESTADO, NOME_ESTADO } from "./_uf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const ANOS = process.env.ANOS ? process.env.ANOS.split(",").map(Number) : [2021, 2022, 2023, 2024, 2025];
const FUNCS = ["Legislativa","Judiciária","Administração","Segurança Pública","Assistência Social","Previdência Social","Saúde","Educação","Cultura","Urbanismo","Habitação","Saneamento","Gestão Ambiental","Agricultura","Comércio e Serviços","Transporte","Desporto e Lazer","Encargos Especiais"];
const SIC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
// 28 funções de governo (Portaria 42/1999) — linhas no Anexo 02 que NÃO batem aqui são subfunções
const FUNC_SET = new Set(["Legislativa", "Judiciária", "Essencial à Justiça", "Administração", "Defesa Nacional", "Segurança Pública", "Relações Exteriores", "Assistência Social", "Previdência Social", "Saúde", "Trabalho", "Educação", "Cultura", "Direitos da Cidadania", "Urbanismo", "Habitação", "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia", "Agricultura", "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações", "Energia", "Transporte", "Desporto e Lazer", "Encargos Especiais", "Reserva de Contingência"].map((s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()));

async function getJson(ano, esfera, idEnte, anexo) {
  const url = `${SIC}?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=${encodeURIComponent(anexo)}&co_esfera=${esfera}&id_ente=${idEnte}`;
  for (let t = 0; t < 4; t++) {
    try {
      const ctrl = AbortSignal.timeout(45000);
      const r = await fetch(url, { signal: ctrl });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      return j.items || [];
    } catch (e) {
      await new Promise((s) => setTimeout(s, 600 * (t + 1)));
    }
  }
  return null; // falhou
}

function extrair(a01, a02) {
  const recA = (f) => { const r = a01.find((x) => /Até o Bimestre \(c\)/i.test(x.coluna) && norm(x.conta) === norm(f)); return r ? +r.valor : 0; };
  const recPrev = (f) => { const r = a01.find((x) => /PREVIS.O ATUALIZADA \(a\)/i.test(x.coluna) && norm(x.conta) === norm(f)); return r ? +r.valor : 0; };
  const dCat = (f) => a01.filter((x) => /DESPESAS EMPENHADAS AT. O BIMESTRE \(f\)/i.test(x.coluna) && norm(x.conta) === norm(f)).reduce((s, x) => s + +x.valor, 0);
  const emp = {}, dot = {};
  for (const x of a02) {
    if (/DESPESAS EMPENHADAS AT. O BIMESTRE \(b\)/i.test(x.coluna)) emp[norm(x.conta)] = (emp[norm(x.conta)] || 0) + +x.valor;
    if (/DOTA..O ATUALIZADA \(a\)/i.test(x.coluna)) dot[norm(x.conta)] = (dot[norm(x.conta)] || 0) + +x.valor;
  }
  const fb = (f) => r2(emp[norm(f)] || 0);
  const receita = recA("RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)");
  const trib = recA("Impostos, Taxas e Contribuições de Melhoria");
  const transf = recA("Transferências Correntes") + recA("Transferências de Capital");
  // despesa OFICIAL: total empenhado "EXCETO INTRA-ORÇAMENTÁRIAS" (consistente com a receita, que também exclui intra).
  // Fallback p/ soma das funções só se a linha-total não vier. Antes somávamos funções (incluía intra → inflava ~5%).
  const despesaOficial = emp[norm("DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)")] || 0;
  const despesa = r2(despesaOficial > 0 ? despesaOficial : FUNCS.reduce((s, f) => s + (emp[norm(f)] || 0), 0));
  // árvore função → subfunção (ordem do Anexo 02; subfunção pertence à função mais recente)
  const ordem = [], vistos = new Set();
  for (const x of a02) {
    if (!/DESPESAS EMPENHADAS AT. O BIMESTRE \(b\)/i.test(x.coluna)) continue;
    const c = (x.conta || "").trim(), k = norm(c);
    if (!c || /^despesas \(|^total \(/i.test(c) || vistos.has(k)) continue;
    vistos.add(k); ordem.push({ nome: c, key: k, emp: r2(+x.valor || 0) });
  }
  const arvore = []; let curFunc = null;
  for (const o of ordem) {
    const node = { nome: o.nome, dotacao: r2(dot[o.key] || 0), empenhado: o.emp };
    if (FUNC_SET.has(o.key)) { node.filhos = []; arvore.push(node); curFunc = node; }
    else if (curFunc) curFunc.filhos.push(node);
  }
  const funcoes = arvore.filter((f) => f.dotacao > 0 || f.empenhado > 0).sort((a, b) => b.dotacao - a.dotacao);
  // RECEITA — "de onde vem o dinheiro": grupos × fontes (previsto × arrecadado)
  const RECG = [
    ["Receita própria", ["Impostos", "Taxas", "Contribuição de Melhoria", "Receita Patrimonial", "Receita de Serviços", "Outras Receitas Correntes"]],
    ["Transferências", ["Transferências da União e de suas Entidades", "Transferências dos Estados e do Distrito Federal e de suas Entidades", "Transferências de Outras Instituições Públicas", "Transferências dos Municípios e de suas Entidades"]],
    ["Contribuições", ["Contribuições Sociais", "Contribuições Econômicas"]],
    ["Receitas de capital", ["Operações de Crédito", "Alienação de Bens", "Amortizações de Empréstimos", "Transferências de Capital"]],
  ];
  const receitas = RECG.map(([nome, leaves]) => {
    const filhos = leaves.map((l) => ({ nome: l, previsto: r2(recPrev(l)), arrecadado: r2(recA(l)) })).filter((f) => f.arrecadado > 0 || f.previsto > 0);
    return { nome, previsto: r2(filhos.reduce((s, f) => s + f.previsto, 0)), arrecadado: r2(filhos.reduce((s, f) => s + f.arrecadado, 0)), filhos };
  }).filter((g) => g.arrecadado > 0 || g.previsto > 0);
  return {
    receitas,
    receita: r2(receita), receita_prevista: r2(recPrev("RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)")),
    tributaria: r2(trib), transferencias: r2(transf), outras: r2(receita - trib - transf),
    despesa, resultado: r2(receita - despesa),
    pessoal: r2(dCat("PESSOAL E ENCARGOS SOCIAIS")), custeio: r2(dCat("OUTRAS DESPESAS CORRENTES")),
    investimento: r2(dCat("INVESTIMENTOS") + dCat("INVERSÕES FINANCEIRAS")), divida: r2(dCat("JUROS E ENCARGOS DA DÍVIDA") + dCat("AMORTIZAÇÃO DA DÍVIDA")),
    saude: fb("Saúde"), educacao: fb("Educação"), seguranca: fb("Segurança Pública"), assistencia: fb("Assistência Social"),
    infraestrutura: r2(fb("Urbanismo") + fb("Saneamento") + fb("Habitação") + fb("Gestão Ambiental") + fb("Transporte")),
    administracao: r2(fb("Administração") + fb("Legislativa") + fb("Judiciária")),
    funcoes,
  };
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
      done++;
      if (done % 20 === 0) console.log(`  …${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS entes_sc (
      cod_ibge TEXT PRIMARY KEY, nome TEXT NOT NULL, uf TEXT NOT NULL,
      tipo CHAR(1) NOT NULL, populacao INTEGER );
    CREATE TABLE IF NOT EXISTS financas_sc (
      cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL,
      receita NUMERIC(16,2), receita_prevista NUMERIC(16,2), tributaria NUMERIC(16,2),
      transferencias NUMERIC(16,2), outras NUMERIC(16,2), despesa NUMERIC(16,2), resultado NUMERIC(16,2),
      pessoal NUMERIC(16,2), custeio NUMERIC(16,2), investimento NUMERIC(16,2), divida NUMERIC(16,2),
      saude NUMERIC(16,2), educacao NUMERIC(16,2), seguranca NUMERIC(16,2), assistencia NUMERIC(16,2),
      infraestrutura NUMERIC(16,2), administracao NUMERIC(16,2), funcoes JSONB,
      PRIMARY KEY (cod_ibge, ano) );
  `);
  await client.query(`ALTER TABLE financas_sc ADD COLUMN IF NOT EXISTS receitas JSONB`); // árvore "de onde vem o dinheiro"

  const munis = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "sc_munis.json"), "utf8"));
  const entes = [
    { cod: COD_ESTADO, esfera: "E", tipo: "E", nome: `Estado de ${NOME_ESTADO}` },
    ...munis.map((m) => ({ cod: String(m.id), esfera: "M", tipo: "M", nome: m.nome })),
  ];
  console.log(`Ingerindo ${entes.length} entes (1 estado + ${munis.length} municípios) × ${ANOS.length} anos...`);

  let okEntes = 0, semDados = 0;
  await pool(entes, 6, async (e) => {
    let pop = null, gravou = false;
    for (const ano of ANOS) {
      const [a01, a02] = await Promise.all([
        getJson(ano, e.esfera, e.cod, "RREO-Anexo 01"),
        getJson(ano, e.esfera, e.cod, "RREO-Anexo 02"),
      ]);
      if (!a01 || !a02 || !a01.length || !a02.length) continue;
      if (a01[0]?.populacao) pop = a01[0].populacao;
      const d = extrair(a01, a02);
      if (d.receita <= 0 && d.despesa <= 0) continue;
      await client.query(
        `INSERT INTO financas_sc (cod_ibge,ano,receita,receita_prevista,tributaria,transferencias,outras,despesa,resultado,pessoal,custeio,investimento,divida,saude,educacao,seguranca,assistencia,infraestrutura,administracao,funcoes,receitas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (cod_ibge,ano) DO UPDATE SET receita=EXCLUDED.receita,receita_prevista=EXCLUDED.receita_prevista,tributaria=EXCLUDED.tributaria,transferencias=EXCLUDED.transferencias,outras=EXCLUDED.outras,despesa=EXCLUDED.despesa,resultado=EXCLUDED.resultado,pessoal=EXCLUDED.pessoal,custeio=EXCLUDED.custeio,investimento=EXCLUDED.investimento,divida=EXCLUDED.divida,saude=EXCLUDED.saude,educacao=EXCLUDED.educacao,seguranca=EXCLUDED.seguranca,assistencia=EXCLUDED.assistencia,infraestrutura=EXCLUDED.infraestrutura,administracao=EXCLUDED.administracao,funcoes=EXCLUDED.funcoes,receitas=EXCLUDED.receitas`,
        [e.cod, ano, d.receita, d.receita_prevista, d.tributaria, d.transferencias, d.outras, d.despesa, d.resultado, d.pessoal, d.custeio, d.investimento, d.divida, d.saude, d.educacao, d.seguranca, d.assistencia, d.infraestrutura, d.administracao, JSON.stringify(d.funcoes), JSON.stringify(d.receitas)],
      );
      gravou = true;
    }
    if (gravou) {
      await client.query(
        `INSERT INTO entes_sc (cod_ibge,nome,uf,tipo,populacao) VALUES ($1,$2,'SC',$3,$4)
         ON CONFLICT (cod_ibge) DO UPDATE SET nome=EXCLUDED.nome,populacao=EXCLUDED.populacao`,
        [e.cod, e.nome, e.tipo, pop],
      );
      okEntes++;
    } else semDados++;
  });

  const c = await client.query(`SELECT (SELECT count(*) FROM entes_sc) e, (SELECT count(*) FROM financas_sc) f`);
  console.log(`Ingestão concluída: entes=${c.rows[0].e} | linhas finanças=${c.rows[0].f} | ok=${okEntes} | sem dados=${semDados}`);
  await client.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
