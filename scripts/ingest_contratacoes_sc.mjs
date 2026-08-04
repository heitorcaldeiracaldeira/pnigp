// RAIO-X ESTRUTURADO do processo licitatório — metadata oficial do PNCP, via endpoint de LISTAGEM EM LOTE
// (/contratacoes/publicacao por data+UF+modalidade, até 500/página) → MUITO menos requisições que 1 chamada/compra.
// Por compra guarda: PLATAFORMA (usuarioNome, chave p/ rotear o parser de ata), MODALIDADE, modo de disputa, SRP,
// instrumento, valor ESTIMADO × HOMOLOGADO (economia real), datas, situação. Grava contratacoes_sc (cnpj/ano/seq),
// idempotente (UPSERT) e RESUMÍVEL por janela (mês×modalidade) em _raiox_janela. Backoff em 429. node scripts/ingest_raiox_pncp_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { upsertContratacao } from "./lib_contratacao_upsert.mjs";   // mapeamento único, compartilhado com o incremental
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
// STATE-AGNOSTIC: a UF vem do ambiente (default SC). `UF=SP node scripts/ingest_contratacoes_sc.mjs` replica o
// pipeline inteiro — o PNCP é nacional e o cod_ibge já identifica o estado. Ver [[pnigp-replicacao-uf-sp]].
const UF = (process.env.UF || "SC").toUpperCase();
const MODALIDADES = (process.env.MODALIDADES || "1,2,3,4,5,6,7,8,9,10,11,12,13").split(",").map(Number);
const ANO_INI = Number(process.env.ANO_INI || 2024);
const ANO_FIM = Number(process.env.ANO_FIM || 2026);
const num = (x) => (x == null || x === "" ? null : Number(x));
const dt = (s) => (s ? String(s).slice(0, 19) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// meses do período (yyyyMM01..fim do mês)
function janelas() {
  const out = [];
  for (let a = ANO_INI; a <= ANO_FIM; a++) for (let m = 1; m <= 12; m++) {
    const ini = `${a}${String(m).padStart(2, "0")}01`;
    const fimDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    out.push({ ano: a, mes: m, ini, fim: `${a}${String(m).padStart(2, "0")}${String(fimDia).padStart(2, "0")}` });
  }
  return out;
}
// ⚠️ "VAZIO" E "NÃO CONSEGUI FALAR" NÃO SÃO A MESMA COISA.
// Antes, 503/timeout/429 persistente devolviam `{data: [], totalPaginas: 0}` — idêntico a uma janela legitimamente
// vazia. O laço então gravava a janela em `_raiox_janela` como FEITA e imprimia "✔ 0 compras gravadas". Em mês
// fechado isso é PERDA SILENCIOSA E PERMANENTE: o resume passa a acreditar que o mês foi coletado e nunca volta lá.
// Aconteceu duas vezes em 04/ago/2026 com o PNCP instável — só foi notado porque estranhei o zero e conferi na API.
// Agora toda resposta carrega `erro`: quem chama decide, e janela com erro NÃO é marcada como feita.
async function getBulk(mod, ini, fim, pagina) {
  const url = `${CONS}?dataInicial=${ini}&dataFinal=${fim}&codigoModalidadeContratacao=${mod}&uf=${UF}&pagina=${pagina}&tamanhoPagina=50`;
  let ultimo = "";
  for (let t = 0; ; t++) {
    let r;
    try { r = await fetch(url, { signal: AbortSignal.timeout(25000) }); }
    catch (e) { ultimo = e.message; if (t >= 5) return { data: [], totalPaginas: 0, erro: `rede: ${ultimo}` }; await sleep(3000 * (t + 1)); continue; }
    if (r.status === 429) { ultimo = "429"; if (t >= 8) return { data: [], totalPaginas: 0, erro: "429 persistente" }; await sleep(8000 * (t + 1)); continue; }
    if (r.status === 204) return { data: [], totalPaginas: 0, erro: null };   // vazio LEGÍTIMO: a API respondeu
    if (!r.ok) { ultimo = `HTTP ${r.status}`; if (t >= 3) return { data: [], totalPaginas: 0, erro: ultimo }; await sleep(2000 * (t + 1)); continue; }
    try { const j = await r.json(); return { ...j, erro: null }; }
    catch (e) { return { data: [], totalPaginas: 0, erro: `json: ${e.message}` }; }
  }
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await sleep(1200 * (i + 1)); } } };
  await q(`CREATE TABLE IF NOT EXISTS contratacoes_sc (
    cod_ibge TEXT, cnpj TEXT, ano INT, seq INT, esfera TEXT, plataforma TEXT, modalidade_id INT, modalidade TEXT, modo_disputa TEXT,
    srp BOOLEAN, instrumento TEXT, valor_estimado NUMERIC, valor_homologado NUMERIC, economia_pct NUMERIC,
    numero_compra TEXT, processo TEXT, objeto TEXT, situacao TEXT, emenda_parlamentar BOOLEAN,
    amparo_legal TEXT, data_publicacao TEXT, data_abertura TEXT, data_encerramento TEXT, atualizado timestamptz DEFAULT now(),
    numero_controle TEXT GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text, 6, '0') || '/' || ano) STORED,
    PRIMARY KEY (cnpj, ano, seq))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_raiox_cod ON contratacoes_sc (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_raiox_plat ON contratacoes_sc (plataforma)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS ix_contratacoes_nc ON contratacoes_sc (numero_controle)`);
  // compat: processos_sc é uma VIEW sobre contratacoes_sc (entidade absorvida); recria se sumir
  await q(`CREATE OR REPLACE VIEW processos_sc AS SELECT cnpj AS cnpj_orgao, ano, seq AS sequencial, cod_ibge, numero_controle, modalidade_id, modalidade, objeto, valor_estimado, situacao, data_publicacao AS data_pub FROM contratacoes_sc`).catch(() => {});
  // ⚠️ A janela de retomada TEM QUE incluir a UF. Sem isso, rodar UF=SP encontraria as janelas marcadas por SC e
  // PULARIA TUDO em silêncio (ingestão zerada sem erro) — a mesma classe do TRUNCATE que apagaria SC ([[pnigp-replicacao-uf-sp]]).
  await q(`CREATE TABLE IF NOT EXISTS _raiox_janela (mod INT, ano INT, mes INT, n INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (mod,ano,mes))`);
  await q(`ALTER TABLE _raiox_janela ADD COLUMN IF NOT EXISTS uf TEXT`);
  await q(`UPDATE _raiox_janela SET uf='SC' WHERE uf IS NULL`);   // as janelas existentes são todas de SC
  const pkJanela = (await q(`SELECT pg_get_constraintdef(c.oid) def FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
    WHERE r.relname='_raiox_janela' AND c.contype='p'`)).rows[0]?.def || "";
  if (!pkJanela.includes("uf")) {
    await q(`ALTER TABLE _raiox_janela DROP CONSTRAINT _raiox_janela_pkey`);
    await q(`ALTER TABLE _raiox_janela ADD PRIMARY KEY (uf,mod,ano,mes)`);
    console.log("↻ _raiox_janela: PK migrada p/ (uf,mod,ano,mes) — retomada por UF");
  }
  // 🔴 ESPELHAR O PNCP (lei: SISTEMA DE ORIGEM = SISTEMA DE DESTINO — [[pnigp-nomenclatura-pncp]]).
  // O objeto `compra` do PNCP TRAZ a entidade `unidadeOrgao` com o município do processo:
  //   unidadeOrgao = { codigoIbge, municipioNome, ufSigla, ufNome, codigoUnidade, nomeUnidade }
  // Antes, isto era DESCARTADO e o município era DEDUZIDO de um mapa cnpj→cod_ibge montado de `itens_sc` — inventar
  // arquitetura sobre um campo que já existe. Custo medido: 3.724 processos ficaram SEM município e só 289 dos 295
  // municípios de SC apareciam. Agora o cod_ibge vem do PNCP; o mapa fica só de FALLBACK p/ registro antigo.
  const codByCnpj = new Map((await q(`SELECT DISTINCT cnpj, cod_ibge FROM itens_sc WHERE cod_ibge IS NOT NULL`)).rows.map((r) => [r.cnpj, r.cod_ibge]));
  // colunas-espelho da unidadeOrgao (idempotente)
  // 🔑 link_sistema_origem — O CAMPO QUE DIZ ONDE O PROCESSO REALMENTE MORA. Vinha na API e era DESCARTADO.
  // Caso real (Entre Rios 2024/34): o município publicou UM arquivo no PNCP — o DFD, classificado como "Edital".
  // O TR e o edital de verdade NÃO estão no PNCP (o /historico confirma: 2 eventos, nenhuma exclusão — nunca
  // foram publicados). Mas a API entrega o endereço exato:
  //   https://portaldecompraspublicas.com.br/processos/SC/Prefeitura-Municipal-de-Entre-Rios-1489/PE-26-2024-2024-327854
  // É o edital, os lances, as propostas e a MARCA de cada licitante — a um clique, num campo que nós jogávamos fora.
  // Responde a pergunta do usuário ("por que eu acho sozinho nos portais?"): o PNCP DÁ o link; nós é que não líamos.
  // Não é scraping às cegas — é seguir o endereço que a fonte publica.
  //
  // justificativa_presencial: idem, um dos 32 campos descartados. Diz por que NÃO foi eletrônico (art. 17 §2º:
  // "preferencialmente eletrônica, admitida a presencial desde que MOTIVADA").
  for (const [c, t] of [["municipio_nome", "TEXT"], ["unidade_codigo", "TEXT"], ["unidade_nome", "TEXT"],
                        ["orgao_razao_social", "TEXT"], ["uf", "TEXT"], ["numero_controle_pncp", "TEXT"],
                        ["link_sistema_origem", "TEXT"], ["justificativa_presencial", "TEXT"],
                        ["data_atualizacao", "TIMESTAMPTZ"], ["raw", "JSONB"]])
    await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  await q(`CREATE INDEX IF NOT EXISTS ix_contr_link ON contratacoes_sc (link_sistema_origem) WHERE link_sistema_origem IS NOT NULL`);
  // 🔑 `raw` — O JSON CRU, INTEIRO. NÃO DESCARTA NADA. NUNCA.
  // Mapear campo a campo é uma corrida que eu perco sempre: escrevi um mapa de 49 campos e SEIS escaparam —
  // `linkProcessoEletronico` (um 2º link que eu nem sabia existir), `dataAtualizacaoGlobal`, `fontesOrcamentarias`,
  // `tipoInstrumentoConvocatorioCodigo`. Amanhã o PNCP acrescenta um e escapa de novo.
  // As colunas típadas continuam (as queries de produção dependem delas e índice em coluna é mais rápido);
  // o `raw` é a garantia: o que a API mandou está aqui, íntegro, e nada precisa ser recoletado quando
  // descobrirmos que um campo importa. Custo: ~2 KB por contratação. Barato perto de 16h de recoleta.
  // Consultar: raw->>'linkProcessoEletronico' · raw->'fontesOrcamentarias' · raw->'orgaoEntidade'->>'poderId'
  await q(`CREATE INDEX IF NOT EXISTS ix_contr_raw ON contratacoes_sc USING gin (raw)`);

  // ⚠️ O mês CORRENTE e o ANTERIOR nunca são "fechados": processos são publicados/atualizados o mês todo e o PNCP
  // aceita retificação depois. Pular a janela do mês corrente (o que o resume fazia) CONGELA contratacoes_sc no 1º
  // dia em que rodou — foi o bug que deixou a base parada em 15/jul. Só meses JÁ FECHADOS usam o resume _raiox_janela.
  const _now = new Date(); const _cy = _now.getUTCFullYear(), _cm = _now.getUTCMonth() + 1;
  const mesesAtras = (a, m) => (_cy - a) * 12 + (_cm - m);
  const js = janelas(); let totGrav = 0, jaFeitas = 0; const janelasComErro = [];
  for (const mod of MODALIDADES) for (const j of js) {
    const recente = mesesAtras(j.ano, j.mes) <= 1;   // mês corrente (0) e anterior (1) SEMPRE re-buscam
    if (!recente && (await q(`SELECT 1 FROM _raiox_janela WHERE uf=$4 AND mod=$1 AND ano=$2 AND mes=$3`, [mod, j.ano, j.mes, UF])).rowCount) { jaFeitas++; continue; }
    let pagina = 1, tp = 1, nJanela = 0, erroJanela = null;
    do {
      const r = await getBulk(mod, j.ini, j.fim, pagina).catch((e) => ({ data: [], totalPaginas: 0, erro: `exceção: ${e.message}` }));
      if (r.erro) { erroJanela = r.erro; break; }   // não engole: a janela fica SEM marca e volta na próxima rodada
      tp = r.totalPaginas || 0; const lista = r.data || [];
      for (const o of lista) {
        // MAPEAMENTO ÚNICO: as 33 colunas vivem em scripts/lib_contratacao_upsert.mjs, compartilhado com o
        // coletor incremental (/contratacoes/atualizacao). Antes havia uma cópia aqui e outra lá — duas cópias
        // significam que um campo novo entra por um caminho e some pelo outro. Inclui cod_ibge do PNCP
        // (unidadeOrgao.codigoIbge) com o mapa cnpj→ibge só de fallback, linkSistemaOrigem e o `raw` íntegro.
        if (!(await upsertContratacao(q, o, codByCnpj))) continue;
        totGrav++; nJanela++;
      }
      pagina++;
    } while (pagina <= tp);
    if (erroJanela) {
      janelasComErro.push(`mod ${mod} ${j.ano}-${String(j.mes).padStart(2, "0")}: ${erroJanela}`);
      console.log(`\n  ⚠ mod ${mod} ${j.ano}-${String(j.mes).padStart(2, "0")} NÃO coletada (${erroJanela}) — janela não marcada, volta na próxima rodada`);
      continue;   // sem INSERT em _raiox_janela: melhor re-buscar do que registrar coleta que não houve
    }
    await q(`INSERT INTO _raiox_janela (uf,mod,ano,mes,n) VALUES ($5,$1,$2,$3,$4) ON CONFLICT (uf,mod,ano,mes) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [mod, j.ano, j.mes, nJanela, UF]);
    if (nJanela) process.stdout.write(`  mod ${mod} ${j.ano}-${String(j.mes).padStart(2, "0")}: ${nJanela} · total ${totGrav}\r`);
  }
  console.log(`\n${janelasComErro.length ? "⚠" : "✔"} ${totGrav.toLocaleString()} compras gravadas (janelas já feitas puladas: ${jaFeitas})`);
  if (janelasComErro.length) {
    console.log(`\n⚠ ${janelasComErro.length} JANELA(S) NÃO COLETADA(S) — a API não respondeu. NÃO foram marcadas como feitas:`);
    for (const x of janelasComErro.slice(0, 20)) console.log(`   · ${x}`);
    if (janelasComErro.length > 20) console.log(`   · … e mais ${janelasComErro.length - 20}`);
    console.log("   Rode de novo quando a API estiver estável; o resume volta exatamente nelas.");
    process.exitCode = 2;   // exit != 0: o orquestrador não registra a fonte como 'ok'
  }
  const s = (await q(`SELECT count(*) n, count(DISTINCT plataforma) plats, count(*) FILTER (WHERE economia_pct IS NOT NULL) c_econ FROM contratacoes_sc`)).rows[0];
  console.log(`ACUMULADO: ${Number(s.n).toLocaleString()} compras · ${s.plats} plataformas · ${Number(s.c_econ).toLocaleString()} com economia`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
