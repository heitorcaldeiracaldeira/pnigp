// ETL — Empenhos por contrato (PNCP, Lei 14.133). Endpoint /contratos/{ano}/{seq}/empenhos.
// Hoje a cobertura em SC é ~0 (municípios ainda não publicam o ciclo), mas o coletor "acende sozinho"
// quando passarem a publicar. Resumível: só rechecam contratos recentes não vistos há >14 dias.
// node scripts/ingest_empenhos_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();
const ANO_MIN = Number(process.env.ANO_MIN || ANO - 1); // só contratos recentes (onde o ciclo tende a aparecer)
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const d10 = (s) => (s ? String(s).slice(0, 10) : null);

async function buscarEmpenhos(cnpj, ano, seq) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${ano}/${seq}/empenhos`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return []; // sem empenho (rota válida, contrato vazio)
      if (!r.ok) throw 0;
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(1200 * (t + 1)); }
  }
  return null; // falha de rede — não marca como checado
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS empenhos_sc (
    cod_ibge TEXT, cnpj_compra TEXT, ano_compra INTEGER, seq_compra INTEGER, seq_empenho INTEGER,
    numero TEXT, valor NUMERIC, data DATE, raw JSONB, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj_compra, ano_compra, seq_compra, seq_empenho) )`);
  await db.query(`CREATE TABLE IF NOT EXISTS empenhos_check (cnpj_compra TEXT, ano_compra INTEGER, seq_compra INTEGER, checado timestamptz DEFAULT now(), n INTEGER DEFAULT 0, PRIMARY KEY (cnpj_compra, ano_compra, seq_compra))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  // ═══ RECUO PROGRESSIVO — PERGUNTAR DE NOVO O QUE JÁ DISSE "NÃO TENHO" CUSTAVA 35% DA JANELA ═══
  // Medido em 10/ago: 23.557 contratos consultados, 100% respondendo HTTP 404 "Nenhum empenho", ZERO
  // linhas gravadas — e 389 minutos por ciclo, mais que um terço das 18,7 h de TODAS as 138 fontes.
  // Conferido contra a API viva: o endpoint funciona e responde honestamente. Não é bug nosso nem
  // endpoint mudado — os municípios não publicam empenho no PNCP. O dado não existe na origem.
  // E o `interval '14 days'` fixo fazia as 23 mil perguntas se repetirem para sempre, com o catálogo
  // carimbando `ok` porque terminava sem erro. Era isso que enchia a janela noturna e deixava
  // cnes_profissionais, contratos, atas, arboviroses e cadprev_full sendo cortadas por falta de tempo.
  //
  // NÃO DESLIGA — RECUA. Contrato que ainda pode receber empenho continua sendo perguntado no mesmo
  // ritmo; o que já disse "não tenho" várias vezes e é de ano fechado passa a ser perguntado raramente:
  //   · já teve empenho alguma vez (n > 0)  → 14 dias, sempre (o volume pode crescer)
  //   · contrato do ano corrente            → 14 dias, sempre (está vivo, pode publicar a qualquer hora)
  //   · nunca teve, ano fechado             → 14 dias dobrando a cada tentativa vazia, teto de 1 ano
  // Assim uma publicação tardia ainda é encontrada — só que em semanas, não em 14 dias, e ao custo de
  // uma fração das requisições.
  await db.query(`ALTER TABLE empenhos_check ADD COLUMN IF NOT EXISTS tentativas INT DEFAULT 0`).catch(() => {});
  // ⚠️ As linhas que já existiam ficam com tentativas=0 pelo DEFAULT do ALTER, e sem isto NÃO recuariam:
  // o recuo começaria do zero justamente para os 23 mil contratos que já responderam "não tenho".
  // Não invento quantas vezes cada um foi perguntado — não sei. Carimbo o MÍNIMO PROVÁVEL: quem tem
  // `checado` preenchido e n=0 foi perguntado ao menos UMA vez. É o oposto do que fiz hoje cedo no
  // convenios, onde um DEFAULT now() carimbou todo mundo como "visto agora" e inventou um histórico.
  await db.query(`UPDATE empenhos_check SET tentativas = 1
                   WHERE tentativas = 0 AND checado IS NOT NULL AND coalesce(n,0) = 0`).catch(() => {});
  const ANO_HOJE = new Date().getUTCFullYear();
  const pend = (await db.query(`
    SELECT DISTINCT c.cnpj_compra cn, c.ano_compra an, c.seq_compra sq, c.cod_ibge
      FROM contratos_sc c
      LEFT JOIN empenhos_check k ON k.cnpj_compra=c.cnpj_compra AND k.ano_compra=c.ano_compra AND k.seq_compra=c.seq_compra
     WHERE c.cnpj_compra IS NOT NULL AND c.ano_compra >= $1
       AND (k.checado IS NULL OR k.checado < now() - (
             CASE WHEN coalesce(k.n,0) > 0        THEN interval '14 days'
                  WHEN c.ano_compra >= $2         THEN interval '14 days'
                  ELSE least(interval '14 days' * power(2, least(coalesce(k.tentativas,0), 5)),
                             interval '365 days')
             END))`, [ANO_MIN, ANO_HOJE]).catch(() => ({ rows: [] }))).rows;

  // quanto o recuo POUPOU — se a economia não aparecer, ninguém sabe que ela existe
  const alvo = (await db.query(`SELECT count(DISTINCT (cnpj_compra,ano_compra,seq_compra)) n FROM contratos_sc
    WHERE cnpj_compra IS NOT NULL AND ano_compra >= $1`, [ANO_MIN]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  console.log(`Empenhos: ${pend.length} contratos a verificar de ${Number(alvo).toLocaleString("pt-BR")} elegíveis (>= ${ANO_MIN})`);
  console.log(`  recuo progressivo poupou ${Number(alvo - pend.length).toLocaleString("pt-BR")} consultas nesta rodada`);
  let comEmp = 0, totalEmp = 0, proc = 0;
  for (const c of pend) {
    const emps = await buscarEmpenhos(c.cn, c.an, c.sq);
    if (emps == null) continue; // rede falhou — tenta na próxima
    let i = 0;
    for (const e of emps) {
      i++;
      await q(`INSERT INTO empenhos_sc (cod_ibge,cnpj_compra,ano_compra,seq_compra,seq_empenho,numero,valor,data,raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (cnpj_compra,ano_compra,seq_compra,seq_empenho) DO UPDATE SET numero=EXCLUDED.numero,valor=EXCLUDED.valor,data=EXCLUDED.data,raw=EXCLUDED.raw,atualizado=now()`,
        [c.cod_ibge, c.cn, c.an, c.sq, i, String(e.numeroEmpenho ?? e.numero ?? i), Number(e.valorEmpenho ?? e.valor ?? e.valorTotalEmpenho) || null, d10(e.dataEmpenho ?? e.data), JSON.stringify(e)]);
    }
    if (emps.length) { comEmp++; totalEmp += emps.length; }
    // `tentativas` é o que faz o recuo crescer: soma 1 a cada resposta vazia e ZERA quando enfim vem
    // empenho — assim um contrato que começou a publicar volta imediatamente ao ritmo curto.
    await q(`INSERT INTO empenhos_check (cnpj_compra,ano_compra,seq_compra,checado,n,tentativas)
             VALUES ($1,$2,$3,now(),$4, CASE WHEN $4 > 0 THEN 0 ELSE 1 END)
             ON CONFLICT (cnpj_compra,ano_compra,seq_compra) DO UPDATE SET checado=now(), n=EXCLUDED.n,
               tentativas = CASE WHEN EXCLUDED.n > 0 THEN 0 ELSE coalesce(empenhos_check.tentativas,0) + 1 END`,
      [c.cn, c.an, c.sq, emps.length]);
    proc++;
    if (proc % 50 === 0) console.log(`  …${proc}/${pend.length} (com empenho: ${comEmp})`);
    await sleep(120);
  }
  console.log(`Concluído: ${proc} verificados · ${comEmp} contratos com empenho · ${totalEmp} empenhos gravados.`);
  if (comEmp === 0) console.log("(cobertura 0 — municípios ainda não publicam o ciclo no PNCP; coletor pronto p/ acender quando publicarem)");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
