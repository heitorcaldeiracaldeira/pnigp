// EXTRATOR — bloco "Vencedores" do Portal de Compras Públicas (arquivo_texto_sc.gerador='portal_vencedores').
//
// POR QUE EXISTE: o Portal emite DUAS tabelas. O parser_ecustomize lê a de PROPOSTAS (todos os licitantes, com
// CNPJ + data + Sim/Não). A de VENCEDORES não tem CNPJ, nem data, nem Sim/Não — o parser de propostas devolve zero.
// Medido: era o MAIOR bloco da fila (2.106 de 7.761 docs com marca que nenhum parser lia). O parser novo lê 87%.
//
// COBERTURA = "vencedor": marca do ganhador por item + valor + quantidade. NÃO tem os concorrentes (quem quiser
// disputa tem que usar a tabela de propostas, quando o documento a traz).
// GRAVA: item_marca_sc (marca por item). NÃO grava disputa — este bloco não tem os licitantes.
//
// PONTE lote→item: o "Código" do bloco (0001, 0002…) é a numeração do DOCUMENTO. O numeroItem do PNCP pode ser
// outro (medido: AZ/Licitanet/BB publicam ID interno). Casa por DESCRIÇÃO, como no AZ; sem casar, DESCARTA.
// node scripts/extrai_portal_vencedores.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { PARSER_VERSAO } from "./parser_versao.mjs";
import { parseVencedoresPortal } from "./parser_ecustomize.mjs";
import { casaItens } from "./parser_az.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
db.on("error", () => {});
const FATAL = new Set(["21000", "22P05", "22021", "23505", "23502", "42703", "42P10"]);
const q = async (s, p) => {
  let u; for (let i = 0; i < 20; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } }
  throw new Error(`db (${u?.code}): ${u?.message}`);
};
const atas = (await q(`SELECT d.cnpj,d.ano,d.seq,d.cod_ibge FROM arquivo_texto_sc d
  WHERE d.gerador='portal_vencedores' AND d.chars > 500
    AND d.parser_versao IS DISTINCT FROM ${PARSER_VERSAO}
  GROUP BY 1,2,3,4 ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
console.log(`${atas.length.toLocaleString("pt-BR")} atas 'Vencedores' a extrair`);

let done = 0, comMarca = 0, erros = 0, totItens = 0, semCasar = 0;
for (const e of atas) {
  try {
    // filtrar pelo gerador aqui também: sem isso pega o MAIOR texto do processo (pode ser o edital)
    const tx = (await q(`SELECT texto FROM arquivo_texto_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND gerador='portal_vencedores'
      ORDER BY chars DESC LIMIT 1`, [e.cnpj, e.ano, e.seq])).rows[0];
    const brutos = parseVencedoresPortal(tx?.texto || "").map((r) => ({ ...r, lote: r.numero, descricao: r.produto }));
    if (!brutos.length) { await feito(e, 0); continue; }
    const itens = (await q(`SELECT numero, descricao FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3`, [e.cnpj, e.ano, e.seq])).rows;
    const regs = casaItens(brutos, itens).filter((r) => { if (r.numero == null) { semCasar++; return false; } return true; });
    if (regs.length) {
      const M = { num: [], desc: [], mar: [], val: [] };
      const vistos = new Set();
      for (const r of regs) { if (vistos.has(r.numero)) continue; vistos.add(r.numero);
        M.num.push(r.numero); M.desc.push(r.produto || null); M.mar.push(r.marca); M.val.push(r.valorUnitario || null); }
      await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,marca,valor)
        SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::numeric[]) AS t(numero,descricao,marca,valor)
        ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=COALESCE(EXCLUDED.descricao,item_marca_sc.descricao),
          marca=COALESCE(EXCLUDED.marca, item_marca_sc.marca), valor=COALESCE(EXCLUDED.valor, item_marca_sc.valor), atualizado=now()`,
        [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.desc, M.mar, M.val]);
      totItens += M.num.length;
      if (M.mar.some(Boolean)) comMarca++;
    }
    await feito(e, new Set(regs.filter((r) => r.marca).map((r) => r.marca.toLowerCase())).size);
  } catch (err) { if (++erros <= 10) console.log(`\n  ⚠ ${e.ano}/${e.seq}: ${err.message}`); }
  if (++done % 50 === 0) process.stdout.write(`  ${done}/${atas.length} · ${comMarca} c/marca · ${erros} erros\r`);
}
async function feito(e, n) {
  // estado NO DOCUMENTO (+versão): parser mudou → reprocessa sozinho. Ver parser_versao.mjs.
  await q(`UPDATE arquivo_texto_sc SET parser_versao=${PARSER_VERSAO}, n_registros=$4, lido_em=now()
    WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND gerador='portal_vencedores'`, [e.cnpj, e.ano, e.seq, n]);
  await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_marcas) VALUES ($1,$2,$3,$4)
    ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_marcas=EXCLUDED.n_marcas, feito_em=now()`, [e.cnpj, e.ano, e.seq, n]);
}
const s = (await q(`SELECT count(*) FILTER (WHERE marca IS NOT NULL) m, count(DISTINCT lower(marca)) d FROM item_marca_sc`)).rows[0];
console.log(`\n✔ Vencedores: ${totItens.toLocaleString("pt-BR")} itens · ${comMarca} atas c/ marca · descartados s/ casar: ${semCasar} · erros: ${erros}`);
console.log(`  item_marca_sc: ${Number(s.m).toLocaleString("pt-BR")} itens com marca · ${s.d} marcas distintas`);
await db.end();
