// EXTRAÇÃO DAS ATAS — por item: TODAS as propostas de TODOS os fornecedores (fornecedor+marca+modelo+valor+classificação)
// + lances + disputa. O PNCP não expõe esses campos por API; estão na ATA (texto já materializado em arquivo_texto_sc).
// Fluxo por ata: lê texto GUARDADO (não re-baixa) → fatia as seções (Vencedores/Propostas/Classificação/Lances) → LLM (Haiku)
// extrai por item → LINKA ao itens_sc pelo CÓDIGO do item → propostas_sc (todos) + item_marca_sc (vencedor) + lances_sc +
// contratacao_disputa_sc. Nomenclatura da fonte (origem=destino). RESUMÍVEL (marca_ata_feitas), LOTE no banco (Neon-safe:
// 1 INSERT/ata via unnest, pool max 3), cache de LLM, robusto a erro (não marca feito em falha). node scripts/ingest_marca_atas_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { z } from "zod"; import { generateObject } from "ai";
import { casaItens } from "./parser_az.mjs";   // casa o item da ata ao do PNCP pela DESCRIÇÃO (conserto do bug do código)
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
for (const f of [path.join(ROOT, ".env.ai"), path.join(ROOT, ".env.local")])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic(process.env.RERANK_MODEL_ANTHROPIC || "claude-haiku-4-5");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONC = Number(process.env.CONC || 3);
const LIMIT = Number(process.env.LIMIT || 0);
const GATE = process.env.GATE_MARCA === "1";   // modo resíduo: só processos cujo doc TEM o token 'marca' (Haiku só onde a marca existe no papel)
const CACHE = path.join(__dirname, "_marca_atas_cache.json");
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
let dirty = 0; const saveCache = () => { fs.writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brnum = (s) => { if (s == null) return 0; if (typeof s === "number") return s; return Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0; };

// —— schema: por item, TODAS as propostas (todos os fornecedores) + lances ——
const Schema = z.object({ itens: z.array(z.object({
  codigo: z.string().describe("código/número do item (ex.: '0001', '1')"),
  descricao: z.string().nullable().describe("descrição do item conforme a ata"),
  propostas: z.array(z.object({
    fornecedor: z.string().nullable().describe("empresa/licitante que ofertou (razão social)"),
    marca: z.string().nullable().describe("MARCA/FABRICANTE do produto (TIGRE, NESTLÉ…), NUNCA o fornecedor; null se serviço/'Própria'/vazio"),
    modelo: z.string().nullable(),
    valorUnitario: z.number().nullable().describe("valor UNITÁRIO ofertado, com ponto decimal"),
    classificacao: z.string().nullable().describe("Vencedor | Classificado | Desclassificado | Habilitado | Inabilitado"),
  })).describe("TODAS as propostas de TODOS os fornecedores para este item, não só o vencedor"),
  lances: z.array(z.object({
    fornecedor: z.string().nullable(), valor: z.number().nullable(), dataHora: z.string().nullable(),
  })).nullable().describe("lances ofertados com valor, se a ata trouxer histórico de lances com valores; senão null"),
})) });
const SYS = `Você extrai dados de uma ATA de licitação brasileira. Para CADA item (identificado por um código como 0001):
- descricao: a descrição do item.
- propostas: a lista de TODAS as propostas de TODOS os fornecedores/licitantes do item (vencedor E perdedores), com: fornecedor (a empresa vendedora — razão social), marca (o FABRICANTE do produto, NUNCA a empresa fornecedora; se 'Própria'/'Próprio'/serviço use null), modelo, valorUnitario (valor unitário com ponto decimal), classificacao (Vencedor/Classificado/Desclassificado/Habilitado/Inabilitado conforme a ata).
- lances: se houver histórico de lances COM VALORES, liste-os (fornecedor, valor, dataHora); se a ata só tiver mensagens/fases sem valores de lance, retorne null.
Ignore rodapé (Página X de Y, autenticidade, código verificador). Não invente linhas nem fornecedores. Use os valores exatamente como aparecem.`;

// fatia as regiões relevantes da ata (cabeçalhos de propostas/vencedores/classificação/lances)
function regioes(text) {
  const t = text.replace(/A autenticidade[^]*?Página \d+ de \d+/gi, " ").replace(/[ \t]+/g, " ");
  const hdr = /(?:Vencedores|Propostas|Classifica[çc][ãa]o|Resultado por|Mapa de|Melhor Lance|Hist[óo]rico de Lances|Lances\b)[^\n]{0,60}/gi;
  const idx = []; let m; while ((m = hdr.exec(t)) !== null && idx.length < 8) idx.push(m.index);
  if (!idx.length) return [t.slice(0, 9000)];
  return idx.map((s, k) => t.slice(s, Math.min(s + 9000, idx[k + 1] ?? t.length, t.length)));
}
function disputa(text) {
  const t = text.replace(/\s+/g, " ");
  const nLances = (t.match(/\d{2}\/\d{2}\/\d{4}[ -]+\d{2}[.:]\d{2}[.:]\d{2}/g) || []).length;
  const cnpjs = new Set((t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []).map((x) => x.replace(/\D/g, "")));
  return { nLances, nLicitantes: cnpjs.size };
}
async function llm(reg) {
  const key = "p2:" + reg.length + ":" + reg.slice(0, 180); if (cache[key]) return cache[key];
  const { object } = await generateObject({ model: MODEL, schema: Schema, temperature: 0, system: SYS, prompt: reg.slice(0, 9000) });
  cache[key] = object.itens; if (++dirty >= 10) saveCache(); return object.itens;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; i < 25; i++) { try { return await db.query(s, p); } catch { await sleep(1500 * (i + 1)); } } throw new Error("db"); };
  const nc = `numero_controle TEXT GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text,6,'0') || '/' || ano) STORED`;
  // propostas_sc — TODAS as propostas de TODOS os fornecedores por item
  await q(`CREATE TABLE IF NOT EXISTS propostas_sc (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, descricao TEXT, fornecedor TEXT, marca TEXT, modelo TEXT,
    valor_unitario NUMERIC, classificacao TEXT, ${nc}, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj,ano,seq,numero,fornecedor))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_prop_cod ON propostas_sc (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_prop_marca ON propostas_sc (lower(marca))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_prop_nc ON propostas_sc (numero_controle)`);
  // lances_sc — lances com valor, quando a ata traz
  await q(`CREATE TABLE IF NOT EXISTS lances_sc (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, ordem INT, fornecedor TEXT, valor NUMERIC, data_hora TEXT, ${nc},
    PRIMARY KEY (cnpj,ano,seq,numero,ordem))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_lances_cod ON lances_sc (cod_ibge)`);
  // item_marca_sc — vencedor (compat com o que já existe / CATMAT)
  await q(`CREATE TABLE IF NOT EXISTS item_marca_sc (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, descricao TEXT, produto_ata TEXT, modelo TEXT, marca TEXT, valor NUMERIC,
    ${nc}, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,numero))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_marca_cod ON item_marca_sc (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_marca_marca ON item_marca_sc (lower(marca))`);
  await q(`CREATE TABLE IF NOT EXISTS contratacao_disputa_sc (
    cnpj TEXT, ano INT, seq INT, cod_ibge TEXT, n_licitantes INT, n_lances INT, n_marcas INT, n_propostas INT,
    ${nc}, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_disputa_cod ON contratacao_disputa_sc (cod_ibge)`);
  await q(`CREATE TABLE IF NOT EXISTS marca_ata_feitas (cnpj TEXT, ano INT, seq INT, n_propostas INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);

  // universo: atas com TEXTO já materializado, ainda não extraídas. Lê o texto GUARDADO — não re-baixa do PNCP.
  // MODALIDADES=8,9,12 restringe às modalidades SEM parser determinístico (dispensa/inexig/credenciamento) — o LLM
  // é o catch-all agnóstico de formato; o determinístico cobre pregão/concorrência de graça. Sem env = todas.
  const MODS = process.env.MODALIDADES ? process.env.MODALIDADES.split(",").map((x) => parseInt(x, 10)).filter(Boolean) : null;
  const modFiltro = MODS ? `AND EXISTS (SELECT 1 FROM contratacoes_sc c WHERE c.cnpj=d.cnpj AND c.ano=d.ano AND c.seq=d.seq AND c.modalidade_id = ANY(ARRAY[${MODS.join(",")}]))` : "";
  const atas = (await q(`SELECT d.cnpj,d.ano,d.seq,d.cod_ibge,(array_agg(d.texto ORDER BY d.sequencial_documento DESC))[1] texto
    FROM arquivo_texto_sc d WHERE d.chars > 50
      AND NOT EXISTS (SELECT 1 FROM marca_ata_feitas f WHERE f.cnpj=d.cnpj AND f.ano=d.ano AND f.seq=d.seq)
      ${modFiltro}
    GROUP BY d.cnpj,d.ano,d.seq,d.cod_ibge ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${atas.length.toLocaleString()} atas a extrair (texto guardado) · conc ${CONC}`);

  let comProp = 0, i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < atas.length) {
      const e = atas[i++];
      const text = e.texto;
      if (!text || text.length < 50) continue;
      try {
        const { nLances, nLicitantes } = disputa(text);
        // LLM por região → junta itens (dedup por código)
        const porItem = new Map();
        for (const reg of regioes(text)) {
          let its = []; try { its = await llm(reg); } catch {}
          for (const it of its) {
            const cod = parseInt(String(it.codigo).replace(/\D/g, ""), 10); if (!cod) continue;
            const cur = porItem.get(cod) || { descricao: it.descricao, propostas: [], lances: [] };
            if (!cur.descricao && it.descricao) cur.descricao = it.descricao;
            for (const p of (it.propostas || [])) cur.propostas.push(p);
            for (const l of (it.lances || [])) cur.lances.push(l);
            porItem.set(cod, cur);
          }
        }
        // nossos itens do PNCP — a lista AUTORITATIVA (numero + descrição oficial)
        const nossosRows = (await q(`SELECT numero, descricao FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3`, [e.cnpj, e.ano, e.seq])).rows;
        const nossos = new Map(nossosRows.map((r) => [Number(r.numero), r.descricao]));
        // 🔴 CONSERTO (proposta no item errado, medido 33,4% dos processos): NÃO confiar no código da ata — o LLM/parser
        // desalinha e joga tudo no item 1. Casar o item da ata ao do PNCP pela DESCRIÇÃO (casaItens, MIN_SIM=0.6). Sem
        // casar → dropa (melhor perder do que pendurar a marca no item errado). Ver [[pnigp-proposta-item-errado]].
        const itensApi = nossosRows.map((r) => ({ numero: Number(r.numero), descricao: r.descricao }));
        const regsMatch = [...porItem].map(([cod, d]) => ({ item: cod, descricao: d.descricao || nossos.get(cod) || "" }));
        const codParaNumero = new Map(casaItens(regsMatch, itensApi).map((r) => [r.item, r.numero]));

        // —— monta lotes ——
        const P = { num: [], desc: [], forn: [], mar: [], mod: [], val: [], cls: [] };  // propostas
        const M = { num: [], desc: [], prod: [], mod: [], mar: [], val: [] };            // vencedor
        const L = { num: [], ord: [], forn: [], val: [], dh: [] };                        // lances
        const fornVistos = new Set();
        for (const [cod, d] of porItem) {
          const numero = codParaNumero.get(cod);
          if (numero == null) continue;   // não casou pela DESCRIÇÃO → NÃO grava (não pendura marca no item errado)
          const descOf = nossos.get(numero) || d.descricao || null;
          // propostas (todos) — dedup por fornecedor dentro do item
          const dedup = new Map();
          for (const p of d.propostas) {
            const forn = (p.fornecedor || "").trim(); if (!forn && !p.marca) continue;
            const k = cod + "|" + forn.slice(0, 60).toUpperCase();
            if (!dedup.has(k)) dedup.set(k, p);
          }
          let vencedor = null;
          for (const p of dedup.values()) {
            P.num.push(numero); P.desc.push(String(descOf || "").slice(0, 200));
            P.forn.push((p.fornecedor || "").slice(0, 160) || "—"); P.mar.push(p.marca ? String(p.marca).slice(0, 80) : null);
            P.mod.push(p.modelo ? String(p.modelo).slice(0, 80) : null); P.val.push(brnum(p.valorUnitario) || null);
            P.cls.push(p.classificacao ? String(p.classificacao).slice(0, 30) : null);
            fornVistos.add((p.fornecedor || "").toUpperCase());
            if (/venced/i.test(p.classificacao || "") && !vencedor) vencedor = p;
          }
          if (!vencedor) { // sem rótulo → menor valor classificado
            const c = [...dedup.values()].filter((x) => brnum(x.valorUnitario) > 0).sort((a, b) => brnum(a.valorUnitario) - brnum(b.valorUnitario));
            vencedor = c[0] || null;
          }
          if (vencedor && (vencedor.marca || vencedor.modelo)) {
            M.num.push(numero); M.desc.push(String(descOf || "").slice(0, 200)); M.prod.push(vencedor.fornecedor ? null : null);
            M.mod.push(vencedor.modelo ? String(vencedor.modelo).slice(0, 80) : null); M.mar.push(vencedor.marca ? String(vencedor.marca).slice(0, 80) : null);
            M.val.push(brnum(vencedor.valorUnitario) || null);
          }
          // lances com valor
          let ord = 0;
          for (const l of d.lances) { const v = brnum(l.valor); if (!v) continue; ord++;
            L.num.push(numero); L.ord.push(ord); L.forn.push((l.fornecedor || "").slice(0, 160) || "—"); L.val.push(v); L.dh.push((l.dataHora || "").slice(0, 30) || null); }
        }
        // —— INSERT em LOTE (Neon-safe: 1 query/tabela por ata) ——
        if (P.num.length) await q(`INSERT INTO propostas_sc (cnpj,ano,seq,cod_ibge,numero,descricao,fornecedor,marca,modelo,valor_unitario,classificacao)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::text[],$10::numeric[],$11::text[]) AS t(numero,descricao,fornecedor,marca,modelo,valor_unitario,classificacao)
          ON CONFLICT (cnpj,ano,seq,numero,fornecedor) DO UPDATE SET marca=EXCLUDED.marca, modelo=EXCLUDED.modelo, valor_unitario=EXCLUDED.valor_unitario, classificacao=EXCLUDED.classificacao, descricao=EXCLUDED.descricao, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, P.num, P.desc, P.forn, P.mar, P.mod, P.val, P.cls]);
        if (M.num.length) await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,produto_ata,modelo,marca,valor)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::text[],$10::numeric[]) AS t(numero,descricao,produto_ata,modelo,marca,valor)
          ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, valor=EXCLUDED.valor, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.desc, M.prod, M.mod, M.mar, M.val]);
        if (L.num.length) await q(`INSERT INTO lances_sc (cnpj,ano,seq,cod_ibge,numero,ordem,fornecedor,valor,data_hora)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::int[],$7::text[],$8::numeric[],$9::text[]) AS t(numero,ordem,fornecedor,valor,data_hora)
          ON CONFLICT (cnpj,ano,seq,numero,ordem) DO UPDATE SET fornecedor=EXCLUDED.fornecedor, valor=EXCLUDED.valor, data_hora=EXCLUDED.data_hora`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, L.num, L.ord, L.forn, L.val, L.dh]);
        await q(`INSERT INTO contratacao_disputa_sc (cnpj,ano,seq,cod_ibge,n_licitantes,n_lances,n_marcas,n_propostas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_licitantes=EXCLUDED.n_licitantes, n_lances=EXCLUDED.n_lances, n_marcas=EXCLUDED.n_marcas, n_propostas=EXCLUDED.n_propostas, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, Math.max(nLicitantes, fornVistos.size), nLances, M.num.length, P.num.length]);
        await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_propostas) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_propostas=EXCLUDED.n_propostas, feito_em=now()`, [e.cnpj, e.ano, e.seq, P.num.length]);
        if (P.num.length) comProp++;
      } catch { /* deixa p/ o próximo run — não marca feito */ }
      if (++done % 25 === 0) { saveCache(); process.stdout.write(`  ${done}/${atas.length} · ${comProp} c/propostas\r`); }
    }
  }));
  saveCache();
  const s = (await q(`SELECT count(*) prop, count(DISTINCT fornecedor) forn, count(DISTINCT lower(marca)) marcas, count(DISTINCT (cnpj,ano,seq)) atas FROM propostas_sc`)).rows[0];
  const nl = (await q(`SELECT count(*) n FROM lances_sc`)).rows[0].n;
  console.log(`\n✔ propostas_sc: ${Number(s.prop).toLocaleString()} propostas · ${Number(s.forn).toLocaleString()} fornecedores · ${Number(s.marcas).toLocaleString()} marcas · ${Number(s.atas).toLocaleString()} atas · lances_sc: ${Number(nl).toLocaleString()}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
