// ETL — Itens dos processos licitatórios (PNCP API principal) persistidos no Neon.
// Lê as maiores contratações (compras_sc.top) de cada ente e grava os itens (descrição, qtd,
// unitário estimado×homologado, fornecedor/CNPJ/porte, LC123). Idempotente, resumível.
// node scripts/ingest_itens_sc.mjs   (env ANO opcional p/ um ano; padrão = último ano por ente)
import { INGEST_VERSAO } from "./ingest_versao.mjs";
import { CAMPOS_ITEM, DDL_ITEM } from "./campos_item_pncp.mjs";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP_MAIN = "https://pncp.gov.br/api/pncp/v1";
// VELOCIDADE: o gargalo é HTTP, não o Neon (medido 2026-07-15: Neon com 3 conexões de 901, 0 query ativa, 0 lock;
// o INSERT já é 1 por processo, em lote). O custo é ~1,1 MILHÃO de GETs em /resultados — um por item premiado.
// CONC=2 era o freio: 2 processos por vez. O backoff de 429 (até ~32s, 8 tentativas) segura a subida.
const CONC = Number(process.env.CONC || 8);   // processos em paralelo
const CONC_RES = Number(process.env.CONC_RES || 12);   // GETs de /resultados em paralelo DENTRO de cada processo
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
// helpers do espelho de /resultados
const num = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const dtz = (s) => (s ? String(s).slice(0, 19) : null);

async function getMain(url) {
  for (let t = 0; t < 8; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }   // 429 agressivo do PNCP: backoff longo (até ~32s)
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;   // esgotou (429/timeout persistente) — o chamador NÃO deve marcar feito
}

const CAP_RES = Number(process.env.CAP_RES || 5000); // teto de buscas de homologado por compra (atas podem ter ~20k itens)
async function fetchItens(cnpj, ano, seq) {
  // paginação completa dos itens (default da API é 10!) — pega TODOS, mesmo atas com milhares
  const base = `${PNCP_MAIN}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`;
  const itens = []; let p = 1;
  while (p <= 60) {
    const pg = await getMain(`${base}?pagina=${p}&tamanhoPagina=500`);
    if (pg === null) throw new Error("fetch itens falhou (429/timeout) — retenta no re-run");  // NÃO marca feito
    if (!pg.length) break;                                                                     // genuinamente sem mais itens
    itens.push(...pg);
    if (pg.length < 500) break;
    p++;
  }
  if (!itens.length) return [];
  // homologado só dos itens premiados (temResultado), com concorrência; cap c/ log honesto
  const premiados = itens.filter((it) => it.temResultado);
  const alvo = premiados.slice(0, CAP_RES);
  if (premiados.length > CAP_RES) console.log(`  ${cnpj}/${ano}/${seq}: ${premiados.length} itens c/ resultado — homologado coletado dos ${CAP_RES} primeiros (cap)`);
  // 🔴 /resultados é LISTA — "Consultar RESULTADOS" (plural) no endpoint, "Lista de Resultados — Agrupador de
  // Resultados de um Item da Compra" no Manual de Integração, e existe /resultados/{sequencialResultado}.
  // O código guardava `r[0]` e DESCARTAVA o resto (medido: ~8% dos resultados perdidos; itens com 3, 5 e até 67).
  // A causa foi uma frase ERRADA no nosso docs/arquitetura-pncp.md ("só o vencedor") — já corrigida lá.
  // Agora: TODOS os resultados vão p/ item_resultado_sc (espelho da entidade); itens_sc mantém o 1º achatado
  // (compatibilidade com as queries de produção — não muda comportamento de quem já lê itens_sc).
  const resMap = new Map();     // numeroItem -> resultado[0]  (achatado em itens_sc, como antes)
  const resTodos = [];          // TODOS os resultados -> item_resultado_sc
  let i = 0;
  await Promise.all(Array.from({ length: CONC_RES }, async () => {
    while (i < alvo.length) {
      const it = alvo[i++];
      const r = await getMain(`${base}/${it.numeroItem}/resultados`).catch(() => null);
      if (!Array.isArray(r) || !r.length) continue;
      resMap.set(it.numeroItem, r[0]);
      for (const x of r) resTodos.push({ numeroItem: it.numeroItem, r: x });
    }
  }));
  // OS 36 CAMPOS vêm do mapa declarativo (campos_item_pncp.mjs) — origem = destino. O que sobra aqui é só o que
  // NÃO vem de /itens: os campos do vencedor, que vêm de /resultados, e a economia, que é derivada dos dois.
  // 🔴 `beneficio_lc` (legado) gravava só o NOME e descartava "sem benefício" → EXCLUSIVO(1) e UNIVERSAL(4)
  // ficavam indistinguíveis. Mantido p/ compatibilidade das queries antigas; o certo é `tipo_beneficio_id`.
  const saida = itens.map((it, idx) => {
    const r = resMap.get(it.numeroItem) || null;
    const unitEst = Number(it.valorUnitarioEstimado) || 0;
    const unitHom = r ? Number(r.valorUnitarioHomologado) || Number(r.valorUnitario) || 0 : 0;
    const benef = String(it.tipoBeneficioNome || "");
    const linha = {};
    for (const [col, , fn] of CAMPOS_ITEM) linha[col] = fn(it, idx);
    linha.unit_homologado = unitHom > 0 ? unitHom : null;
    linha.fornecedor = r ? String(r.nomeRazaoSocialFornecedor || r.niFornecedor || "").slice(0, 160) || null : null;
    linha.cnpj_fornecedor = r ? String(r.niFornecedor || "") || null : null;
    linha.porte_fornecedor = r ? String(r.porteFornecedorNome || r.porteFornecedor || "") || null : null;
    linha.beneficio_lc = benef && !/nenhum|não|nao|sem benef/i.test(benef) ? benef : null;
    linha.economia_pct = unitEst > 0 && unitHom > 0 ? Math.round(((unitEst - unitHom) / unitEst) * 1000) / 10 : null;
    return linha;
  });
  saida.__resultados = resTodos;   // TODOS os resultados (espelho de /resultados) — anexado ao array RETORNADO
  return saida;
}

async function pool(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 20 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 90000, statement_timeout: 90000 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS itens_sc (
      cod_ibge TEXT, cnpj TEXT, ano INTEGER, seq INTEGER, numero INTEGER,
      descricao TEXT, unidade TEXT, quantidade NUMERIC, unit_estimado NUMERIC, unit_homologado NUMERIC,
      fornecedor TEXT, cnpj_fornecedor TEXT, porte_fornecedor TEXT, beneficio_lc TEXT, economia_pct NUMERIC,
      ncm TEXT, catmat TEXT, tipo TEXT, situacao TEXT,
      PRIMARY KEY (cnpj, ano, seq, numero) );
    CREATE INDEX IF NOT EXISTS idx_itens_proc ON itens_sc (cnpj, ano, seq);
    CREATE INDEX IF NOT EXISTS idx_itens_catmat ON itens_sc (catmat) WHERE catmat IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_itens_ncm ON itens_sc (ncm) WHERE ncm IS NOT NULL;
    CREATE TABLE IF NOT EXISTS itens_sc_feitos (cod_ibge TEXT, ano INTEGER, PRIMARY KEY (cod_ibge, ano));

    -- ESPELHO da entidade RESULTADO do PNCP (/itens/{numeroItem}/resultados — "Consultar RESULTADOS", plural).
    -- Um item tem N resultados (credenciamento, cotações de dispensa, SRP): medidos itens com 3, 5 e até 67.
    -- itens_sc guarda só o 1º achatado (compat. das queries de produção); o conjunto COMPLETO vive aqui.
    -- Chave = a do PNCP + sequencialResultado (existe /resultados/{sequencialResultado} no spec).
    CREATE TABLE IF NOT EXISTS item_resultado_sc (
      cod_ibge TEXT, cnpj TEXT, ano INTEGER, seq INTEGER, numero INTEGER, sequencial_resultado INTEGER,
      ni_fornecedor TEXT, nome_razao_social_fornecedor TEXT, tipo_pessoa TEXT,
      quantidade_homologada NUMERIC, valor_unitario_homologado NUMERIC, valor_total_homologado NUMERIC,
      percentual_desconto NUMERIC, porte_fornecedor_nome TEXT, natureza_juridica_nome TEXT,
      ordem_classificacao_srp INTEGER, situacao_resultado TEXT, indicador_subcontratacao BOOLEAN,
      data_resultado DATE, data_cancelamento TIMESTAMPTZ, motivo_cancelamento TEXT,
      atualizado timestamptz DEFAULT now(),
      PRIMARY KEY (cnpj, ano, seq, numero, sequencial_resultado) );
    CREATE INDEX IF NOT EXISTS idx_item_res_proc ON item_resultado_sc (cnpj, ano, seq);
    CREATE INDEX IF NOT EXISTS idx_item_res_forn ON item_resultado_sc (ni_fornecedor);`);
  // OS 36 CAMPOS do item (campos_item_pncp.mjs) — ADD COLUMN IF NOT EXISTS, não destrói nada.
  // Antes guardávamos 8 de 36. Os 28 que faltavam incluem `tipo_beneficio_id` (item EXCLUSIVO ME/EPP × UNIVERSAL),
  // `criterio_julgamento_id` (muda o significado do preço), `orcamento_sigiloso` (trava do cálculo de disputa) e
  // `informacao_complementar` (munição p/ o CATMAT). Ver o mapa p/ o porquê de cada um.
  await db.query(`ALTER TABLE itens_sc ${DDL_ITEM}`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_itens_beneficio ON itens_sc (tipo_beneficio_id) WHERE tipo_beneficio_id IS NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_itens_criterio ON itens_sc (criterio_julgamento_id) WHERE criterio_julgamento_id IS NOT NULL`);
  const q = async (sql, params) => { for (let t = 0; t < 12; t++) { try { return await db.query(sql, params); } catch { await sleep(1500 * (t + 1)); } } throw new Error("db indisponível"); };
  // universo COMPLETO: todos os processos do PNCP em SC (processos_sc)
  await db.query(`CREATE TABLE IF NOT EXISTS itens_proc_feitos (numero_controle TEXT PRIMARY KEY, n INTEGER, feito_em timestamptz DEFAULT now())`);
  // ─── ESTADO COM VERSÃO ────────────────────────────────────────────────────────────────────────────────────────
  // 🔴 A ARMADILHA QUE ME PEGOU 3× EM 2026-07-15: marcador de "feito" sem versão faz o conserto NÃO ACONTECER.
  // Prova: corrigi o `r[0]` (só o 1º resultado entrava; ~8% descartados), escrevi o INSERT em item_resultado_sc…
  // e a tabela ficou com ZERO linhas — os 241.302 processos já estavam marcados feitos e o ingest pulou todos.
  // Código certo, dado velho, e eu declarando "corrigido". Igualzinho ao marca_ata_feitas das atas.
  // Agora: SOBE INGEST_VERSAO quando mudar o que se extrai → tudo vira pendente sozinho, sem limpeza manual.
  await db.query(`ALTER TABLE itens_proc_feitos ADD COLUMN IF NOT EXISTS versao INT`);
  // 🔴 SEM `.catch(() => ({rows:[]}))` — o catch silencioso daqui fez o ingest reportar "0 processos pendentes
  // (de 0 no PNCP/SC)", concluir e SAIR COM CÓDIGO 0 (sucesso), com `processos_sc` tendo 241.302 linhas.
  // Tarefa verde, zero trabalho, e a mensagem do erro real apagada — nem dava p/ saber o que falhou.
  // Terceira vez que catch silencioso morde no mesmo dia (2026-07-15). A regra já está na memória do projeto:
  // erro de dado/schema falha NA HORA; retry cego é só p/ transitório.
  // 🔴 LER A TABELA, NÃO A VIEW (2026-07-15). `processos_sc` é uma VIEW tão pesada que nem `count(*)` volta em 120s.
  // Empilhavam-se TRÊS erros e nenhum gritava:
  //   1. a view estourava o query_timeout de 90s do pool;
  //   2. o `.catch(() => ({rows:[]}))` daqui virava o timeout em "0 processos pendentes";
  //   3. o ingest concluía e saía com CÓDIGO 0 — tarefa agendada verde, zero trabalho, por rodadas a fio.
  // `contratacoes_sc` é a TABELA por trás: mesmas 241.302 linhas, count em 266ms (vs. >120s da view). Mesmo
  // `numero_controle` que a view expunha → o estado de retomada (itens_proc_feitos) segue casando.
  // Sem `.catch`: universo vazio é ANOMALIA, não sucesso.
  // CONEXÃO DEDICADA: o pool tem query_timeout=90s (certo p/ os INSERTs por processo), mas puxar as 241.302 linhas
  // da listagem estoura isso — é UMA varredura por rodada e merece teto próprio (10 min). Trocar a view pela tabela
  // sem trocar o timeout NÃO resolve: os dois erros são independentes e me morderam em sequência.
  const lst = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 600000, query_timeout: 600000 });
  await lst.connect();
  const procs = (await lst.query(`SELECT numero_controle, cod_ibge, cnpj, ano, seq
    FROM contratacoes_sc WHERE cnpj IS NOT NULL AND seq IS NOT NULL AND numero_controle IS NOT NULL`)).rows;
  if (!procs.length) { await lst.end(); throw new Error("contratacoes_sc devolveu 0 linhas — universo vazio é ANOMALIA, não sucesso"); }
  // mesma conexão dedicada: hoje devolve poucas linhas, mas CRESCE até 241 mil conforme a coleta avança —
  // no pool de 90s ela quebraria no meio do caminho, quando já houvesse trabalho feito p/ perder.
  const feitos = new Set((await lst.query(`SELECT numero_controle FROM itens_proc_feitos WHERE versao = $1`, [INGEST_VERSAO])).rows.map((r) => r.numero_controle));
  await lst.end();
  const pend = procs.filter((p) => !feitos.has(p.numero_controle));
  console.log(`Itens: ${pend.length} processos pendentes (de ${procs.length} no PNCP/SC) · INGEST_VERSAO=${INGEST_VERSAO}`);
  let comItens = 0;
  await pool(pend, CONC, async (e) => {
    try {
      const itens = await fetchItens(e.cnpj, e.ano, e.seq);
      const n = itens.length;
      if (n > 0) {
        // LOTE: 1 INSERT por processo (não por item) — corta as requisições ao Neon em N× e evita a queda por bombardeio.
        // SQL GERADO do mapa (campos_item_pncp) + os campos do vencedor (/resultados) e a economia (derivada).
        // Gerar em vez de escrever à mão: 40 `unnest` posicionais é onde eu trocaria dois de lugar — o que NÃO dá
        // erro de sintaxe, dá dado errado e silencioso. Aqui coluna e campo da API andam colados.
        const EXTRA = [["unit_homologado", "numeric"], ["fornecedor", "text"], ["cnpj_fornecedor", "text"],
          ["porte_fornecedor", "text"], ["beneficio_lc", "text"], ["economia_pct", "numeric"]];
        const COLS = [...CAMPOS_ITEM.map(([c, t]) => [c, t]), ...EXTRA];
        const arrays = COLS.map(([c]) => itens.map((it) => it[c] ?? null));
        const listaCols = COLS.map(([c]) => c).join(",");
        const unnests = COLS.map(([, t], i) => `$${i + 5}::${t}[]`).join(",");
        const tCols = COLS.map(([c]) => c).join(",");
        // `numero` é chave — nunca no SET. O resto atualiza (reprocesso tem que poder corrigir dado velho).
        const sets = COLS.filter(([c]) => c !== "numero").map(([c]) => `${c}=EXCLUDED.${c}`).join(",");
        await q(`INSERT INTO itens_sc (cod_ibge,cnpj,ano,seq,${listaCols})
                 SELECT $1,$2,$3,$4, t.* FROM unnest(${unnests}) AS t(${tCols})
                 ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET ${sets}`,
          [e.cod_ibge, e.cnpj, e.ano, e.seq, ...arrays]);

        // ESPELHO: TODOS os resultados do item (antes só o [0] entrava, achatado em itens_sc — ~8% descartados)
        const R = itens.__resultados || [];
        if (R.length) {
          const B = { num: [], sr: [], ni: [], nome: [], tp: [], qh: [], vu: [], vt: [], pd: [], porte: [], nj: [], ord: [], sit: [], sub: [], dr: [], dc: [], mc: [] };
          for (const { numeroItem, r } of R) {
            B.num.push(Number(numeroItem)); B.sr.push(Number(r.sequencialResultado) || 1);
            B.ni.push(r.niFornecedor || null); B.nome.push(String(r.nomeRazaoSocialFornecedor || "").slice(0, 160) || null);
            B.tp.push(r.tipoPessoa || null); B.qh.push(num(r.quantidadeHomologada)); B.vu.push(num(r.valorUnitarioHomologado));
            B.vt.push(num(r.valorTotalHomologado)); B.pd.push(num(r.percentualDesconto));
            B.porte.push(r.porteFornecedorNome || null); B.nj.push(String(r.naturezaJuridicaNome || "").slice(0, 120) || null);
            B.ord.push(r.ordemClassificacaoSrp != null ? Number(r.ordemClassificacaoSrp) : null);
            B.sit.push(r.situacaoCompraItemResultadoNome || null); B.sub.push(r.indicadorSubcontratacao === true);
            B.dr.push(r.dataResultado || null); B.dc.push(dtz(r.dataCancelamento)); B.mc.push(String(r.motivoCancelamento || "").slice(0, 200) || null);
          }
          await q(`INSERT INTO item_resultado_sc (cod_ibge,cnpj,ano,seq,numero,sequencial_resultado,ni_fornecedor,
              nome_razao_social_fornecedor,tipo_pessoa,quantidade_homologada,valor_unitario_homologado,valor_total_homologado,
              percentual_desconto,porte_fornecedor_nome,natureza_juridica_nome,ordem_classificacao_srp,situacao_resultado,
              indicador_subcontratacao,data_resultado,data_cancelamento,motivo_cancelamento)
            SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::int[],$7::text[],$8::text[],$9::text[],$10::numeric[],$11::numeric[],
              $12::numeric[],$13::numeric[],$14::text[],$15::text[],$16::int[],$17::text[],$18::bool[],$19::date[],$20::timestamptz[],$21::text[])
              AS t(numero,sequencial_resultado,ni_fornecedor,nome_razao_social_fornecedor,tipo_pessoa,quantidade_homologada,
                   valor_unitario_homologado,valor_total_homologado,percentual_desconto,porte_fornecedor_nome,natureza_juridica_nome,
                   ordem_classificacao_srp,situacao_resultado,indicador_subcontratacao,data_resultado,data_cancelamento,motivo_cancelamento)
            ON CONFLICT (cnpj,ano,seq,numero,sequencial_resultado) DO UPDATE SET
              ni_fornecedor=EXCLUDED.ni_fornecedor, nome_razao_social_fornecedor=EXCLUDED.nome_razao_social_fornecedor,
              quantidade_homologada=EXCLUDED.quantidade_homologada, valor_unitario_homologado=EXCLUDED.valor_unitario_homologado,
              valor_total_homologado=EXCLUDED.valor_total_homologado, situacao_resultado=EXCLUDED.situacao_resultado,
              ordem_classificacao_srp=EXCLUDED.ordem_classificacao_srp, atualizado=now()`,
            [e.cod_ibge, e.cnpj, e.ano, e.seq, B.num, B.sr, B.ni, B.nome, B.tp, B.qh, B.vu, B.vt, B.pd, B.porte, B.nj, B.ord, B.sit, B.sub, B.dr, B.dc, B.mc]);
        }
        // todo processo tem ≥1 item: só marca FEITO com n>0 (n=0 = fetch vazio/anomalia → fica pendente, retenta)
        await q(`INSERT INTO itens_proc_feitos (numero_controle,n,versao) VALUES ($1,$2,$3)
          ON CONFLICT (numero_controle) DO UPDATE SET n=EXCLUDED.n, versao=EXCLUDED.versao, feito_em=now()`,
          [e.numero_controle, n, INGEST_VERSAO]); comItens++;
      }
    } catch (err) { console.log(`  ! falha ${e.numero_controle} (${String(err).slice(0, 35)})`); }
  });
  const c = await db.query(`SELECT count(*) n, count(DISTINCT (cnpj,ano,seq)) p FROM itens_sc`);
  console.log(`Concluído: ${comItens} processos c/ itens nesta rodada | total ${c.rows[0].n} itens em ${c.rows[0].p} processos`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
