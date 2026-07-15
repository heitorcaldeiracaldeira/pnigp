// CASAMENTO ITEM A ITEM — a base do banco de SUCESSO. Uma linha por item HOMOLOGADO, com tudo ligado.
// SEM mediana, SEM média, SEM grupo: agregação apaga justamente o que é copiável ("a prefeitura X comprou a marca Y
// por Z, com disputa real"). O banco de preços (precos_referencia_basica_sc) segue existindo e é UMA COLUNA disto,
// não o produto. Primeiro casar; agregação depois, se e quando fizer sentido.
//
// FONTES E O QUE CADA UMA DÁ (medido 2026-07-15):
//   itens_sc            situacao='Homologado' = §5.6 do manual, "item com resultado (fornecedor informado)".
//                       1.125.941 itens · 284 munis. Deserto/Fracassado NUNCA têm resultado — ficam de fora.
//   · DOIS PREÇOS, ambos da API, em 98,6% dos homologados:
//       unit_estimado   o que o município orçou      → junto com o arrematado, é o SINAL DE DISPUTA
//       unit_homologado o que ele pagou (arrematado)
//   · fornecedor/cnpj_fornecedor/porte — da API, 99% dos homologados.
//   item_catmat_map     eixo de classificação (o município NÃO preenche catmat: 726 de 1,1M = 0,06%). Casa por
//                       descrição normalizada; `aceito` = trigrama + reranker LLM. Cobre ~14,9% — é O GARGALO.
//   item_apresentacao_* unidade básica + fator. SEM isto o preço não compara ("caixa c/ 100" × "unidade").
//   item_marca_sc       MARCA = eixo da qualidade. Só existe no PDF da ata (a API não tem o campo, provado no JSON
//                       cru). Esparso de propósito: ~0,7%. LEFT JOIN — marca ausente NÃO descarta a compra.
//
// Nada é apagado de compra: só (re)constrói a derivada. node scripts/build_item_homologado_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// mesma normalização do build_precos_basica_sc — chave do item_catmat_map. Mudar aqui = quebrar o casamento lá.
const NORM = `lower(btrim(regexp_replace(regexp_replace(i.descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 3600000 });
db.on("error", () => {});
const q = (s, p) => db.query(s, p);
const N = (x) => Number(x || 0).toLocaleString("pt-BR");

console.log("casando itens homologados…");
await q(`DROP TABLE IF EXISTS item_homologado_sc`);
await q(`CREATE TABLE item_homologado_sc AS
  SELECT
    i.cod_ibge, i.cnpj, i.ano, i.seq, i.numero,           -- chave do PNCP (espelha a origem)
    c.municipio_nome, c.modalidade, c.srp, c.data_publicacao, c.plataforma,
    i.descricao, i.unidade, i.quantidade,
    i.unit_estimado, i.unit_homologado,                    -- OS DOIS PREÇOS, como vêm da API
    i.fornecedor, i.cnpj_fornecedor, i.porte_fornecedor,
    -- DISPUTA: distância entre o que orçou e o que pagou. NULL quando não há estimado (não fingir zero).
    CASE WHEN i.unit_estimado > 0 AND i.unit_homologado > 0
         THEN round(100.0*(i.unit_estimado - i.unit_homologado)/i.unit_estimado, 2) END AS desconto_pct,
    -- pagou >= o que orçou: ninguém puxou o preço. Sinal de processo sem disputa real.
    CASE WHEN i.unit_estimado > 0 AND i.unit_homologado > 0
         THEN (i.unit_homologado >= i.unit_estimado) END AS sem_disputa,
    icm.codigo_pdm, icm.nome_pdm, icm.nome_classe,         -- eixo CATMAT (NULL = sem eixo; não descarta a linha)
    res.unidade_basica, res.fator, res.forma,
    -- preço na UNIDADE BÁSICA — o único comparável entre municípios
    CASE WHEN res.fator > 0 THEN i.unit_homologado / res.fator END AS unit_basica,
    CASE WHEN res.fator > 0 AND i.unit_estimado > 0 THEN i.unit_estimado / res.fator END AS est_basica,
    k.marca, k.modelo,                                     -- qualidade (esparso: só do PDF)
    now() AS atualizado
  FROM itens_sc i
  JOIN contratacoes_sc c ON c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq
  LEFT JOIN item_catmat_map icm ON icm.chave = ${NORM} AND icm.aceito
  LEFT JOIN item_marca_sc k ON k.cnpj=i.cnpj AND k.ano=i.ano AND k.seq=i.seq AND k.numero=i.numero
  LEFT JOIN LATERAL (
    SELECT a1.unidade_basica, a1.fator,
           coalesce(a1.forma, CASE WHEN a1.unidade_basica='unidade' AND a1.fator>1 THEN 'escala' ELSE 'avulso' END) forma
    FROM item_apresentacao_sc a1
    WHERE a1.unidade = lower(btrim(i.unidade)) AND a1.metodo <> 'rotulo_container' AND a1.conf >= 0.8 AND a1.fator > 0
    UNION ALL
    SELECT a2.unidade_basica, a2.fator,
           CASE WHEN a2.unidade_basica='unidade' AND a2.fator>1 THEN 'escala' ELSE 'avulso' END forma
    FROM item_apresentacao_desc_sc a2
    WHERE a2.chave = ${NORM} AND a2.conf >= 0.7 AND a2.fator > 0
      AND EXISTS (SELECT 1 FROM item_apresentacao_sc a1 WHERE a1.unidade=lower(btrim(i.unidade)) AND a1.metodo='rotulo_container')
    LIMIT 1
  ) res ON true
  WHERE i.situacao='Homologado'`);

await q(`ALTER TABLE item_homologado_sc ADD PRIMARY KEY (cnpj, ano, seq, numero)`);
await q(`CREATE INDEX ix_ihs_pdm    ON item_homologado_sc (codigo_pdm) WHERE codigo_pdm IS NOT NULL`);
await q(`CREATE INDEX ix_ihs_marca  ON item_homologado_sc (lower(marca)) WHERE marca IS NOT NULL`);
await q(`CREATE INDEX ix_ihs_ibge   ON item_homologado_sc (cod_ibge)`);
await q(`CREATE INDEX ix_ihs_forn   ON item_homologado_sc (cnpj_fornecedor) WHERE cnpj_fornecedor IS NOT NULL`);

// ─── PRESTAÇÃO DE CONTAS DO CASAMENTO: o que casou e o que NÃO casou, junção por junção.
// Sem isto, "1,1 milhão de linhas" mente: LEFT JOIN sempre "funciona" — e o furo fica invisível.
const s = (await q(`SELECT count(*) t,
    count(*) FILTER (WHERE municipio_nome IS NOT NULL) c_muni,
    count(*) FILTER (WHERE fornecedor IS NOT NULL)     c_forn,
    count(*) FILTER (WHERE unit_homologado > 0)        c_arrem,
    count(*) FILTER (WHERE unit_estimado > 0)          c_est,
    count(*) FILTER (WHERE desconto_pct IS NOT NULL)   c_disputa,
    count(*) FILTER (WHERE sem_disputa)                c_semdisp,
    count(*) FILTER (WHERE codigo_pdm IS NOT NULL)     c_catmat,
    count(*) FILTER (WHERE unit_basica IS NOT NULL)    c_basica,
    count(*) FILTER (WHERE marca IS NOT NULL)          c_marca,
    count(DISTINCT cod_ibge) munis, count(DISTINCT lower(marca)) marcas
  FROM item_homologado_sc`)).rows[0];
const pct = (x) => `${(100 * x / s.t).toFixed(1)}%`;
console.log(`\n✔ item_homologado_sc · ${N(s.t)} itens homologados · ${s.munis} municípios\n`);
console.log(`   município         ${N(s.c_muni).padStart(11)}  ${pct(s.c_muni)}`);
console.log(`   fornecedor        ${N(s.c_forn).padStart(11)}  ${pct(s.c_forn)}`);
console.log(`   preço arrematado  ${N(s.c_arrem).padStart(11)}  ${pct(s.c_arrem)}`);
console.log(`   preço estimado    ${N(s.c_est).padStart(11)}  ${pct(s.c_est)}`);
console.log(`   DISPUTA (os 2)    ${N(s.c_disputa).padStart(11)}  ${pct(s.c_disputa)}   dos quais ${N(s.c_semdisp)} sem disputa`);
console.log(`   eixo CATMAT       ${N(s.c_catmat).padStart(11)}  ${pct(s.c_catmat)}   ← GARGALO`);
console.log(`   unidade básica    ${N(s.c_basica).padStart(11)}  ${pct(s.c_basica)}   ← sem isto o preço não compara`);
console.log(`   MARCA (só do PDF) ${N(s.c_marca).padStart(11)}  ${pct(s.c_marca)}   · ${N(s.marcas)} marcas distintas`);
await db.end();
