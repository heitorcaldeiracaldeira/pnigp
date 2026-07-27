// A CADEIA DA COMPRA ATÉ O PAGAMENTO — contrato → empenho → nota fiscal. Todos os compradores da UF.
//
// ═══ O QUE FALTAVA E AGORA ESTÁ MEDIDO (2026-07-16) ═══
// A memória do projeto dizia "SC ainda não publica NF/empenho". **PUBLICA.** Medido chamando:
//   /v1/instrumentoscobranca/inclusao?uf=SC  →  767 notas em 2 dias · 9.988 nacionais em 14 dias · **71 CAMPOS**
//   /v1/contratos/atualizacao                →  15.626 contratos em 2 dias · **51 campos**
// A NF é o MAIOR objeto da cadeia — maior que a contratação (45) e que o contrato (56).
//
// ═══ A CADEIA (cada elo confirmado por chamada real) ═══
//   contratação  cnpj-**1**-seq/ano   /contratacoes/publicacao + /compras/{ano}/{seq}/itens + /itens/{n}/resultados
//   contrato     cnpj-**2**-seq/ano   ← PONTE: /orgaos/{cnpj}/contratos/contratacao/{ano}/{seq}?pagina=1
//   empenho                           /orgaos/{cnpj}/contratos/{anoC}/{seqC}/empenhos
//   nota fiscal                       /instrumentoscobranca/inclusao?uf=SC  ← tem filtro de UF: é o caminho barato
//
// 🔴 O DÍGITO DO MEIO É MARCADOR DE ENTIDADE (§4.1): 0=PCA · 1=contratação · 2=contrato.
//    O contrato NÃO casa pelo sequencial da compra. Caso real: compra 12075748000132/2023/86 gerou o contrato
//    83102798000100-**2**-000131/**2025** — CNPJ diferente, ano diferente. É adesão à ata (campo `frutoAdesao`).
//    Usar o cnpj/ano/seq DO CONTRATO nos elos seguintes; usar o da compra dá 404 "Contrato não cadastrado".
//
// ═══ REGRAS (aprendidas caro, em 15-16/07) ═══
//  · **NÃO DESCARTA NADA**: `raw jsonb` em toda entidade. Mapear campo a campo é corrida que se perde —
//    escrevi um mapa de 49 campos p/ a contratação e SEIS escaparam.
//  · **NENHUM FILTRO NA ENTRADA**: filtro que decide o que se olha é ponto cego com nome de eficiência, e o custo
//    é invisível por construção. Três vezes no mesmo dia: regex de título (fechou 76%), `r[0]` (~8%),
//    flag `temResultado` (nula em 90%).
//  · **`pagina` é OBRIGATÓRIO** em /contratos/contratacao (400 sem ele: "Required request parameter 'pagina'").
//  · **`tamanhoPagina` mínimo 10** (400: "must be greater than or equal to 10").
//  · Estado por VERSÃO, nunca marcador booleano de "feito" — senão o conserto não acontece no dado.
//
// node scripts/ingest_cadeia_pncp.mjs        (UF=SC DIAS=2 DRY=1 opcionais)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONS = "https://pncp.gov.br/api/consulta/v1", PNCP = "https://pncp.gov.br/api/pncp/v1";
const UF = (process.env.UF || "SC").toUpperCase();
const DIAS = Number(process.env.DIAS || 2);
const DRY = process.env.DRY === "1";
const CONC = Number(process.env.CONC || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const num = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const dt = (x) => (x ? String(x).slice(0, 19) : null);
const s = (x, m) => { const v = String(x ?? "").trim(); return v ? v.slice(0, m) : null; };

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const FATAL = new Set(["22P05", "22021", "23502", "42703", "42P10"]);
const q = async (sql, p) => { let u; for (let i = 0; i < 10; i++) { try { return await db.query(sql, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

// ═══ LOTE: 1 INSERT por chunk, NUNCA 1 por linha ═══ [[feedback-banco-e-o-gargalo]]
// SQL gerado do mapa [nome,tipo] (não posicional à mão, como ingest_itens); `raw` vai como ::jsonb[] (provado lá).
// unnest => só N params (as arrays), independente da qtd de linhas — sem estourar o teto de 65k params.
async function insereLote(tabela, COLS, linhas, conflito, setCols) {
  const CH = 1000;
  for (let off = 0; off < linhas.length; off += CH) {
    const parte = linhas.slice(off, off + CH);
    const arrays = COLS.map((_, ci) => parte.map((r) => r[ci]));
    const unnests = COLS.map(([, t], i) => `$${i + 1}::${t}[]`).join(",");
    const nomes = COLS.map(([c]) => c).join(",");
    const sets = setCols.map((c) => `${c}=EXCLUDED.${c}`).join(",");
    await q(`INSERT INTO ${tabela} (${nomes}) SELECT * FROM unnest(${unnests}) AS t(${nomes})
             ON CONFLICT (${conflito}) DO UPDATE SET ${sets}, atualizado=now()`, arrays);
  }
}
// ═══ 🔴 FALHA NUNCA VIRA ZERO ═══════════════════════════════════════════════════════════════════════════════
// O que estava aqui: `if (!r.ok) return []`. O PNCP me BLOQUEOU (429 + página HTML de WAF, com Support ID e SEM
// cabeçalho Retry-After) e o código devolveu lista vazia. Reportei "0 empenhos, 0 notas fiscais" com convicção —
// era o bloqueio. **O 429 virou dado.**
// 4ª vez no mesmo dia, sempre a mesma forma: byte NUL → retry cego 25x em silêncio; `.catch(()=>({rows:[]}))` →
// timeout virou "0 processos pendentes" e o ingest saiu com CÓDIGO 0; `!r.ok → []` → bloqueio virou "não tem".
// **Falha vira zero, zero vira conclusão, conclusão vira decisão.**
// Regra: o único "não tem" legítimo é o que a API AFIRMA (204/404). Todo o resto é ERRO e tem que gritar.
class Bloqueado extends Error {}
async function get(u, { podeFaltar = true } = {}) {
  let ultimo = "";
  for (let t = 0; t < 7; t++) {
    let r;
    try { r = await fetch(u, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { ultimo = e.message.slice(0, 60); await sleep(1500 * (t + 1)); continue; }
    // "não tem" que a API AFIRMA — os dois únicos casos em que vazio é resposta, não falha
    if (r.status === 204) return [];
    if (r.status === 404 && podeFaltar) return [];
    // 🔴 429: o PNCP responde com HTML (não JSON) e SEM Retry-After. Backoff longo; se insistir, ABORTA a rodada.
    if (r.status === 429) { ultimo = "429 (limite de requisições)"; await sleep(8000 * (t + 1)); continue; }
    const ct = r.headers.get("content-type") || "";
    if (/text\/html/i.test(ct)) { ultimo = "HTML no lugar de JSON (WAF)"; await sleep(8000 * (t + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${u.slice(0, 90)}`);
    const j = await r.json().catch(() => { throw new Error(`JSON inválido em ${u.slice(0, 90)}`); });
    return Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : j ? [j] : [];
  }
  // esgotou o backoff: NÃO devolve [] — grita. Continuar aqui é gravar bloqueio como dado.
  throw new Bloqueado(`bloqueado após 7 tentativas (${ultimo}) — ${u.slice(0, 90)}`);
}

// paginação: se cair no meio, ABORTA. Devolver o que já tinha é pior que não devolver nada —
// vira um número plausível e errado, e ninguém percebe.
async function todas(base) {
  const out = []; let p = 1, totalEsperado = null;
  for (;;) {
    const r = await fetch(`${base}&pagina=${p}&tamanhoPagina=50`, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) })
      .catch((e) => { throw new Bloqueado(`rede na página ${p}: ${e.message.slice(0, 40)}`); });
    if (r.status === 204) break;
    if (r.status === 429 || /text\/html/i.test(r.headers.get("content-type") || ""))
      throw new Bloqueado(`429/WAF na página ${p} de ${base.slice(0, 70)} — ABORTA (o parcial mentiria)`);
    if (!r.ok) throw new Error(`HTTP ${r.status} na página ${p}`);
    const j = await r.json().catch(() => { throw new Error(`JSON inválido na página ${p}`); });
    const d = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    if (totalEsperado == null) totalEsperado = j?.totalRegistros ?? null;
    if (!d.length) break;
    out.push(...d);
    if (p >= (j?.totalPaginas || 1)) break;
    if (p > 500) throw new Bloqueado(`>500 páginas em ${base.slice(0, 70)} — cortar em silêncio é o erro`);
    p++;
  }
  // PROVA REAL: o que trouxe tem que bater com o que a API disse que existe
  if (totalEsperado != null && out.length !== totalEsperado)
    throw new Bloqueado(`INCOMPLETO: ${out.length} de ${totalEsperado} — ${base.slice(0, 70)}`);
  return out;
}

// ─── ESPELHO DAS ENTIDADES (nomes do PNCP: lei do projeto — origem = destino) ──────────────────────────────────
await q(`CREATE TABLE IF NOT EXISTS contrato_sc (
  cnpj TEXT, ano INT, seq INT, cod_ibge TEXT, uf TEXT, municipio_nome TEXT,
  numero_controle_pncp TEXT, numero_controle_compra TEXT,     -- a ponte p/ a contratação
  cnpj_compra TEXT, ano_compra INT, seq_compra INT,
  tipo_contrato_id INT, tipo_contrato TEXT, numero_contrato_empenho TEXT,
  ni_fornecedor TEXT, nome_fornecedor TEXT, ni_fornecedor_subcontratado TEXT,
  valor_inicial NUMERIC, valor_global NUMERIC, valor_parcela NUMERIC, numero_parcelas INT,
  data_assinatura DATE, data_vigencia_inicio DATE, data_vigencia_fim DATE,
  data_publicacao TIMESTAMPTZ, data_atualizacao TIMESTAMPTZ, fruto_adesao BOOLEAN,
  objeto TEXT, raw JSONB, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj, ano, seq))`);
await q(`CREATE INDEX IF NOT EXISTS ix_ctr_compra ON contrato_sc (cnpj_compra, ano_compra, seq_compra)`);
await q(`CREATE INDEX IF NOT EXISTS ix_ctr_ibge ON contrato_sc (cod_ibge)`);

await q(`CREATE TABLE IF NOT EXISTS empenho_sc (
  cnpj TEXT, ano INT, seq INT, sequencial_empenho INT, cod_ibge TEXT,
  numero_empenho TEXT, valor NUMERIC, data_emissao DATE, raw JSONB, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj, ano, seq, sequencial_empenho))`);

// 🔑 A NOTA FISCAL fica 100% com `ingest_nf_sc.mjs` — ele é o DONO da tabela `instrumento_cobranca_sc`
// (schema NFe de 25 col: valor_nota/chave_nfe/fonte_nfe/n_itens). ingest_cadeia cuida só de contrato+empenho.
// (removidas daqui a criação e a coleta da NF, que miravam um schema simples divergente e não escreviam — dupla-dono
//  = [[pnigp-costura-departamentos-risco]]; a limpeza segue [[pnigp-divida-tecnica-limpar]]).

const hoje = new Date(), ini = new Date(); ini.setDate(hoje.getDate() - DIAS);
const D0 = ymd(ini), D1 = ymd(hoje);
console.log(`CADEIA · ${UF} · ${D0}→${D1}${DRY ? " · DRY" : ""}\n`);

// ─── 1) CONTRATOS — /contratos/atualizacao é NACIONAL (não filtra uf); filtrar por cod_ibge depois ─────────────
const ctrs = (await todas(`${CONS}/contratos/atualizacao?dataInicial=${D0}&dataFinal=${D1}`))
  .filter((c) => c.unidadeOrgao?.ufSigla === UF);
console.log(`contratos ${UF}: ${ctrs.length}`);
const CTR_COLS = [["cnpj", "text"], ["ano", "int"], ["seq", "int"], ["cod_ibge", "text"], ["uf", "text"], ["municipio_nome", "text"],
  ["numero_controle_pncp", "text"], ["numero_controle_compra", "text"], ["cnpj_compra", "text"], ["ano_compra", "int"], ["seq_compra", "int"],
  ["tipo_contrato_id", "int"], ["tipo_contrato", "text"], ["numero_contrato_empenho", "text"], ["ni_fornecedor", "text"],
  ["nome_fornecedor", "text"], ["ni_fornecedor_subcontratado", "text"], ["valor_inicial", "numeric"], ["valor_global", "numeric"],
  ["valor_parcela", "numeric"], ["numero_parcelas", "int"], ["data_assinatura", "date"], ["data_vigencia_inicio", "date"],
  ["data_vigencia_fim", "date"], ["data_publicacao", "timestamptz"], ["data_atualizacao", "timestamptz"], ["fruto_adesao", "boolean"],
  ["objeto", "text"], ["raw", "jsonb"]];
let nC = ctrs.length;
if (!DRY) {
  const linhas = ctrs.map((c) => {
    const nc = String(c.numeroControlePncpCompra || c.numeroControlePNCPCompra || "");
    const m = /^(\d{14})-\d-(\d{6})\/(\d{4})$/.exec(nc);   // a compra que gerou este contrato
    return [c.orgaoEntidade?.cnpj, num(c.anoContrato), num(c.sequencialContrato),
      s(c.unidadeOrgao?.codigoIbge, 7), c.unidadeOrgao?.ufSigla || null, s(c.unidadeOrgao?.municipioNome, 80),
      s(c.numeroControlePNCP, 60), s(nc, 60) || null,
      m?.[1] || null, m ? Number(m[3]) : null, m ? Number(m[2]) : null,
      num(c.tipoContrato?.id), s(c.tipoContrato?.nome, 60), s(c.numeroContratoEmpenho, 60),
      s(c.niFornecedor, 20), s(c.nomeRazaoSocialFornecedor, 160), s(c.niFornecedorSubContratado, 20),
      num(c.valorInicial), num(c.valorGlobal), num(c.valorParcela), num(c.numeroParcelas),
      dt(c.dataAssinatura), dt(c.dataVigenciaInicio), dt(c.dataVigenciaFim),
      dt(c.dataPublicacaoPncp), dt(c.dataAtualizacao), c.frutoAdesao === true,
      s(c.objetoContrato, 2000), JSON.stringify(c)];
  });
  await insereLote("contrato_sc", CTR_COLS, linhas, "cnpj,ano,seq",
    ["valor_global", "data_vigencia_fim", "data_atualizacao", "raw"]);
}

// ─── 2) EMPENHOS — por contrato. Usa o cnpj/ano/seq DO CONTRATO (não o da compra: 404) ────────────────────────
const EMP_COLS = [["cnpj", "text"], ["ano", "int"], ["seq", "int"], ["sequencial_empenho", "int"], ["cod_ibge", "text"],
  ["numero_empenho", "text"], ["valor", "numeric"], ["data_emissao", "date"], ["raw", "jsonb"]];
let nE = 0, i = 0;
const empRows = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < ctrs.length) {
    const c = ctrs[i++];
    const cn = c.orgaoEntidade?.cnpj, an = c.anoContrato, sq = c.sequencialContrato;
    const es = await get(`${PNCP}/orgaos/${cn}/contratos/${an}/${sq}/empenhos?pagina=1&tamanhoPagina=50`);
    if (!Array.isArray(es) || !es.length) continue;
    nE += es.length;
    if (DRY) continue;
    for (const e of es) empRows.push([cn, num(an), num(sq), num(e.sequencialEmpenho) || 1, s(c.unidadeOrgao?.codigoIbge, 7),
      s(e.numeroEmpenho, 60), num(e.valorEmpenho ?? e.valor), dt(e.dataEmissao), JSON.stringify(e)]);
  }
}));
// 1 INSERT em lote com o que TODOS os workers colheram (antes: 1 INSERT por empenho, com CONC>pool = contenção)
if (empRows.length) await insereLote("empenho_sc", EMP_COLS, empRows, "cnpj,ano,seq,sequencial_empenho", ["valor", "raw"]);

// ─── 3) NOTA FISCAL — removida daqui: dona de `ingest_nf_sc.mjs` (ver nota acima). ────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log(`  contratos:      ${String(nC).padStart(6)}`);
console.log(`  empenhos:       ${String(nE).padStart(6)}`);
console.log(`${"═".repeat(70)}`);
if (!DRY) {
  const t = (await q(`SELECT (SELECT count(*) FROM contrato_sc) c, (SELECT count(*) FROM empenho_sc) e`)).rows[0];
  console.log(`\n  no banco: ${Number(t.c).toLocaleString("pt-BR")} contratos · ${Number(t.e).toLocaleString("pt-BR")} empenhos`);
}
await db.end();
