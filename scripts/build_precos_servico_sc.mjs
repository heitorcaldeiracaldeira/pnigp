// BANCO DE PREÇOS DE SERVIÇO — o irmão de `build_precos_basica_sc.mjs`, no eixo que ele não cobre.
//   node scripts/build_precos_servico_sc.mjs
//
// ═══ POR QUE UMA TABELA SEPARADA, E NÃO UMA COLUNA A MAIS NA DE MATERIAL ═══
// `precos_referencia_basica_sc` é chaveada em `(codigo_pdm, unidade_basica, forma)`, está validada e é lida
// pelo produto (`src/lib/queries.ts`). Generalizar o eixo dela mexeria num artefato consumido, e as duas
// perguntas nem são a mesma: material se compara por unidade DESEMBALADA, serviço por unidade CANÔNICA.
// Aqui é tudo paralelo, com as MESMAS regras estatísticas, para que os dois números sejam defensáveis pelo
// mesmo critério. Ver [[pnigp-item-classificacao-camada-unica]].
//
// ═══ O QUE É IGUAL AO BANCO DE MATERIAL (de propósito) ═══
//   • CURADORIA DE OUTLIERS POR IQR — IN 65/2021 art. 6º: desconsidera inexequível e excessivamente
//     elevado, e GRAVA quantos pontos saíram (`n_excluidos`), que é o "critério fundamentado nos autos".
//   • MÍNIMO DE 3 COMPRAS por grupo. Mediana de 2 pontos não é referência, é opinião.
//   • ATAS EXCLUÍDAS (registro de preço): preço de ata não é preço praticado.
//   • Mediana + P25/P75 sobre o conjunto CURADO, e `n_munis` para separar "3 compras de um município" de
//     "3 municípios independentes".
//
// ═══ O QUE É DIFERENTE, E POR QUÊ ═══
//   • NÃO HÁ `unidade_basica` NEM `forma`. A camada de apresentação existe para DESEMBALAR ("caixa com 12"
//     → 12 unidades); serviço não se desembala — 1 hora é 1 hora. Medido em 01/set: ela cobre 85% dos itens
//     de material e 58,5% dos de serviço, e nesses 58,5% quase tudo é `unidade` com fator 1, ou seja passa
//     direto. Fingir a coluna daria a impressão de normalizar preço sem normalizar nada.
//   • A unidade vem do `CANON_SERVICO` (em `_precos_norm.mjs`, ao lado do CANON dos bens): `mês`/`mes` e
//     `serviço`/`servico`/`sv`/`por serviço` são a MESMA unidade, e parti-las corta a amostra pela metade
//     contra a regra do mínimo 3. Medido: +616 linhas cobertas e média de 18,1 compras por grupo.
//   • ⭐ O SIGTAP TRAZ REFERÊNCIA FEDERAL. 2.076 procedimentos publicam `vl_sa` (ambulatorial). Isso permite
//     o que o banco de material não tem: **o que o município pagou × o que o SUS paga**. Guardamos os três
//     valores como publicados e a razão só contra `vl_sa`, porque compra municipal de exame e consulta é
//     ambulatorial — somar sa+sh+sp seria inventar uma regra que a fonte não declara.
// ═══ 🚨 COMO **NÃO** LER `razao_municipio_sus` ═══
// Medido em 01/set: 509 grupos entre 1x e 2x, 132 entre 2x e 5x, 62 entre 5x e 20x e **25 acima de 20x**,
// com o topo em 293x (CAUTERIZAÇÃO QUÍMICA: R$ 435,00 pagos contra R$ 1,48 na tabela). Razão mediana 1,15.
//
// **Pagar acima da tabela do SUS NÃO é irregularidade, é o esperado.** O SIGTAP é tabela de REPASSE
// federal, historicamente muito abaixo do custo: o município contrata a preço de mercado e o SUS reembolsa
// uma fração. O valor de `vl_sa` cobre o ato sob um modelo de financiamento específico; o contrato
// municipal inclui profissional, material e estrutura. Uma tela que ordenasse por esta razão e chamasse o
// topo de "sobrepreço" estaria inventando um achado — é exatamente o critério frouxo errando para cima
// ([[pnigp-criterio-frouxo-erra-sempre-para-cima]]).
//
// ⚠️ E o agravante estatístico: **todo grupo SIGTAP tem 1 ou 2 municípios** (medido: zero grupos com 3+).
// Mediana de um município só não é referência — é o preço daquele município. Por isso `n_munis` é gravado
// e tem de ser lido junto: sem ele, o número parece uma comparação e é um caso isolado.
//
// ➡️ O uso legítimo é **TRIAGEM**: a razão diz "olhe aqui", nunca "isto está errado". O que transforma
// triagem em achado é o passo seguinte — comparar com OUTROS municípios pelo mesmo procedimento, que é
// justamente o que `n_munis <= 2` ainda não permite fazer.
import fs from "fs"; import pg from "pg";
import { NORM, CANON_SERVICO } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MIN_COMPRAS = Number(process.env.MIN_COMPRAS || 3);

// TEMP TABLE é por SESSÃO, e um Pool não tem uma sessão só — mesma armadilha documentada no build de
// material: a temp nasce na conexão A e a consulta seguinte cai na B. Uma sessão dedicada para o build.
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
pool.on("error", () => {});
const db = await pool.connect();
const q = (s, p) => db.query(s, p);
const CANON_U = CANON_SERVICO.replace(/\bu\b/g, "lower(btrim(i.unidade))");
const NORM_I = NORM.replace(/descricao/g, "i.descricao");

// atas (registro de preço) — mesma exclusão do banco de material
await q(`DROP TABLE IF EXISTS _ata_s`);
await q(`CREATE TEMP TABLE _ata_s AS
  SELECT DISTINCT split_part(numero_controle_compra,'-',1) cnpj,
    (split_part(split_part(numero_controle_compra,'-',3),'/',1))::int seq,
    (split_part(numero_controle_compra,'/',2))::int ano
  FROM atas_sc WHERE numero_controle_compra ~ '^[0-9]+-[0-9]+-[0-9]+/[0-9]{4}$'`);

console.log("resolvendo preço por (taxonomia, código, unidade canônica)…");
await q(`DROP TABLE IF EXISTS _ps`);
await q(`CREATE TEMP TABLE _ps AS
  SELECT c.taxonomia, c.codigo, c.nome, c.classe, ${CANON_U} AS unidade,
         i.cod_ibge, i.unit_homologado AS pu
  FROM itens_sc i
  JOIN app.item_classificacao c ON c.chave = ${NORM_I}
  WHERE c.taxonomia IN ('CATSER','SIGTAP')
    AND i.material_ou_servico = 'S'
    AND i.unit_homologado BETWEEN 0.5 AND 1000000 AND i.quantidade > 0 AND i.descricao IS NOT NULL
    -- ITEM SEM MUNICIPIO NAO ENTRA (01/set/2026). cod_ibge nulo em 3% dos itens de servico (8.472 linhas):
    -- eles contavam em n_compras e NAO em n_munis, e 5 grupos saiam com n_munis=0 — "preco de referencia"
    -- apurado a partir de municipio nenhum. O banco de material nao tem um caso desses.
    -- Filtrar na ORIGEM e nao no resultado: assim a mediana tambem deixa de incluir preco que nao se pode
    -- atribuir a ninguem, em vez de so esconder o grupo degenerado no fim.
    AND i.cod_ibge IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM _ata_s a WHERE a.cnpj=i.cnpj AND a.ano=i.ano AND a.seq=i.seq)`);
const nPs = Number((await q(`SELECT count(*) n FROM _ps`)).rows[0].n);
console.log(`  ${nPs.toLocaleString()} itens-linha de serviço com eixo e preço`);

// cerca do IQR por grupo — igual ao banco de material
await q(`DROP TABLE IF EXISTS _fence_s`);
await q(`CREATE TEMP TABLE _fence_s AS
  SELECT taxonomia, codigo, unidade,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY pu) q1,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY pu) q3
  FROM _ps GROUP BY 1,2,3`);

await q(`DROP TABLE IF EXISTS precos_referencia_servico_sc`);
await q(`CREATE TABLE precos_referencia_servico_sc AS
  WITH marc AS (
    SELECT p.*, (p.pu < f.q1 - 1.5*(f.q3-f.q1) OR p.pu > f.q3 + 1.5*(f.q3-f.q1)) AS outlier
    FROM _ps p JOIN _fence_s f USING (taxonomia, codigo, unidade)
  )
  SELECT taxonomia, codigo, max(nome) nome, max(classe) classe, unidade,
    count(*) FILTER (WHERE NOT outlier) n_compras,
    count(DISTINCT cod_ibge) FILTER (WHERE NOT outlier) n_munis,
    count(*) FILTER (WHERE outlier) n_excluidos,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY pu) FILTER (WHERE NOT outlier) mediana,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY pu) FILTER (WHERE NOT outlier) p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY pu) FILTER (WHERE NOT outlier) p75,
    now() atualizado
  FROM marc GROUP BY taxonomia, codigo, unidade
  HAVING count(*) FILTER (WHERE NOT outlier) >= ${MIN_COMPRAS}`);
await q(`ALTER TABLE precos_referencia_servico_sc ADD PRIMARY KEY (taxonomia, codigo, unidade)`);

// ⭐ referência federal do SUS — os três valores como a fonte publica (centavos -> reais), e a razão SÓ
// contra vl_sa (ambulatorial). vl_sa = 0 significa "não publicado", não "de graça": vira NULL, senão a
// razão explodiria e o número diria uma coisa que a fonte não disse.
await q(`ALTER TABLE precos_referencia_servico_sc
  ADD COLUMN vl_sus_ambulatorial NUMERIC, ADD COLUMN vl_sus_hospitalar NUMERIC,
  ADD COLUMN vl_sus_profissional NUMERIC, ADD COLUMN razao_municipio_sus NUMERIC`);
await q(`UPDATE precos_referencia_servico_sc r SET
    vl_sus_ambulatorial = NULLIF(s.vl_sa::numeric,0)/100,
    vl_sus_hospitalar   = NULLIF(s.vl_sh::numeric,0)/100,
    vl_sus_profissional = NULLIF(s.vl_sp::numeric,0)/100,
    -- mediana vem de percentile_cont, que devolve DOUBLE PRECISION, e round(x,2) so existe para NUMERIC.
    razao_municipio_sus = CASE WHEN NULLIF(s.vl_sa::numeric,0) IS NOT NULL
                          THEN round((r.mediana / (s.vl_sa::numeric/100))::numeric, 2) END
  FROM sigtap_procedimento s
  WHERE r.taxonomia = 'SIGTAP' AND s.co_procedimento = r.codigo`);

// ⚠️ CONCENTRACAO MUNICIPAL — o numero que impede este banco de ser lido como o de material.
// Medido em 01/set: 59,3% dos grupos de SERVICO vem de UM municipio ou nenhum, contra 18,5% no banco de
// material. Mediana de um municipio so nao e referencia: e o preco daquele municipio. Por isso `n_munis`
// e impresso no resumo de toda rodada — quem le o total sem ler a concentracao le errado.
const s = (await q(`SELECT taxonomia, count(*)::int grupos, sum(n_compras)::int compras,
  sum(n_excluidos)::int excluidos,
  count(*) FILTER (WHERE n_munis >= 3)::int com_3_municipios,
  count(*) FILTER (WHERE n_munis <= 1)::int de_um_municipio_so,
  round(100.0*count(*) FILTER (WHERE n_munis <= 1)/count(*),1)::text pct_concentrado
  FROM precos_referencia_servico_sc GROUP BY 1 ORDER BY 2 DESC`)).rows;
console.log("\n✔ precos_referencia_servico_sc");
console.table(s);
const sus = (await q(`SELECT count(*)::int com_referencia_sus,
  count(*) FILTER (WHERE razao_municipio_sus > 1)::int acima_do_sus,
  count(*) FILTER (WHERE razao_municipio_sus <= 1)::int ate_o_sus,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY razao_municipio_sus)::numeric,2)::text razao_mediana
  FROM precos_referencia_servico_sc WHERE razao_municipio_sus IS NOT NULL`)).rows;
console.log("\n⭐ município × SUS (só SIGTAP com vl_sa publicado):");
console.table(sus);
db.release(); await pool.end();
