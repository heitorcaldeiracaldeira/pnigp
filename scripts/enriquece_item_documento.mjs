// ENRIQUECEDOR — consome o corpus JÁ GUARDADO (arquivo_texto_sc + itens_sc) e, por item, percorre TODOS os
// documentos da construção DO PRIMEIRO AO ÚLTIMO (DFD→ETP→TR→Edital…), localiza a descrição do item em CADA um e
// grava a comparação. Duas tabelas (ANDAR 2, derivadas — Lei 1):
//   · app.item_enriquecimento          — 1 linha/item: O QUE TÍNHAMOS (API) · O QUE ENRIQUECEMOS · COMO CHEGAMOS
//   · app.item_documento_evidencia     — 1 linha/(item×documento): a descrição em CADA doc, na ordem da construção
// NÃO toca no PNCP e NÃO toca no motor do CATMAT. Resumível, idempotente. node scripts/enriquece_item_documento.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { casa } from "./casa_itens.mjs";
import { ehEspecificacao } from "./classifica_especificacao.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 4);
const RANK = { alta: 3, media: 2, baixa: 1 };
// ORDEM DA CONSTRUÇÃO (fase preparatória → publicação) — o "primeiro ao último documento"
const FASE = { 10: "DFD", 7: "ETP", 5: "Anteprojeto", 6: "Projeto Básico", 8: "Projeto Executivo", 4: "TR",
  9: "Mapa de Riscos", 3: "Minuta do Contrato", 1: "Aviso de Contratação Direta", 2: "Edital", 20: "Ato de Contratação Direta", 16: "Outros" };
const ORDER = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];
const CRIACAO = ORDER;
const PRIO_CAT = [4, 2, 6, 7];   // código de catálogo: TR, Edital, PB, ETP primeiro
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function catalogo(docNorm, off) {
  if (off == null) return null;
  const nums = [...docNorm.slice(Math.max(0, off - 45), off + 5).matchAll(/\b\d{5,9}\b/g)].map((m) => m[0]);
  return nums.length ? nums[nums.length - 1] : null;
}
// BLOCO de spec = do anchor do item ATÉ o anchor do próximo item no MESMO doc (capado)
function bloco(docNorm, off, offs, cap = 600) {
  if (off == null) return null;
  const nexts = offs.filter((o) => o != null && o > off);
  const end = Math.min(off + cap, nexts.length ? Math.min(...nexts) : off + cap);
  const b = docNorm.slice(Math.max(0, off - 60), end).replace(/\s+/g, " ").trim();
  return b.length >= 12 ? b : null;
}
const consolida = (n, base) => (n === 0 ? "ausente" : n >= 3 ? "alta" : (n >= 2 && RANK[base] >= 2) ? "alta" : base);

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 5; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10"].includes(e.code)) throw e; await sleep(1000 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  await q(`CREATE SCHEMA IF NOT EXISTS app`);
  await q(`CREATE TABLE IF NOT EXISTS app.item_enriquecimento (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, material_servico TEXT,
    descricao_api TEXT, unidade_api TEXT, catalogo_api TEXT,
    descricao_documento TEXT, descricao_e_spec BOOLEAN, catalogo_codigo TEXT,
    confianca TEXT, fonte_documento TEXT, fonte_tipo_id INT, n_docs INT, docs TEXT, metodo TEXT, trecho_ancora TEXT,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj, ano, seq, numero))`);
  await q(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS descricao_e_spec BOOLEAN`);
  await q(`CREATE TABLE IF NOT EXISTS app.item_documento_evidencia (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT,
    ordem INT, fase TEXT, tipo_id INT, sequencial_documento INT,
    descricao_no_documento TEXT, eh_spec BOOLEAN, spec_score NUMERIC, score NUMERIC, conf TEXT,
    atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq, numero, tipo_id, sequencial_documento))`);
  await q(`ALTER TABLE app.item_documento_evidencia ADD COLUMN IF NOT EXISTS eh_spec BOOLEAN`);
  await q(`ALTER TABLE app.item_documento_evidencia ADD COLUMN IF NOT EXISTS spec_score NUMERIC`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_cod ON app.item_enriquecimento (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_conf ON app.item_enriquecimento (confianca)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_iev_item ON app.item_documento_evidencia (cnpj,ano,seq,numero)`);

  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const procs = (await q(`
    SELECT t.cnpj, t.ano, t.seq, count(DISTINCT a.tipo_documento_id) nfases FROM arquivo_texto_sc t
    JOIN arquivos_sc a USING (cnpj, ano, seq, sequencial_documento)
    WHERE t.chars > 500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($1)
      AND NOT EXISTS (SELECT 1 FROM app.item_enriquecimento e WHERE e.cnpj=t.cnpj AND e.ano=t.ano AND e.seq=t.seq)
    GROUP BY t.cnpj, t.ano, t.seq ORDER BY nfases DESC ${lim}`, [CRIACAO])).rows;
  console.log(`enriquecer: ${procs.length.toLocaleString()} processos (do mais rico em documentos p/ o mais pobre) · conc ${CONC}`);

  let i = 0, done = 0, itensOk = 0, comDesc = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      try {
        const itens = (await q(`SELECT numero, descricao, unidade, catmat, material_ou_servico FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY numero`, [p.cnpj, p.ano, p.seq]))
          .rows.map((r) => ({ numeroItem: r.numero, descricao: r.descricao, unidade: r.unidade, catmat: r.catmat, material_ou_servico: r.material_ou_servico }));
        if (!itens.length) continue;
        // documentos da construção COM texto, ORDENADOS do primeiro ao último
        const docs = (await q(`SELECT a.tipo_documento_id tid, t.sequencial_documento sd, t.texto, t.cod_ibge FROM arquivo_texto_sc t
          JOIN arquivos_sc a USING (cnpj, ano, seq, sequencial_documento)
          WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND t.chars>500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($4)`, [p.cnpj, p.ano, p.seq, CRIACAO])).rows
          .sort((a, b) => ORDER.indexOf(a.tid) - ORDER.indexOf(b.tid));
        if (!docs.length) continue;
        const cod_ibge = docs[0].cod_ibge;
        const porDoc = docs.map((d) => ({ tid: d.tid, sd: d.sd, ...casa(itens, d.texto) }));

        for (let k = 0; k < itens.length; k++) {
          // EVIDÊNCIA POR DOCUMENTO — a descrição do item em CADA doc (1º ao último); DEDUPE por texto (obras têm
          // dezenas de docs iguais) e CLASSIFICA o bloco (é especificação × cláusula × planilha-pobre) pelo portão.
          const evid = []; const vistos = new Set();
          for (const D of porDoc) {
            const r = D.res[k]; if (!r || r.off == null) continue;
            const desc = bloco(D.docNorm, r.off, D.res.map((x) => x && x.off));
            if (!desc) continue;
            const key = desc.slice(0, 140);
            if (vistos.has(key)) continue;   // colapsa documentos repetidos com o mesmo bloco
            vistos.add(key);
            const cls = ehEspecificacao(desc);
            evid.push({ tid: D.tid, sd: D.sd, ordem: ORDER.indexOf(D.tid), fase: FASE[D.tid] || `tipo ${D.tid}`, desc, score: r.score ?? null, conf: r.conf, docNorm: D.docNorm, off: r.off, ehSpec: cls.ok, specScore: cls.score });
            await q(`INSERT INTO app.item_documento_evidencia (cnpj,ano,seq,numero,cod_ibge,ordem,fase,tipo_id,sequencial_documento,descricao_no_documento,eh_spec,spec_score,score,conf)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
              ON CONFLICT (cnpj,ano,seq,numero,tipo_id,sequencial_documento) DO UPDATE SET
                descricao_no_documento=EXCLUDED.descricao_no_documento, eh_spec=EXCLUDED.eh_spec, spec_score=EXCLUDED.spec_score, score=EXCLUDED.score, conf=EXCLUDED.conf, ordem=EXCLUDED.ordem, fase=EXCLUDED.fase, atualizado=now()`,
              [p.cnpj, p.ano, p.seq, itens[k].numeroItem, cod_ibge, ORDER.indexOf(D.tid), FASE[D.tid] || `tipo ${D.tid}`, D.tid, D.sd, desc, cls.ok, cls.score, r.score ?? null, r.conf]);
          }
          // CONSOLIDADO — PREFERE um bloco que É especificação (portão); convergência eleva a confiança
          const specs = evid.filter((e) => e.ehSpec);
          const pool_ = specs.length ? specs : evid;
          const best = [...pool_].sort((a, b) => (b.specScore || 0) - (a.specScore || 0) || RANK[b.conf] - RANK[a.conf] || (b.score || 0) - (a.score || 0))[0];
          const conf = consolida(evid.length, best ? best.conf : "baixa");
          let cat = null;
          for (const h of [...evid].sort((a, b) => (PRIO_CAT.indexOf(a.tid) + 99) % 99 - (PRIO_CAT.indexOf(b.tid) + 99) % 99)) { cat = catalogo(h.docNorm, h.off); if (cat) break; }
          const metodo = !best ? "sem acerto" : evid.length >= 2 ? `convergência (${evid.length} docs)` : "conteúdo";
          const trecho = best ? best.docNorm.slice(Math.max(0, best.off - 12), best.off + 48).replace(/\s+/g, " ").trim() : null;
          const fasesDistintas = [...new Set(evid.slice().sort((a, b) => a.ordem - b.ordem).map((e) => e.fase))].join(" → ");

          await q(`INSERT INTO app.item_enriquecimento
            (cnpj,ano,seq,numero,cod_ibge,material_servico, descricao_api,unidade_api,catalogo_api,
             descricao_documento,descricao_e_spec,catalogo_codigo, confianca,fonte_documento,fonte_tipo_id,n_docs,docs,metodo,trecho_ancora)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET
              descricao_api=EXCLUDED.descricao_api, unidade_api=EXCLUDED.unidade_api, catalogo_api=EXCLUDED.catalogo_api,
              descricao_documento=EXCLUDED.descricao_documento, descricao_e_spec=EXCLUDED.descricao_e_spec, catalogo_codigo=EXCLUDED.catalogo_codigo,
              confianca=EXCLUDED.confianca, fonte_documento=EXCLUDED.fonte_documento, fonte_tipo_id=EXCLUDED.fonte_tipo_id,
              n_docs=EXCLUDED.n_docs, docs=EXCLUDED.docs, metodo=EXCLUDED.metodo, trecho_ancora=EXCLUDED.trecho_ancora, atualizado=now()`,
            [p.cnpj, p.ano, p.seq, itens[k].numeroItem, cod_ibge, itens[k].material_ou_servico,
             itens[k].descricao, itens[k].unidade, itens[k].catmat,
             best ? best.desc : null, best ? best.ehSpec : null, cat, conf, best ? best.fase : null, best ? best.tid : null, evid.length,
             fasesDistintas, metodo, trecho]);
          itensOk++; if (best && best.ehSpec) comDesc++;
        }
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 20 === 0) process.stdout.write(`  ${done}/${procs.length} · ${itensOk} itens · ${comDesc} c/descrição\r`);
    }
  }));

  const s = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE descricao_documento IS NOT NULL)::int d,
    count(*) FILTER (WHERE descricao_e_spec)::int sp, count(*) FILTER (WHERE confianca='alta')::int a FROM app.item_enriquecimento`)).rows[0];
  const e = (await q(`SELECT count(*)::int n FROM app.item_documento_evidencia`)).rows[0];
  console.log(`\n✔ item_enriquecimento: ${s.n.toLocaleString()} itens · ${s.d.toLocaleString()} c/ descrição do doc · ${s.sp.toLocaleString()} que É especificação · ${s.a.toLocaleString()} conf alta`);
  console.log(`✔ item_documento_evidencia: ${e.n.toLocaleString()} linhas (item × documento, ordem da construção)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
