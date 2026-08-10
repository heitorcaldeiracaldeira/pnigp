// REFERÊNCIA POR UNIDADE BÁSICA (Passe 2 do mapa de preços) — reagrupa as compras pela CHAVE DE COMPARABILIDADE
// (CATMAT + unidade básica + forma), reduzindo cada preço à unidade básica via camadas de apresentação, e aplica a
// CURADORIA DE OUTLIERS por IQR (IN 65/2021 art. 6º: desconsidera inexequíveis/excessivamente elevados). Resolve a
// apresentação por item: rótulo de alta conf (Camada 1, item_apresentacao_sc) OU descrição p/ container (Camada 2,
// item_apresentacao_desc_sc). Exclui atas (registro de preço). Grava `precos_referencia_basica_sc`. Mediana + P25/P75
// sobre o conjunto CURADO, com o nº de pontos excluídos (o "critério fundamentado nos autos"). node scripts/build_precos_basica_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const NORM = `lower(btrim(regexp_replace(regexp_replace(i.descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

async function main() {
  // ═══ TEMP TABLE É POR SESSÃO, E UM POOL NÃO TEM UMA SESSÃO SÓ ═══
  // Este script cria três tabelas temporárias (_proc_ata, _pub, _fence) e as consulta adiante. Rodando
  // sobre um Pool, cada query pode cair numa CONEXÃO DIFERENTE: a temp nascia na conexão A e a consulta
  // seguinte ia para a B, onde ela não existe. Daí `relation "_proc_ata" does not exist` — que parece erro
  // de SQL e é, na verdade, erro de conexão. Mesma família da trava que não sobrevive ao pooler do Neon.
  // Uma sessão dedicada para o build inteiro resolve; o pool só serve para pegá-la.
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  pool.on("error", () => {});
  const db = await pool.connect();
  db.on("error", () => {});
  const q = (s, p) => db.query(s, p);

  // processos de ata (registro de preço) — mesma exclusão da referência crua
  console.log("classificando atas (registro de preço)…");
  await q(`DROP TABLE IF EXISTS _proc_ata`);
  await q(`CREATE TEMP TABLE _proc_ata AS
    SELECT DISTINCT split_part(numero_controle_compra,'-',1) cnpj,
      (split_part(split_part(numero_controle_compra,'-',3),'/',1))::int seq,
      (split_part(numero_controle_compra,'/',2))::int ano
    FROM atas_sc WHERE numero_controle_compra ~ '^[0-9]+-[0-9]+-[0-9]+/[0-9]{4}$'`);

  // 1) RESOLUÇÃO da apresentação por item (preço já reduzido à unidade básica) — só compras efetivadas, CATMAT aceito
  console.log("resolvendo apresentação por item (Camada 1 rótulo ⊕ Camada 2 descrição)…");
  await q(`DROP TABLE IF EXISTS _pub`);
  await q(`CREATE TEMP TABLE _pub AS
    SELECT icm.codigo_pdm, icm.nome_pdm, icm.nome_classe, i.cod_ibge,
      res.unidade_basica, res.forma, res.metodo,
      i.unit_homologado / res.fator AS pub
    FROM itens_sc i
    JOIN item_catmat_map icm ON icm.chave = ${NORM} AND icm.aceito
    JOIN LATERAL (
      -- Camada 1 (rótulo) de alta conf, EXCETO container; senão Camada 2 (descrição) p/ container
      SELECT a1.unidade_basica, a1.fator,
             coalesce(a1.forma, CASE WHEN a1.unidade_basica='unidade' AND a1.fator>1 THEN 'escala' ELSE 'avulso' END) forma,
             a1.metodo
      FROM item_apresentacao_sc a1 WHERE a1.unidade = lower(btrim(i.unidade)) AND a1.metodo <> 'rotulo_container' AND a1.conf >= 0.8 AND a1.fator > 0
      UNION ALL
      SELECT a2.unidade_basica, a2.fator,
             CASE WHEN a2.unidade_basica='unidade' AND a2.fator>1 THEN 'escala' ELSE 'avulso' END forma, a2.metodo
      FROM item_apresentacao_desc_sc a2 WHERE a2.chave = ${NORM} AND a2.conf >= 0.7 AND a2.fator > 0
        AND EXISTS (SELECT 1 FROM item_apresentacao_sc a1 WHERE a1.unidade=lower(btrim(i.unidade)) AND a1.metodo='rotulo_container')
      LIMIT 1
    ) res ON true
    WHERE i.unit_homologado BETWEEN 0.5 AND 100000 AND i.quantidade > 0 AND i.descricao IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM _proc_ata p WHERE p.cnpj=i.cnpj AND p.ano=i.ano AND p.seq=i.seq)`);
  const nPub = Number((await q(`SELECT count(*) n FROM _pub`)).rows[0].n);
  console.log(`  ${nPub.toLocaleString()} itens-linha com preço/unidade básica`);

  // 2) FENCES por grupo (IQR) — pré-curadoria
  await q(`DROP TABLE IF EXISTS _fence`);
  await q(`CREATE TEMP TABLE _fence AS
    SELECT codigo_pdm, unidade_basica, forma,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY pub) q1,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY pub) q3
    FROM _pub GROUP BY 1,2,3 HAVING count(*) >= 3`);

  // 3) referência CURADA (fora de [q1-1.5IQR, q3+1.5IQR] = inexequível/excessivo, excluído)
  console.log("aplicando curadoria IQR e agregando referência…");
  await q(`DROP TABLE IF EXISTS precos_referencia_basica_sc`);
  await q(`CREATE TABLE precos_referencia_basica_sc AS
    WITH marc AS (
      SELECT p.*, f.q1, f.q3, (f.q3 - f.q1) iqr,
        (p.pub < f.q1 - 1.5*(f.q3-f.q1) OR p.pub > f.q3 + 1.5*(f.q3-f.q1)) AS outlier
      FROM _pub p JOIN _fence f USING (codigo_pdm, unidade_basica, forma)
    )
    SELECT codigo_pdm, max(nome_pdm) nome_pdm, max(nome_classe) nome_classe, unidade_basica, forma,
      count(*) FILTER (WHERE NOT outlier) n_compras,
      count(distinct cod_ibge) FILTER (WHERE NOT outlier) n_munis,
      count(*) FILTER (WHERE outlier) n_excluidos,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY pub) FILTER (WHERE NOT outlier) mediana,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY pub) FILTER (WHERE NOT outlier) p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY pub) FILTER (WHERE NOT outlier) p75,
      now() atualizado
    FROM marc GROUP BY codigo_pdm, unidade_basica, forma
    HAVING count(*) FILTER (WHERE NOT outlier) >= 3`);
  await q(`ALTER TABLE precos_referencia_basica_sc ADD PRIMARY KEY (codigo_pdm, unidade_basica, forma)`);
  await q(`CREATE INDEX ix_prb_pdm ON precos_referencia_basica_sc (codigo_pdm)`);

  const s = (await q(`SELECT count(*) grupos, sum(n_compras) compras, sum(n_excluidos) excl,
    count(*) FILTER (WHERE forma='escala') escala FROM precos_referencia_basica_sc`)).rows[0];
  console.log(`\n✔ precos_referencia_basica_sc · ${Number(s.grupos).toLocaleString()} grupos (CATMAT×base×forma) · ${Number(s.compras).toLocaleString()} compras`);
  console.log(`  ${Number(s.excl).toLocaleString()} pontos excluídos pela curadoria IQR · ${Number(s.escala).toLocaleString()} grupos com forma escala`);
  db.release();
  await pool.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
