// EXTRATOR DETERMINÍSTICO — atas NATIVAS do Betha (arquivo_texto_sc.gerador='betha').
// Roteado pelo GERADOR do documento, NÃO pela plataforma do PNCP (=quem publicou; ver mapa_atas_plataformas.mjs).
//
// O QUE GRAVA (só o que o documento diz — sem inventar granularidade):
//   · item_marca_sc          — MARCA/modelo/valor por ITEM (é a do VENCEDOR do lote; o Betha não dá marca por concorrente)
//   · contratacao_disputa_sc — n_licitantes (CNPJs distintos) + n_marcas = sinal de DISPUTA
//   · marca_ata_feitas       — marcador de "feito" (resumível). Compartilhado com o extrator do ECustomize: sem risco
//                              de colisão, pois cada ata tem UM gerador.
// O QUE NÃO GRAVA: propostas_sc. As ofertas do Betha são por LOTE (inicial→final), e propostas_sc.numero é ITEM —
// gravar lote como item seria misturar granularidade. Ver [[pnigp-nomenclatura-pncp]] (espelhar, não inventar).
// node scripts/extrai_betha.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { PARSER_VERSAO } from "./parser_versao.mjs";
import { parseAtaBetha } from "./parser_betha.mjs";
import { casaItens } from "./parser_az.mjs";   // casa o item da ata ao do PNCP pela DESCRIÇÃO (conserto do bug do número)
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  // erro de dado/schema falha NA HORA (retry cego escondeu bugs por horas — ver ingest_arquivo_texto_sc)
  const FATAL = new Set(["21000", "22P05", "22021", "23505", "23502", "42703", "42P10"]);
  const q = async (s, p) => {
    let u; for (let i = 0; i < 20; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } }
    throw new Error(`db (${u?.code}): ${u?.message}`);
  };

  const atas = (await q(`SELECT d.cnpj,d.ano,d.seq,d.cod_ibge FROM arquivo_texto_sc d
    WHERE d.gerador='betha' AND d.chars > 200
      AND d.parser_versao IS DISTINCT FROM ${PARSER_VERSAO}
    GROUP BY 1,2,3,4 ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${atas.length.toLocaleString()} atas Betha-nativas a extrair (determinístico)`);

  let comMarca = 0, done = 0, erros = 0, totItens = 0;
  for (const e of atas) {
    try {
      const tx = (await q(`SELECT texto FROM arquivo_texto_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY chars DESC LIMIT 1`, [e.cnpj, e.ano, e.seq])).rows[0];
      const r = parseAtaBetha(tx?.texto || "");
      // dedup por item (o mesmo item pode reaparecer em blocos repetidos do PDF) — mantém o de maior valor lançado
      const porItem = new Map();
      for (const i of r.itens) { const c = porItem.get(i.numero); if (!c || (i.marca && !c.marca)) porItem.set(i.numero, i); }
      const itens = [...porItem.values()];
      // 🔴 CONSERTO (mesmo bug do ecustomize): NÃO confiar no nº do item do documento Betha — casar pela DESCRIÇÃO ao
      // item do PNCP (casaItens, MIN_SIM 0.6). Sem casar → dropa (o numeroItem do PNCP nem sempre = nº do documento).
      const apiItens = (await q(`SELECT numero, descricao FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3`, [e.cnpj, e.ano, e.seq])).rows
        .map((r) => ({ numero: Number(r.numero), descricao: r.descricao }));
      const casados = casaItens(itens.map((i) => ({ item: i.numero, descricao: i.descricao })), apiItens);
      itens.forEach((i, k) => { i._numero = casados[k]?.numero ?? null; });
      const itensOk = itens.filter((i) => i._numero != null);
      if (itensOk.length) {
        const M = { num: [], desc: [], mod: [], mar: [], val: [] };
        for (const i of itensOk) {
          M.num.push(i._numero); M.desc.push(i.descricao || null); M.mod.push(i.modelo); M.mar.push(i.marca); M.val.push(i.valorUnitario || null);
        }
        await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,modelo,marca,valor)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::numeric[]) AS t(numero,descricao,modelo,marca,valor)
          ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=COALESCE(EXCLUDED.descricao,item_marca_sc.descricao),
            modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, valor=EXCLUDED.valor, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.desc, M.mod, M.mar, M.val]);
        totItens += itensOk.length;
        if (itens.some((i) => i.marca)) comMarca++;
      }
      const nMarcas = new Set(itens.filter((i) => i.marca).map((i) => i.marca.toLowerCase())).size;
      if (r.participantes.length || itens.length) {
        await q(`INSERT INTO contratacao_disputa_sc (cnpj,ano,seq,cod_ibge,n_licitantes,n_marcas,n_itens_marca) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_licitantes=EXCLUDED.n_licitantes, n_marcas=EXCLUDED.n_marcas,
            n_itens_marca=EXCLUDED.n_itens_marca, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, e.cod_ibge, r.participantes.length, nMarcas, itens.filter((i) => i.marca).length]);
      }
      // estado NO DOCUMENTO (+versão): parser mudou → reprocessa sozinho. Ver parser_versao.mjs.
      await q(`UPDATE arquivo_texto_sc SET parser_versao=${PARSER_VERSAO}, n_registros=$4, lido_em=now()
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND gerador='betha'`, [e.cnpj, e.ano, e.seq, nMarcas]);
      await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_marcas) VALUES ($1,$2,$3,$4)
        ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_marcas=EXCLUDED.n_marcas, feito_em=now()`, [e.cnpj, e.ano, e.seq, nMarcas]);
    } catch (err) {
      if (++erros <= 10) console.log(`\n  ⚠ falhou ${e.ano}/${e.seq}: ${err.message}`);
    }
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${atas.length} · ${comMarca} c/marca · ${erros} erros\r`);
  }
  const s = (await q(`SELECT count(*) itens, count(DISTINCT lower(marca)) marcas FROM item_marca_sc WHERE marca IS NOT NULL`)).rows[0];
  console.log(`\n✔ Betha: ${totItens.toLocaleString()} itens gravados · ${comMarca} atas c/ marca · ${erros} erros`);
  console.log(`  item_marca_sc total: ${Number(s.itens).toLocaleString()} itens com marca · ${Number(s.marcas).toLocaleString()} marcas distintas`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
