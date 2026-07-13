// INGESTÃO — MARCA/MODELO/LANCES das Atas de Sessão do PNCP. O dado estruturado do PNCP (/resultados) NÃO traz marca;
// ela (e o histórico de lances) mora no PDF da Ata anexada (/arquivos). Fluxo por compra: acha a Ata → baixa PDF →
// extrai texto (unpdf) → LLM (Haiku) parseia a tabela de VENCEDORES (produto/modelo/marca) → LINKA ao itens_sc pelo
// VALOR (chave forte) → grava item_marca_sc; e regex conta LICITANTES/LANCES → compra_disputa_sc (força de disputa).
// RESUMÍVEL (controle _ata_check) e idempotente (UPSERT). LIMIT=N processa em lotes. node scripts/ingest_atas_marca_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod"; import { generateObject } from "ai";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
for (const f of [path.join(ROOT, ".env.ai"), path.join(ROOT, ".env.local")])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic("claude-haiku-4-5");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const B = "https://pncp.gov.br/api/pncp/v1";
const LIMIT = Number(process.env.LIMIT || 300);
const CONC = Number(process.env.CONC || 4);
const ANO_MIN = Number(process.env.ANO_MIN || 2024);
const CACHE = path.join(__dirname, "_atas_marca_cache.json");
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
let cacheDirty = 0; const saveCache = () => { fs.writeFileSync(CACHE, JSON.stringify(cache)); cacheDirty = 0; };
const brnum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const perto = (a, b) => Math.abs(a - b) / Math.max(b, 0.01) < 0.02;

const Schema = z.object({ itens: z.array(z.object({
  codigo: z.string(), produto: z.string(), modelo: z.string().nullable(),
  marca: z.string().nullable().describe("MARCA/FABRICANTE do produto (ex.: TIGRE, CHEVROLET). NÃO é o fornecedor/empresa vendedora. null se 'Própria'/'Próprio'/vazio."),
  valorUnitario: z.number(),
})) });
const SYS = `Você extrai a TABELA DE VENCEDORES de uma ata de licitação brasileira. Cada linha: código de 4 dígitos, depois produto, fornecedor (empresa vendedora), modelo, marca/fabricante, e 3 números finais (valor unitário, quantidade, valor total em formato 1.234,56).
Extraia por item: codigo, produto, modelo, marca (o FABRICANTE do produto — TIGRE, NESTLÉ, CHEVROLET…, NUNCA a empresa fornecedora/vendedora; se 'Própria'/'Próprio' use null), valorUnitario (o 1º dos 3 números, com ponto decimal). Ignore rodapé (Página X de Y, autenticidade, código verificador). Não invente linhas.`;

async function getJSON(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.json() : null; } catch { return null; } }
function achaAta(arqs) {
  if (!Array.isArray(arqs)) return null;
  // prioridade: AtaTotal (Betha) > Ata de Sessão/Julgamento/Final > Termo de Homologação
  const rx = [/^AtaTotal/i, /ata.*(sess|julg|final|realiza)/i, /(termo|extrato).*(homolog|adjudica)/i, /^ata\b|resultados?\.pdf/i];
  for (const r of rx) { const a = arqs.find((x) => r.test((x.titulo || x.nomeArquivo || "") + "")); if (a) return a.uri || a.url; }
  return null;
}
function disputa(text) {
  const t = text.replace(/\s+/g, " ");
  const nLances = (t.match(/\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}/g) || []).length;
  const cnpjs = new Set((t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []).map((x) => x.replace(/\D/g, "")));
  return { nLances, nLicitantes: cnpjs.size };
}
// FORMAT-AGNOSTIC: acha regiões de TABELA com coluna Marca (qualquer plataforma) — Betha "Vencedores Código…",
// Portal "Item Descrição … Marca/Modelo … Valor", etc. Retorna até 6 chunks (atas grandes agrupam por fornecedor).
function regioesTabela(text) {
  const t = text.replace(/A autenticidade[^]*?Página \d+ de \d+/gi, " ").replace(/\s+/g, " ");
  const hdr = /(?:Vencedores\s+C[óo]digo|(?:Item|C[óo]digo)\s+(?:Descriç[ãa]o|Produto)[^]{0,80}?Marca)/gi;
  const idx = []; let m; while ((m = hdr.exec(t)) !== null && idx.length < 6) idx.push(m.index);
  return idx.map((s, k) => t.slice(s, Math.min(s + 7000, idx[k + 1] ?? t.length, t.length)));
}
async function llmRegiao(reg) {
  const key = "v:" + reg.length + ":" + reg.slice(0, 160); if (cache[key]) return cache[key];
  const { object } = await generateObject({ model: MODEL, schema: Schema, temperature: 0, system: SYS, prompt: reg.slice(0, 8000) });
  cache[key] = object.itens; if (++cacheDirty >= 10) saveCache(); return object.itens;
}
async function llmVencedores(regioes) {
  const out = []; const visto = new Set();
  for (const reg of regioes) { let its = []; try { its = await llmRegiao(reg); } catch {}
    for (const p of its) { const k = (p.produto || "").slice(0, 30) + "|" + p.valorUnitario; if (!visto.has(k)) { visto.add(k); out.push(p); } } }
  return out;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); } } };
  await q(`CREATE TABLE IF NOT EXISTS _ata_check (cnpj TEXT, ano INT, seq INT, status TEXT, uri TEXT, checado_em timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);
  await q(`CREATE TABLE IF NOT EXISTS item_marca_sc (
    cod_ibge TEXT, cnpj TEXT, ano INT, seq INT, numero INT, descricao TEXT, produto_ata TEXT, modelo TEXT, marca TEXT,
    valor NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,numero))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_marca_cod ON item_marca_sc (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_marca_marca ON item_marca_sc (lower(marca))`);
  await q(`CREATE TABLE IF NOT EXISTS compra_disputa_sc (
    cod_ibge TEXT, cnpj TEXT, ano INT, seq INT, n_licitantes INT, n_lances INT, n_itens_marca INT,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_disputa_cod ON compra_disputa_sc (cod_ibge)`);

  // compras a processar: homologadas, ainda não checadas (resumível)
  // prioriza pregões grandes (muitos itens = têm ata + máximo de marca); dispensas (1-2 itens, sem ata) ficam p/ o fim
  const alvos = (await q(`SELECT i.cod_ibge, i.cnpj, i.ano, i.seq FROM itens_sc i
    LEFT JOIN _ata_check c ON c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq
    WHERE i.unit_homologado>0 AND i.ano>=${ANO_MIN} AND c.cnpj IS NULL
    GROUP BY 1,2,3,4 HAVING count(*) >= ${Number(process.env.MIN_ITENS || 5)}
    ORDER BY count(*) DESC LIMIT ${LIMIT}`)).rows;
  console.log(`${alvos.length} compras a checar (lote) · conc ${CONC}`);

  let comAta = 0, itensMarca = 0, disputaFraca = 0, i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < alvos.length) {
      const it = alvos[i++];
      try {
        const arqs = await getJSON(`${B}/orgaos/${it.cnpj}/compras/${it.ano}/${it.seq}/arquivos`);
        const uri = achaAta(arqs);
        if (!uri) { await q(`INSERT INTO _ata_check (cnpj,ano,seq,status) VALUES ($1,$2,$3,'sem_ata') ON CONFLICT DO NOTHING`, [it.cnpj, it.ano, it.seq]); continue; }
        let text; try { const buf = new Uint8Array(await (await fetch(uri, { signal: AbortSignal.timeout(35000) })).arrayBuffer()); text = (await extractText(await getDocumentProxy(buf), { mergePages: true })).text; } catch { await q(`INSERT INTO _ata_check (cnpj,ano,seq,status,uri) VALUES ($1,$2,$3,'erro_pdf',$4) ON CONFLICT DO NOTHING`, [it.cnpj, it.ano, it.seq, uri]); continue; }
        const { nLances, nLicitantes } = disputa(text);
        const venc = vencedoresTxt(text);
        let parsed = []; if (venc.length > 40) { try { parsed = await llmVencedores(venc); } catch {} }
        // linka por valor dentro da compra
        const nossos = (await q(`SELECT numero, descricao, unit_homologado FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND unit_homologado>0`, [it.cnpj, it.ano, it.seq])).rows;
        let nMarca = 0;
        for (const p of parsed) {
          if (!p.marca && !p.modelo) continue;
          const val = brnum(p.valorUnitario); const num = parseInt(p.codigo, 10);
          let nosso = nossos.find((x) => Number(x.numero) === num && perto(val, Number(x.unit_homologado)));
          if (!nosso) nosso = nossos.find((x) => perto(val, Number(x.unit_homologado)));
          if (!nosso) continue;
          await q(`INSERT INTO item_marca_sc (cod_ibge,cnpj,ano,seq,numero,descricao,produto_ata,modelo,marca,valor)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET produto_ata=EXCLUDED.produto_ata, modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, atualizado=now()`,
            [it.cod_ibge, it.cnpj, it.ano, it.seq, Number(nosso.numero), String(nosso.descricao || "").slice(0, 200), String(p.produto || "").slice(0, 200), p.modelo ? String(p.modelo).slice(0, 80) : null, p.marca ? String(p.marca).slice(0, 80) : null, Number(nosso.unit_homologado)]);
          nMarca++; itensMarca++;
        }
        await q(`INSERT INTO compra_disputa_sc (cod_ibge,cnpj,ano,seq,n_licitantes,n_lances,n_itens_marca) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_licitantes=EXCLUDED.n_licitantes, n_lances=EXCLUDED.n_lances, n_itens_marca=EXCLUDED.n_itens_marca, atualizado=now()`,
          [it.cod_ibge, it.cnpj, it.ano, it.seq, nLicitantes, nLances, nMarca]);
        await q(`INSERT INTO _ata_check (cnpj,ano,seq,status,uri) VALUES ($1,$2,$3,'ok',$4) ON CONFLICT DO NOTHING`, [it.cnpj, it.ano, it.seq, uri]);
        comAta++; if (nLicitantes && nLicitantes <= 1) disputaFraca++;
      } catch (e) { /* deixa p/ o próximo run */ }
      if (++done % 20 === 0) { saveCache(); process.stdout.write(`  ${done}/${alvos.length} · ${comAta} c/ata · ${itensMarca} marcas\r`); }
    }
  }));
  saveCache();
  console.log(`\n✔ lote: ${comAta} compras com ata · ${itensMarca} itens com marca linkada · ${disputaFraca} compras com disputa fraca (≤1 licitante)`);
  const tot = (await q(`SELECT (SELECT count(*) FROM _ata_check) checadas, (SELECT count(*) FROM _ata_check WHERE status='ok') ok, (SELECT count(*) FROM item_marca_sc) marcas, (SELECT count(DISTINCT marca) FROM item_marca_sc WHERE marca IS NOT NULL) distintas`)).rows[0];
  console.log(`ACUMULADO: ${Number(tot.checadas).toLocaleString()} compras checadas · ${Number(tot.ok).toLocaleString()} com ata · ${Number(tot.marcas).toLocaleString()} itens-marca · ${Number(tot.distintas).toLocaleString()} marcas distintas`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
