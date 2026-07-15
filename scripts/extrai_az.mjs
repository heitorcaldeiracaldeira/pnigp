// EXTRATOR — atas "Resultados" da AZ (arquivo_texto_sc.gerador='az'). Roteado pelo GERADOR, não pela plataforma.
//
// ═══ O QUE O MANUAL DO PNCP DIZ (https://pncp.gov.br/manual/pt-br/latest/singlehtml/) ═══
// §7.14: "situacaoCompraItemId ... rastrear o ciclo de vida de cada ITEM OU LOTE pertencente a um processo"
// §7.16: "...desfecho comercial de cada ITEM OU LOTE ADJUDICADO"
// → No PNCP **LOTE E ITEM SÃO A MESMA ENTIDADE**. Quando a compra é julgada por lote, o LOTE *é* o item do PNCP.
//   Por isso o documento da AZ mostra "Lote 1 / Item: 1": o LOTE dele = o ITEM do PNCP; o "Item: 1" é a numeração
//   interna do lote. A chave é o LOTE — nunca o "Item:" (que é sempre 1).
//
// ═══ POR QUE AINDA PRECISA CASAR POR DESCRIÇÃO ═══
// O manual manda `numeroItem` ser "único e sequencial crescente" (1,2,3). Medido nos 241k processos:
//   Betha/IPM/ECustomize/Pública/BLL → sequencial 1..N (98-100%): CONFORME.
//   **AZ, Licitanet, Licitações-E BB → publicam o ID INTERNO do sistema deles** (ex. 1.591.461): FORA DA SPEC.
// Logo, p/ AZ o `numeroItem` do PNCP não é o nº do lote — a ponte é a DESCRIÇÃO (medido: 749/749, similaridade 1.00).
// Sem casamento confiável o registro é DESCARTADO: melhor perder do que pendurar a marca no item errado.
//
// GRAVA: item_marca_sc (marca do VENCEDOR por item) + contratacao_disputa_sc (n_licitantes = o sinal de disputa).
// NÃO grava propostas_sc de layout 2 (é por fornecedor, sem os concorrentes).
// node scripts/extrai_az.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { parseAtaAz, casaItens } from "./parser_az.mjs";
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
  WHERE d.gerador='az' AND d.chars > 500
    AND NOT EXISTS (SELECT 1 FROM marca_ata_feitas f WHERE f.cnpj=d.cnpj AND f.ano=d.ano AND f.seq=d.seq)
  GROUP BY 1,2,3,4 ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
console.log(`${atas.length.toLocaleString("pt-BR")} atas AZ a extrair`);

let done = 0, comMarca = 0, erros = 0, totItens = 0, semCasar = 0, totLic = 0;
for (const e of atas) {
  try {
    // ⚠️ FILTRAR PELO GERADOR aqui também: sem isto pega o MAIOR texto do processo (pode ser o edital!) e o parser
    // recebe o documento errado → 0 licitantes. O processo tem vários documentos; só o do gerador 'az' é a ata dele.
    const tx = (await q(`SELECT texto FROM arquivo_texto_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND gerador='az'
      ORDER BY chars DESC LIMIT 1`, [e.cnpj, e.ano, e.seq])).rows[0];
    const brutos = parseAtaAz(tx?.texto || "");
    if (!brutos.length) { await marcaFeito(e, 0); continue; }
    totLic += brutos.length;
    // ponte lote → numeroItem do PNCP (ver cabeçalho)
    const itens = (await q(`SELECT numero, descricao FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3`, [e.cnpj, e.ano, e.seq])).rows;
    const regs = casaItens(brutos, itens).filter((r) => {
      if (r.numero == null) { semCasar++; return false; }   // sem ponte confiável → descarta (não inventa item)
      return true;
    });
    // marca do VENCEDOR por item (item_marca_sc é 1 linha por item)
    const venc = new Map();
    for (const r of regs) {
      if (!r.vencedor && venc.has(r.numero)) continue;
      const c = venc.get(r.numero);
      if (!c || (r.vencedor && !c.vencedor) || (r.vencedor === c.vencedor && r.valorUnitario < c.valorUnitario)) venc.set(r.numero, r);
    }
    if (venc.size) {
      const M = { num: [], desc: [], mod: [], mar: [], val: [] };
      for (const [n, r] of venc) { M.num.push(n); M.desc.push(r.descricao || null); M.mod.push(r.modelo); M.mar.push(r.marca); M.val.push(r.valorUnitario || null); }
      await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,modelo,marca,valor)
        SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::numeric[]) AS t(numero,descricao,modelo,marca,valor)
        ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET descricao=COALESCE(EXCLUDED.descricao,item_marca_sc.descricao),
          modelo=EXCLUDED.modelo, marca=EXCLUDED.marca, valor=EXCLUDED.valor, atualizado=now()`,
        [e.cnpj, e.ano, e.seq, e.cod_ibge, M.num, M.desc, M.mod, M.mar, M.val]);
      totItens += venc.size;
      if ([...venc.values()].some((r) => r.marca)) comMarca++;
    }
    // DISPUTA: licitantes distintos no processo (o sinal de "preço justo por competição real")
    const nLic = new Set(regs.map((r) => r.cnpj)).size;
    const nMarcas = new Set(regs.filter((r) => r.marca).map((r) => r.marca.toLowerCase())).size;
    if (nLic) await q(`INSERT INTO contratacao_disputa_sc (cnpj,ano,seq,cod_ibge,n_licitantes,n_marcas,n_itens_marca) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_licitantes=EXCLUDED.n_licitantes, n_marcas=EXCLUDED.n_marcas,
        n_itens_marca=EXCLUDED.n_itens_marca, atualizado=now()`,
      [e.cnpj, e.ano, e.seq, e.cod_ibge, nLic, nMarcas, [...venc.values()].filter((r) => r.marca).length]);
    await marcaFeito(e, nMarcas);
  } catch (err) { if (++erros <= 10) console.log(`\n  ⚠ ${e.ano}/${e.seq}: ${err.message}`); }
  if (++done % 25 === 0) process.stdout.write(`  ${done}/${atas.length} · ${comMarca} c/marca · ${erros} erros\r`);
}
async function marcaFeito(e, n) {
  await q(`INSERT INTO marca_ata_feitas (cnpj,ano,seq,n_marcas) VALUES ($1,$2,$3,$4)
    ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_marcas=EXCLUDED.n_marcas, feito_em=now()`, [e.cnpj, e.ano, e.seq, n]);
}
const s = (await q(`SELECT count(*) n, count(DISTINCT lower(marca)) m FROM item_marca_sc WHERE marca IS NOT NULL`)).rows[0];
console.log(`\n✔ AZ: ${totItens.toLocaleString("pt-BR")} itens gravados · ${comMarca} atas c/ marca · ${totLic.toLocaleString("pt-BR")} licitantes lidos`);
console.log(`  descartados por não casar o item: ${semCasar}  ·  erros: ${erros}`);
console.log(`  item_marca_sc: ${Number(s.n).toLocaleString("pt-BR")} itens com marca · ${s.m} marcas distintas`);
await db.end();
