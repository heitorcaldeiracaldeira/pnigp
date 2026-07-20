// EXTRATOR UNIFICADO — roda os parsers determinísticos NOVOS (Pública, LicitarDigital, Dispensa/Inexig, IPM),
// casa cada item ao PNCP pela DESCRIÇÃO (casaItens), determina o VENCEDOR e grava a marca em item_marca_sc.
// Zero LLM. Resumível (marca_ata_feitas). node scripts/extrai_marca_multi.mjs   [FORMATO=publica|licitar|dispensa|ipm] LIMIT=n
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { casaItens } from "./parser_az.mjs";
import { parseAtaPublica } from "./parser_publica.mjs";
import { parseAtaLicitarDigital } from "./parser_licitar_digital.mjs";
import { parseAtaDispensaTermo } from "./parser_dispensa_termo.mjs";
import { parseAtaIpm } from "./parser_ipm.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const SO = process.env.FORMATO || null;   // roda só um formato, se setado
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lim = LIMIT ? `LIMIT ${LIMIT}` : "";

// seleção por formato. 'outro' + assinatura no PREFIXO (left) evita varrer o texto inteiro (TOAST).
const FORMATOS = [
  { id: "licitar", parse: parseAtaLicitarDigital,
    sel: `d.gerador='licitar_digital' AND d.chars>800` },
  { id: "publica", parse: parseAtaPublica,
    sel: `d.gerador='outro' AND d.chars>800 AND left(d.texto,9000) ~* 'participante:'` },
  { id: "ipm", parse: parseAtaIpm,
    sel: `d.gerador='outro' AND d.chars>800 AND left(d.texto,9000) ~* 'atende\\.net|ipm sistemas'` },
  { id: "dispensa", parse: parseAtaDispensaTermo,
    sel: `d.chars>500 AND EXISTS (SELECT 1 FROM contratacoes_sc c WHERE c.cnpj=d.cnpj AND c.ano=d.ano AND c.seq=d.seq AND c.modalidade_id IN (8,9,12))` },
];

async function main() {
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10", "21000"].includes(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };
  await q(`CREATE TABLE IF NOT EXISTS marca_ata_feitas (cnpj TEXT, ano INT, seq INT, n_propostas INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);

  let totMarca = 0;
  for (const F of FORMATOS) {
    if (SO && SO !== F.id) continue;
    // chaves primeiro (leve); o texto vem por ata no loop
    const atas = (await q(`SELECT d.cnpj,d.ano,d.seq,d.cod_ibge FROM arquivo_texto_sc d
      WHERE ${F.sel}
        AND NOT EXISTS (SELECT 1 FROM marca_ata_feitas f WHERE f.cnpj=d.cnpj AND f.ano=d.ano AND f.seq=d.seq)
      GROUP BY d.cnpj,d.ano,d.seq,d.cod_ibge ${lim}`)).rows;
    console.log(`[${F.id}] ${atas.length.toLocaleString()} atas a processar`);
    let feitas = 0, comMarca = 0;
    for (const e of atas) {
      try {
        // roda o parser em TODOS os docs do processo (a marca da dispensa vive no termo/proposta, nem sempre o maior)
        const docs = (await q(`SELECT texto FROM arquivo_texto_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND chars BETWEEN 300 AND 80000 ORDER BY chars DESC LIMIT 12`, [e.cnpj, e.ano, e.seq])).rows;
        let recs = [];
        for (const d of docs) { try { const rr = F.parse(d.texto || "") || []; for (const r of rr) if (r && r.descricao) recs.push(r); } catch {} }
        { const seen = new Set(); recs = recs.filter((r) => { const k = (r.descricao || "").slice(0, 80) + "|" + (r.marca || ""); if (seen.has(k)) return false; seen.add(k); return true; }); }
        if (recs.length) {
          const api = (await q(`SELECT numero, descricao, cnpj_fornecedor, situacao FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3`, [e.cnpj, e.ano, e.seq])).rows
            .map((r) => ({ numero: Number(r.numero), descricao: r.descricao, cnpj: r.cnpj_fornecedor ? String(r.cnpj_fornecedor).replace(/\D/g, "") : null, situacao: r.situacao }));
          if (api.length) {
            // casa cada rec ao numeroItem REAL do PNCP pela descrição; sem casar → dropa (não pendura no item errado)
            const casados = casaItens(recs.map((r) => ({ item: r.item ?? r.codigo ?? r.numero, descricao: r.descricao })), api);
            recs.forEach((r, i) => { r._numero = casados[i]?.numero ?? null; });
            const ok = recs.filter((r) => r._numero != null && r.marca);
            // vencedor por item: prefere o que bate o CNPJ do vencedor da API; senão o classificado; senão o 1º c/ marca
            const vencCnpj = new Map(); for (const it of api) if (it.situacao === "Homologado" && it.cnpj) vencCnpj.set(it.numero, it.cnpj);
            const porItem = new Map();
            for (const r of ok) {
              const cur = porItem.get(r._numero);
              const rcnpj = r.cnpjFornecedor ? String(r.cnpjFornecedor).replace(/\D/g, "") : (r.cnpj ? String(r.cnpj).replace(/\D/g, "") : null);
              const bateApi = rcnpj && vencCnpj.get(r._numero) === rcnpj;
              const score = (bateApi ? 100 : 0) + (r.classificado ? 10 : 0);
              if (!cur || score > cur._score) porItem.set(r._numero, { ...r, _score: score });
            }
            if (porItem.size) {
              const M = { num: [], desc: [], mod: [], mar: [], val: [] };
              for (const [numero, r] of porItem) { M.num.push(numero); M.desc.push(String(r.descricao || "").slice(0, 200)); M.mod.push(r.modelo ? String(r.modelo).slice(0, 80) : null); M.mar.push(String(r.marca).slice(0, 80)); M.val.push(r.valorUnitario || null); }
              await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,modelo,marca,valor)
                SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::numeric[]) AS t(numero,descricao,modelo,marca,valor)
                ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=COALESCE(EXCLUDED.descricao,item_marca_sc.descricao), modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, valor=EXCLUDED.valor, atualizado=now()`,
                [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.desc, M.mod, M.mar, M.val]);
              comMarca++; totMarca += M.num.length;
            }
          }
        }
        await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_propostas) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_propostas=EXCLUDED.n_propostas, feito_em=now()`, [e.cnpj, e.ano, e.seq, recs.length]);
      } catch { /* deixa p/ o próximo run */ }
      if (++feitas % 50 === 0) process.stdout.write(`  [${F.id}] ${feitas}/${atas.length} · ${comMarca} c/marca\r`);
    }
    console.log(`\n[${F.id}] concluído: ${feitas} atas · ${comMarca} com marca`);
  }
  console.log(`\n✔ total de itens com marca gravados nesta rodada: ${totMarca.toLocaleString()}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
