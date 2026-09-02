// CASAMENTO item→CATSER (trigrama pg_trgm) — o IRMÃO do match_item_catmat.mjs, para SERVIÇO.
//   node scripts/match_item_catser.mjs
//
// ═══ POR QUE UM MOTOR SEPARADO, E NÃO UM RAMO DENTRO DO CATMAT ═══
// O motor do CATMAT é validado e medido (~91% trigrama, 93,4% com reranker) e a lei do projeto é não
// contaminá-lo: misturar destrói a medição limpa e qualquer regressão futura vira indiagnosticável.
// Então aqui é tudo paralelo — tabela `item_catser_map`, catálogo `catser_catalogo`, métrica própria.
// O CATMAT não sabe que este arquivo existe.
//
// ═══ A FILA VEM DO CAMPO DA FONTE, NÃO DE REGEX DE PALAVRA ═══
// O motor do material decide o que é serviço com
//     descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento'
// Medido em 01/set/2026 contra o `material_ou_servico` que o PNCP publica de graça:
//     M (931.302):  863.409 passam ·  67.893 DESCARTADOS por terem "manutenção"/"projeto" no nome
//     S (280.326):  121.487 PASSAM  · 158.763 excluídos
// Ou seja a regex deixa 121 mil linhas de serviço entrarem num catálogo de materiais (erradas por
// construção) e joga fora 68 mil materiais legítimos. Aqui a fila é `material_ou_servico='S'` — o dado
// que a fonte declara. Consertar o lado do material é passe SEPARADO, com A/B contra o ponto de operação.
//
// ═══ GABARITO: existia esta lacuna, e ela FOI FECHADA em 01/set ═══
// (o parágrafo abaixo ficou como estava no dia em que o motor nasceu; ver a calibração de MIN_SIM logo
//  adiante e app.gabarito_item — hoje este motor TEM acurácia medida: 92,9% nos aceitos, falso aceite 0)
// O CATMAT foi calibrado contra `painel_gold` (31,7k pares descrição→PDM verdadeiro, colhidos do Painel de
// Preços federal) e depois contra 60 descrições de SC rotuladas à mão. **Para serviço não existe nenhum dos
// dois.** Logo este arquivo entrega COBERTURA e SIMILARIDADE medidas, e NÃO entrega acurácia — que
// permanece desconhecida até alguém rotular uma amostra. `MIN_SIM` está em 0,5 por herança do CATMAT, não
// por calibração: é um chute declarado, e mudá-lo exige gabarito.
import fs from "fs"; import pg from "pg";
import { NORM } from "./_precos_norm.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MIN_N = Number(process.env.MIN_N || 2);
// ═══ MIN_SIM CALIBRADO EM 01/set/2026 (era 0,5, herdado do CATMAT sem medição) ═══
// Curva medida contra `app.gabarito_item` (71 chaves com alvo · 36 rotuladas "nenhum"):
//     limiar  acerto(aceitos)  cobertura  falso aceite
//      0,35        87,5%         67,6%     11,1%   <- o falso aceite aparece aqui
//      0,40        92,9%         59,2%      0,0%   <- ESCOLHIDO
//      0,45        97,1%         49,3%      0,0%
//      0,50        97,1%         49,3%      0,0%   <- o antigo, idêntico ao 0,45: estrito à toa
// 0,45 e 0,50 dão números IGUAIS — nenhuma chave cai entre eles, então o corte antigo cobrava cobertura
// sem comprar precisão nenhuma. 0,40 ganha 10 pontos de cobertura mantendo o falso aceite em ZERO, que é o
// erro que importa: rótulo errado exibido é mentira, abstenção é só silêncio.
// ⚠️ Amostra pequena (36 "nenhum"). Não descer para 0,35 sem ampliar o gabarito — lá o falso aceite salta.
const MIN_SIM = Number(process.env.MIN_SIM || 0.4);
const LO = Number(process.env.LO_FALLBACK || 0.55);
// Fallback do substantivo-cabeça: no CATMAT ele foi MEDIDO (94,7%→96,1%) contra gabarito. Aqui não há
// gabarito, então ele entra DESLIGADO. Ligar por FALLBACK=1 apenas para medir a diferença — não em produção
// enquanto ninguém puder dizer se melhora ou piora.
const FALLBACK = process.env.FALLBACK === "1";
const BATCH = 4000;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS item_catser_map (
    chave TEXT PRIMARY KEY, codigo_servico INT, nome_servico TEXT, nome_classe TEXT, nome_secao TEXT,
    sim NUMERIC, n_itens INT, aceito BOOLEAN, metodo TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);

  // ═══ CANONIZAÇÃO DE NOME DUPLICADO ═══
  // Ganho (3) do CATMAT: o catálogo traz códigos distintos para o mesmo nome, e sem canonizar a maioria dos
  // "erros" é só duplicata. Materializa-se o alvo do casamento uma vez, já canonizado.
  // TABELAS REAIS, NAO TEMP: TEMP vive na SESSAO e some quando a conexao cai — o passe morre com
  // 'relation nao existe', que parece erro de SQL e e queda de conexao. Aconteceu no match do CATMAT
  // em 01/set aos 203 s. Job longo sobre Neon perde conexao; a pergunta nao e se, e quando.
  await c.query(`CREATE SCHEMA IF NOT EXISTS app`);
  await c.query(`DROP TABLE IF EXISTS app.alvo_catser`);
  await c.query(`CREATE TABLE app.alvo_catser AS
    SELECT DISTINCT ON (lower(nome_servico)) codigo_servico, nome_servico, nome_classe, nome_secao
    -- GUARDA DE FONTE: 2 linhas do CATSER trazem NATUREZA DE DESPESA no campo do nome
    -- (33903916, 33904803). O trigrama nunca as escolhe -- nome numerico nao tem sobreposicao
    -- lexica com palavra nenhuma -- mas o reranker-LLM escolhe: em 01/set elas causaram 4 de 4
    -- regressoes medidas contra o gabarito. Defeito invisivel para um motor e toxico para o outro.
    FROM catser_catalogo WHERE nome_servico IS NOT NULL AND nome_servico !~ '^[0-9]+$'
    ORDER BY lower(nome_servico), codigo_servico`);
  await c.query(`CREATE INDEX ON app.alvo_catser USING gin (lower(nome_servico) gin_trgm_ops)`);
  const alvos = Number((await c.query(`SELECT count(*) n FROM app.alvo_catser`)).rows[0].n);
  const brutos = Number((await c.query(`SELECT count(*) n FROM catser_catalogo`)).rows[0].n);
  console.log(`alvo: ${alvos} nomes de serviço canônicos (de ${brutos} códigos — ${brutos - alvos} nomes duplicados)`);

  // ═══ A FILA: descrições normalizadas de SERVIÇO ═══
  console.log(`materializando chaves de serviço (material_ou_servico='S', n>=${MIN_N}, length 4..90)…`);
  await c.query(`DROP TABLE IF EXISTS app.fila_catser`);
  await c.query(`CREATE TABLE app.fila_catser AS
    SELECT u.id, u.chave, u.n,
      NULLIF(array_to_string((string_to_array(trim(coalesce((regexp_match(lower(u.chave), '^([a-záàâãéêíóôõúüç ]+)'))[1], '')), ' '))[1:5], ' '), '') head
    FROM (
      SELECT row_number() OVER (ORDER BY n DESC) id, chave, n FROM (
        SELECT ${NORM} chave, count(*) n FROM itens_sc
        WHERE material_ou_servico = 'S' AND unit_homologado>0 AND quantidade>0 AND descricao IS NOT NULL
        GROUP BY 1 HAVING count(*) >= ${MIN_N} AND length(${NORM}) BETWEEN 4 AND 90) t
    ) u`);
  await c.query(`CREATE INDEX ON app.fila_catser (id)`);
  const total = Number((await c.query(`SELECT count(*) n FROM app.fila_catser`)).rows[0].n);
  const linhas = Number((await c.query(`SELECT coalesce(sum(n),0) n FROM app.fila_catser`)).rows[0].n);
  console.log(`  ${total.toLocaleString()} chaves · ${linhas.toLocaleString()} linhas de item cobertas`);

  // ---- passe único: casamento pela descrição inteira ----
  const t0 = Date.now();
  for (let off = 0; off < total; off += BATCH) {
    await c.query(`
      INSERT INTO item_catser_map (chave, codigo_servico, nome_servico, nome_classe, nome_secao, sim, n_itens, metodo)
      SELECT c.chave, m.codigo_servico, m.nome_servico, m.nome_classe, m.nome_secao,
        round(similarity(lower(m.nome_servico), c.chave)::numeric, 3), c.n, 'full'
      FROM app.fila_catser c CROSS JOIN LATERAL (
        SELECT codigo_servico, nome_servico, nome_classe, nome_secao
        FROM app.alvo_catser ORDER BY lower(nome_servico) <-> c.chave LIMIT 1
      ) m
      WHERE c.id > ${off} AND c.id <= ${off + BATCH}
      ON CONFLICT (chave) DO UPDATE SET codigo_servico=EXCLUDED.codigo_servico, nome_servico=EXCLUDED.nome_servico,
        nome_classe=EXCLUDED.nome_classe, nome_secao=EXCLUDED.nome_secao, sim=EXCLUDED.sim,
        n_itens=EXCLUDED.n_itens, metodo='full', atualizado=now()`);
    const done = Math.min(off + BATCH, total);
    if ((off / BATCH) % 5 === 0 || done === total) console.log(`  [inteira] ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }

  if (FALLBACK) {
    console.log(`FALLBACK=1 — substantivo-cabeça em chaves com sim<${LO} (NÃO validado para serviço)`);
    let resgatadas = 0;
    for (let off = 0; off < total; off += BATCH) {
      const r = await c.query(`
        UPDATE item_catser_map m
        SET codigo_servico=h.codigo_servico, nome_servico=h.nome_servico, nome_classe=h.nome_classe,
            nome_secao=h.nome_secao, sim=h.hsim, metodo='cabeca', atualizado=now()
        FROM app.fila_catser c CROSS JOIN LATERAL (
          SELECT codigo_servico, nome_servico, nome_classe, nome_secao,
                 round(similarity(lower(nome_servico), c.head)::numeric, 3) hsim
          FROM app.alvo_catser ORDER BY lower(nome_servico) <-> c.head LIMIT 1
        ) h
        WHERE m.chave=c.chave AND c.head IS NOT NULL AND length(c.head)>=4 AND c.head <> c.chave
          AND m.sim < ${LO} AND h.hsim > m.sim
          AND c.id > ${off} AND c.id <= ${off + BATCH}`);
      resgatadas += r.rowCount;
    }
    console.log(`  ${resgatadas.toLocaleString()} chaves trocadas pelo cabeça`);
  }

  // ---- abstenção explícita: abaixo de MIN_SIM é "não classificado", nunca chute ----
  await c.query(`UPDATE item_catser_map SET aceito = (sim >= ${MIN_SIM})`);

  // ═══ MEDIÇÃO — cobertura e similaridade. NÃO é acurácia (ver cabeçalho). ═══
  const r = (await c.query(`
    SELECT count(*)::int chaves, count(*) FILTER (WHERE aceito)::int aceitas,
           coalesce(sum(n_itens),0)::int linhas, coalesce(sum(n_itens) FILTER (WHERE aceito),0)::int linhas_aceitas,
           round(avg(sim),3) sim_medio, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sim)::numeric,3) sim_mediana
    FROM item_catser_map`)).rows[0];
  console.log(`\n✔ item_catser_map: ${r.chaves.toLocaleString()} chaves · ${r.aceitas.toLocaleString()} aceitas (sim>=${MIN_SIM})`);
  console.log(`  linhas de item: ${r.linhas.toLocaleString()} · cobertas ${r.linhas_aceitas.toLocaleString()} (${(100 * r.linhas_aceitas / Math.max(1, r.linhas)).toFixed(1)}%)`);
  console.log(`  similaridade: média ${r.sim_medio} · mediana ${r.sim_mediana}`);
  const faixas = (await c.query(`
    SELECT width_bucket(sim, 0, 1, 10) faixa, count(*)::int chaves, coalesce(sum(n_itens),0)::int linhas
    FROM item_catser_map GROUP BY 1 ORDER BY 1`)).rows;
  console.log("  distribuição de sim (décimos):");
  faixas.forEach((f) => console.log(`    ${((f.faixa - 1) / 10).toFixed(1)}–${(f.faixa / 10).toFixed(1)}  ${String(f.chaves).padStart(7)} chaves · ${String(f.linhas).padStart(8)} linhas`));
  console.log("\n⚠ ACURÁCIA NÃO MEDIDA — não existe gabarito de serviço. Os números acima são cobertura, não acerto.");
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
