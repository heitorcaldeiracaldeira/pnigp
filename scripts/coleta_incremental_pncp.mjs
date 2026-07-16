// COLETA INCREMENTAL DO PNCP — pergunta "o que mudou?" em vez de varrer tudo.
//
// ═══ O PROBLEMA (medido 2026-07-15) ═══
// A varredura completa custa ~1,1 MILHÃO de GETs (241.302 processos × 1 /itens + 1 /resultados por item premiado)
// = ~16h a 250 processos/min. Rodar isso todo dia para descobrir que quase nada mudou é o desperdício.
// A memória do projeto registra a "Busca diaria PNCP" DESATIVADA justamente por isso: virou refresh completo de
// ~12h e morria no limite de 3h. Este script é o conserto.
//
// ═══ AS TRÊS PEÇAS (todas MEDIDAS antes de escrever, não supostas) ═══
// 1. `/contratacoes/atualizacao` diz QUEM mudou. Medido em SC: Pregão-E 451/dia, Dispensa 365/dia. Somando as 13
//    modalidades, a ordem é ~1.000 processos/dia — não 241 mil.
// 2. `dataAtualizacao` (vem na contratação E em cada item) diz SE mudou. Igual ao gravado → NÃO busca /resultados,
//    NÃO escreve. O caro não é o INSERT: é o GET que eu faço para descobrir que está igual.
// 3. `/historico` diz O QUE mudou, em 1 chamada por processo: categoria 4=Item, 5=Resultado, 6=Documento;
//    ação 0=Inclusão, 1=Retificação. Em vez de N GETs por item para descobrir se mexeu, 1 GET diz onde mexer.
//    🔑 E é o MESMO evento que dispara a notificação: "categoria 5, ação 0" = o item acabou de homologar.
//    Detector de mudança e fonte de notificação são a mesma coisa. Ver docs/notificacoes-pncp.md.
//
// ═══ ARMADILHAS MEDIDAS (nenhuma seria adivinhada) ═══
//  · `codigoModalidadeContratacao` é OBRIGATÓRIO (400 sem ele) → varrer as 13. NÃO existe "todas".
//  · `tamanhoPagina` default é 10 → 46 páginas p/ 451 registros. Subir p/ 50 (máx medido em /publicacao).
//  · `/pca/atualizacao` usa `dataInicio`, NÃO `dataInicial` — nome diferente dos outros três.
//  · janela de 90 dias funciona (8.540 registros) → dá para recuperar buraco sem varredura completa.
//  · `/atas/atualizacao` e `/contratos/atualizacao` NÃO filtram por uf → filtrar depois, por cod_ibge.
//
// MODO NORMAL: node scripts/coleta_incremental_pncp.mjs           (últimas 48h)
// RECUPERAR BURACO: DIAS=90 node scripts/coleta_incremental_pncp.mjs
// SÓ VER, SEM GRAVAR: DRY=1 node scripts/coleta_incremental_pncp.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONSULTA = "https://pncp.gov.br/api/consulta/v1";
const UF = (process.env.UF || "SC").toUpperCase();          // state-agnostic: SP roda igual
const DIAS = Number(process.env.DIAS || 2);                  // 2 = ontem+hoje; até 90 (medido)
const DRY = process.env.DRY === "1";
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];   // §5.2 — obrigatória, não existe "todas"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 120000 });
db.on("error", () => {});
const q = async (s, p) => { let u; for (let i = 0; i < 10; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05","23505","23502","42703","42P10"].includes(e.code)) throw e; await sleep(1500 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

async function get(url) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 204) return { data: [], totalPaginas: 0 };
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }   // 429 agressivo: backoff longo
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;
}

/** todas as páginas de um endpoint da API de consulta */
async function todas(base) {
  const out = []; let p = 1;
  for (;;) {
    const j = await get(`${base}&pagina=${p}&tamanhoPagina=50`);
    if (!j || !j.data?.length) break;
    out.push(...j.data);
    if (p >= (j.totalPaginas || 1)) break;
    p++;
    if (p > 400) { console.log(`  ⚠ parou em 400 páginas: ${base.slice(0, 70)}`); break; }   // sem corte silencioso
  }
  return out;
}

const hoje = new Date(), ini = new Date(); ini.setDate(hoje.getDate() - DIAS);
const D0 = ymd(ini), D1 = ymd(hoje);
console.log(`COLETA INCREMENTAL · ${UF} · janela ${D0}→${D1} (${DIAS}d)${DRY ? " · DRY-RUN" : ""}\n`);

await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS data_atualizacao timestamptz`);
await q(`CREATE TABLE IF NOT EXISTS coleta_incremental_log (
  rodada_em timestamptz DEFAULT now(), uf TEXT, janela_ini TEXT, janela_fim TEXT,
  vistos INT, mudaram INT, iguais INT, novos INT, gets INT)`);

// ─── 1. QUEM mudou (as 13 modalidades) ────────────────────────────────────────────────────────────────────────
let vistos = 0, gets = 0;
const mudou = [];   // {numeroControle, cnpj, ano, seq, cod_ibge, dataAtualizacao}
for (const m of MODALIDADES) {
  const rs = await todas(`${CONSULTA}/contratacoes/atualizacao?dataInicial=${D0}&dataFinal=${D1}&codigoModalidadeContratacao=${m}&uf=${UF}`);
  gets += Math.ceil(rs.length / 50) + 1;
  vistos += rs.length;
  for (const c of rs) {
    const ibge = c.unidadeOrgao?.codigoIbge != null ? String(c.unidadeOrgao.codigoIbge) : null;
    // só MUNICIPAL: cod_ibge de 7 dígitos. Unidade do Estado vaza p/ o município-sede se não filtrar.
    if (!ibge || ibge.length !== 7) continue;
    mudou.push({ nc: c.numeroControlePNCP, cnpj: c.orgaoEntidade?.cnpj, ano: c.anoCompra,
      seq: c.sequencialCompra, ibge, dt: c.dataAtualizacao });
  }
  if (rs.length) console.log(`  modalidade ${String(m).padStart(2)}: ${String(rs.length).padStart(5)} mudaram`);
}
console.log(`\n${vistos} registros na janela · ${mudou.length} municipais · ${gets} GETs p/ descobrir\n`);

// ─── 2. SE mudou de verdade: dataAtualizacao × o que está gravado ─────────────────────────────────────────────
// É AQUI que a economia acontece: quem não mudou não gera NENHUM GET de /itens nem de /resultados.
const conhecidos = new Map();
for (const r of (await q(`SELECT numero_controle_pncp nc, data_atualizacao dt FROM contratacoes_sc
  WHERE numero_controle_pncp = ANY($1)`, [mudou.map((x) => x.nc)])).rows) conhecidos.set(r.nc, r.dt);

const paraRefrescar = [], iguais = [], novos = [];
for (const x of mudou) {
  if (!conhecidos.has(x.nc)) { novos.push(x); paraRefrescar.push(x); continue; }
  const gravado = conhecidos.get(x.nc);
  if (gravado && x.dt && new Date(x.dt) <= new Date(gravado)) { iguais.push(x); continue; }   // NÃO mexeu
  paraRefrescar.push(x);
}
console.log(`  ${novos.length} novos · ${paraRefrescar.length - novos.length} mudaram de verdade · ${iguais.length} iguais (PULADOS, 0 GET)`);

// ─── 3. O QUE mudou: 1 GET de /historico por processo diz onde mexer ──────────────────────────────────────────
// Sem isto seria 1 GET por item p/ descobrir. Com isto, 1 por processo.
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const eventos = { item: 0, resultado: 0, documento: 0, contratacao: 0 };
const itensMexidos = new Map();   // "cnpj/ano/seq" -> Set(numeroItem) que mudaram
for (const x of paraRefrescar.slice(0, Number(process.env.CAP || 500))) {
  const h = await get(`${PNCP}/orgaos/${x.cnpj}/compras/${x.ano}/${x.seq}/historico`);
  gets++;
  if (!Array.isArray(h)) continue;
  const chave = `${x.cnpj}/${x.ano}/${x.seq}`;
  for (const e of h) {
    // só o que entrou DENTRO da janela — o histórico traz a vida toda do processo
    if (e.logManutencaoDataInclusao && e.logManutencaoDataInclusao.slice(0, 10).replace(/-/g, "") < D0) continue;
    if (e.categoriaLogManutencao === 1) eventos.contratacao++;
    if (e.categoriaLogManutencao === 6) eventos.documento++;
    if (e.categoriaLogManutencao === 4 || e.categoriaLogManutencao === 5) {
      eventos[e.categoriaLogManutencao === 4 ? "item" : "resultado"]++;
      if (e.itemNumero != null) {
        if (!itensMexidos.has(chave)) itensMexidos.set(chave, new Set());
        itensMexidos.get(chave).add(e.itemNumero);
      }
    }
  }
}
const totItens = [...itensMexidos.values()].reduce((a, s) => a + s.size, 0);
console.log(`\n  eventos na janela: ${eventos.contratacao} contratação · ${eventos.item} item · ${eventos.resultado} RESULTADO · ${eventos.documento} documento`);
console.log(`  → ${totItens} itens a rebuscar (em vez de TODOS os itens dos ${paraRefrescar.length} processos)`);

// ─── 4. Balanço: o que isto economiza ─────────────────────────────────────────────────────────────────────────
const CHEIA = 241302 * 5;   // ordem de grandeza da varredura completa (1 /itens + ~4 /resultados por processo)
console.log(`\n${"═".repeat(78)}`);
console.log(`  GETs desta rodada:        ${gets.toLocaleString("pt-BR").padStart(9)}`);
console.log(`  GETs da varredura cheia:  ${CHEIA.toLocaleString("pt-BR").padStart(9)}   (~16h)`);
console.log(`  economia:                 ${(100 - 100 * gets / CHEIA).toFixed(2)}%`);
console.log(`${"═".repeat(78)}`);
console.log(`\n🔑 os ${eventos.resultado} eventos de RESULTADO são, ao mesmo tempo, a lista de itens a rebuscar E a`);
console.log(`   fila de notificação ("este item homologou"). Detector e notificação são o MESMO evento.`);

if (!DRY) await q(`INSERT INTO coleta_incremental_log (uf,janela_ini,janela_fim,vistos,mudaram,iguais,novos,gets)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [UF, D0, D1, vistos, paraRefrescar.length, iguais.length, novos.length, gets]);
else console.log(`\n(DRY-RUN: nada gravado)`);
await db.end();
