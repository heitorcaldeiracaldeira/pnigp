// RED-FLAG — provável UNIDADE TROCADA no lançamento. Efeito colateral valioso do Passe 2: ao reduzir à unidade básica,
// um item cujo preço/unidade básica destoa MUITO (≥20×) da mediana do seu grupo (CATMAT + base) é quase sempre erro de
// rótulo na fonte (ex.: fruta lançada como "grama" custando R$12.940/kg = digitaram kg mas marcaram grama; ratio ~1000).
// Detecta e classifica a provável causa pela proximidade do ratio a fatores de conversão (1000 kg↔g/l↔ml, 100, 12 dúzia).
// FRAMING NEUTRO: "verifique a unidade deste lançamento", NÃO é sobrepreço nem acusação. Grava `mislabel_unidade_sc`.
// node scripts/build_mislabel_unidade_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const NORM = `lower(btrim(regexp_replace(regexp_replace(i.descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;
const K = Number(process.env.K || 10);        // pré-filtro de desvio (×); o filtro fino por banda de conversão vem depois
const MIN_N = Number(process.env.MIN_N || 8);  // grupo precisa de N pontos p/ a mediana ser confiável

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {});
  const q = (s, p) => db.query(s, p);

  // per-item preço/unidade básica (mesma resolução do build_precos_basica: Camada 1 alta-conf ⊕ Camada 2/LLM container)
  await q(`DROP TABLE IF EXISTS _pubm`);
  await q(`CREATE TEMP TABLE _pubm AS
    SELECT icm.codigo_pdm, icm.nome_pdm, i.cod_ibge, i.descricao, i.unidade, i.unit_homologado,
      res.unidade_basica, i.unit_homologado / res.fator AS pub
    FROM itens_sc i
    JOIN item_catmat_map icm ON icm.chave = ${NORM} AND icm.aceito
    JOIN LATERAL (
      SELECT a1.unidade_basica, a1.fator FROM item_apresentacao_sc a1
        WHERE a1.unidade = lower(btrim(i.unidade)) AND a1.metodo <> 'rotulo_container' AND a1.conf >= 0.8 AND a1.fator > 0
      UNION ALL
      SELECT a2.unidade_basica, a2.fator FROM item_apresentacao_desc_sc a2
        WHERE a2.chave = ${NORM} AND a2.conf >= 0.7 AND a2.fator > 0
        AND EXISTS (SELECT 1 FROM item_apresentacao_sc a1 WHERE a1.unidade=lower(btrim(i.unidade)) AND a1.metodo='rotulo_container')
      LIMIT 1
    ) res ON true
    WHERE i.unit_homologado BETWEEN 0.5 AND 100000 AND i.quantidade > 0 AND i.descricao IS NOT NULL`);

  await q(`DROP TABLE IF EXISTS _grpm`);
  await q(`CREATE TEMP TABLE _grpm AS
    SELECT codigo_pdm, unidade_basica, percentile_cont(0.5) WITHIN GROUP (ORDER BY pub) med, count(*) n
    FROM _pubm GROUP BY 1,2 HAVING count(*) >= ${MIN_N}`);

  // ALTA PRECISÃO: só flaga (a) ratio PERTO de um fator de conversão (12/100/1000 ±15% = assinatura de unidade trocada)
  // OU (b) gritante ≥100× (erro grosseiro: total lançado como unitário). O meio ambíguo (20-100× fora de fator) é
  // variação legítima em PDM largo (conexão, mangueira) → NÃO flaga, p/ não gerar falso-positivo.
  await q(`DROP TABLE IF EXISTS mislabel_unidade_sc`);
  await q(`CREATE TABLE mislabel_unidade_sc AS
    WITH r AS (
      SELECT p.cod_ibge, p.nome_pdm, p.descricao, p.unidade, p.unit_homologado, p.unidade_basica,
        p.pub, g.med, g.n grupo_n, (p.pub > g.med) alto,
        CASE WHEN p.pub > g.med THEN p.pub/g.med ELSE g.med/NULLIF(p.pub,0) END ratio
      FROM _pubm p JOIN _grpm g USING (codigo_pdm, unidade_basica)
      WHERE p.pub > g.med * ${K} OR p.pub < g.med / ${K}
    )
    SELECT cod_ibge, nome_pdm, descricao, unidade, unit_homologado, unidade_basica, pub, med, grupo_n, alto,
      round(ratio::numeric,1) ratio,
      CASE
        WHEN ratio BETWEEN 850 AND 1150 THEN 'provável unidade trocada — kg↔g ou L↔ml (fator ~1000)'
        ELSE 'preço destoa fortemente (≥100× a mediana) — verificar o lançamento (unidade ou total lançado como unitário)'
      END AS causa_provavel,
      now() atualizado
    FROM r
    WHERE ratio >= 100`);
  await q(`CREATE INDEX ix_mislabel_cod ON mislabel_unidade_sc (cod_ibge)`);

  const s = (await q(`SELECT count(*) n, count(distinct cod_ibge) munis, count(*) FILTER (WHERE alto) altos FROM mislabel_unidade_sc`)).rows[0];
  console.log(`✔ mislabel_unidade_sc · ${Number(s.n).toLocaleString()} lançamentos suspeitos em ${Number(s.munis).toLocaleString()} municípios (${Number(s.altos).toLocaleString()} preço alto demais, resto baixo demais)`);
  const top = (await q(`SELECT causa_provavel, count(*) n FROM mislabel_unidade_sc GROUP BY 1 ORDER BY 2 DESC`)).rows;
  for (const r of top) console.log("  " + String(r.causa_provavel).padEnd(46) + Number(r.n).toLocaleString());
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
