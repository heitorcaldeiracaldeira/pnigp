// DICIONÁRIO DE BUSCA do Banco de Preços — uma linha por DESCRIÇÃO DISTINTA de item comprado.
// node scripts/build_item_busca.mjs
//
// ═══ POR QUE ESTA TABELA EXISTE (02/set/2026) ═══
// A busca do Banco de Preços vinha sendo feita pelo EIXO (`app.item_classificacao`), que junta as variantes
// de escrita sob o mesmo código de catálogo. Isso é bom para agrupar, e péssimo como PORTA DE ENTRADA:
// medido em 02/set, `item_classificacao` tem 87.007 chaves e o universo tem 781.361 descrições distintas.
// Buscar só pelo eixo deixava 89% das descrições INVISÍVEIS — inclusive todo item que aparece uma vez só,
// que é justamente o caso em que o comprador mais precisa de ajuda (não tem histórico próprio).
// Aqui a busca passa a varrer TODOS os processos licitatórios da base, classificados ou não.
//
// ⚠️ Também existe por DESEMPENHO. A junção descrição→itens é por EXPRESSÃO normalizada, e não havia índice
// que a suportasse: cada busca varria as 2,33 M linhas de `itens_sc` (medido: 144 s numa contagem simples).
// Uma tela não sobrevive a isso. Este script cria os dois índices que faltavam — o trigrama sobre o
// dicionário e o índice de expressão sobre `itens_sc` — e a busca vira lookup.
//
// A tabela é DERIVADA: pode ser recriada a qualquer momento a partir de itens_sc. Nada aqui é fonte.
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";

const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// NORM fala em `descricao` sem qualificar; na agregação a consulta tem duas tabelas, então qualifico.
const NORM_I = NORM.replace("descricao", "i.descricao");
// SEM ACENTO para a busca: quem digita "acucar" tem de achar "AÇÚCAR". `unaccent()` não serve em índice
// (não é IMMUTABLE, porque depende de dicionário instalável); `translate()` é, e resolve o caso brasileiro.
const SEM_ACENTO = (col) => `translate(${col},'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000, query_timeout: 1800000, connectionTimeoutMillis: 20000 });
  db.on("error", () => {});
  const c = await db.connect();
  const t0 = Date.now();
  const seg = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

  await c.query(`CREATE SCHEMA IF NOT EXISTS app`);

  // ─── 1. índice de expressão sobre itens_sc: é ele que torna "desta descrição, quais contratações?" barato
  console.log("[1/4] índice de expressão em itens_sc (pode demorar; 2,33 M linhas)…");
  await c.query(`CREATE INDEX IF NOT EXISTS ix_itens_chave_norm ON itens_sc (${NORM})`);
  console.log(`      ok (${seg()})`);

  // ─── 2. dicionário
  console.log("[2/4] agregando descrições distintas…");
  await c.query(`DROP TABLE IF EXISTS app.item_busca_novo`);
  await c.query(`CREATE TABLE app.item_busca_novo AS
    SELECT k.chave,
           ${SEM_ACENTO("k.chave")} AS chave_busca,
           k.unidade, k.n_itens, k.n_processos, k.n_municipios,
           k.mediana, k.p25, k.p75, k.menor, k.maior, k.primeira, k.ultima,
           c.taxonomia, c.codigo, c.nome AS nome_catalogo, c.classe AS classe_catalogo,
           now() AS atualizado
      FROM (
        SELECT ${NORM_I} AS chave,
               mode() WITHIN GROUP (ORDER BY lower(btrim(i.unidade))) AS unidade,
               count(*)::int AS n_itens,
               count(DISTINCT i.cnpj || i.ano::text || i.seq::text)::int AS n_processos,
               count(DISTINCT i.cod_ibge)::int AS n_municipios,
               percentile_cont(0.5)  WITHIN GROUP (ORDER BY i.unit_homologado) AS mediana,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY i.unit_homologado) AS p25,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY i.unit_homologado) AS p75,
               min(i.unit_homologado) AS menor, max(i.unit_homologado) AS maior,
               min(ct.data_publicacao)::date AS primeira, max(ct.data_publicacao)::date AS ultima
          FROM itens_sc i
          LEFT JOIN contratacoes_sc ct ON ct.cnpj = i.cnpj AND ct.ano = i.ano AND ct.seq = i.seq
         WHERE i.unit_homologado > 0 AND i.quantidade > 0 AND btrim(coalesce(i.descricao,'')) <> ''
         GROUP BY 1
      ) k
      LEFT JOIN app.item_classificacao c ON c.chave = k.chave`);
  const n = +(await c.query(`SELECT count(*) n FROM app.item_busca_novo`)).rows[0].n;
  console.log(`      ${n.toLocaleString("pt-BR")} descrições distintas (${seg()})`);

  // ═══ GUARDA DE TAMANHO ═══
  // Trocar a tabela viva por uma versão truncada seria pior que não rodar: a tela continuaria de pé,
  // buscando num dicionário mutilado, e ninguém veria diferença até faltar o item que importava.
  const anterior = +(await c.query(`SELECT count(*) n FROM app.item_busca`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  if (n < 100000 || (anterior > 0 && n < anterior * 0.8)) {
    console.error(`🚨 dicionário novo tem ${n} linhas contra ${anterior} da tabela atual — ABORTADO, tabela viva preservada.`);
    await c.query(`DROP TABLE IF EXISTS app.item_busca_novo`);
    c.release(); await db.end(); process.exit(1);
  }

  // ─── 3. índices sobre o dicionário
  console.log("[3/4] índices do dicionário…");
  await c.query(`ALTER TABLE app.item_busca_novo ADD PRIMARY KEY (chave)`);
  await c.query(`CREATE INDEX ON app.item_busca_novo USING gin (chave_busca gin_trgm_ops)`);
  await c.query(`CREATE INDEX ON app.item_busca_novo (taxonomia, codigo)`);
  await c.query(`CREATE INDEX ON app.item_busca_novo (n_itens DESC)`);
  console.log(`      ok (${seg()})`);

  // ─── 4. troca atômica
  console.log("[4/4] publicando…");
  await c.query(`BEGIN`);
  await c.query(`DROP TABLE IF EXISTS app.item_busca_velho`);
  await c.query(`ALTER TABLE IF EXISTS app.item_busca RENAME TO item_busca_velho`);
  await c.query(`ALTER TABLE app.item_busca_novo RENAME TO item_busca`);
  await c.query(`COMMIT`);
  await c.query(`DROP TABLE IF EXISTS app.item_busca_velho`);
  await c.query(`ANALYZE app.item_busca`);

  const r = (await c.query(`SELECT count(*) n, count(*) FILTER (WHERE taxonomia IS NOT NULL) com_eixo,
                                   sum(n_itens)::bigint itens, sum(n_processos)::bigint proc FROM app.item_busca`)).rows[0];
  const pct = (100 * r.com_eixo / Math.max(1, r.n)).toFixed(1);
  console.log(`✔ app.item_busca: ${(+r.n).toLocaleString("pt-BR")} descrições · ${(+r.itens).toLocaleString("pt-BR")} itens · ${(+r.com_eixo).toLocaleString("pt-BR")} com eixo de catálogo (${pct}%)`);
  console.log(`  As outras ${(100 - +pct).toFixed(1)}% só são alcançáveis por texto — é o que esta tabela acrescenta à busca.`);
  c.release(); await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
