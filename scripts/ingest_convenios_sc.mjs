// ETL — Convênios captados pelos municípios (Portal da Transparência, dado do Transferegov).
// "Quanto cada prefeitura captou" → base p/ benchmark vs pares (o ponto cego da captação). API com chave + rate limit.
// node scripts/ingest_convenios_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)[1].trim();
const API = "https://api.portaldatransparencia.gov.br/api-de-dados/convenios";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const ehMunicipal = (t) => /Municipal/i.test(String(t || "")); // prefeitura/autarquia municipal

async function fetchPag(cod, pag) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(`${API}?codigoIBGE=${cod}&pagina=${pag}`, { headers: { "chave-api-dados": KEY, "Accept": "application/json" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) throw 0;
      return await r.json();
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS convenios_captados_sc (cod_ibge TEXT, id BIGINT, numero TEXT, objeto TEXT, orgao TEXT, situacao TEXT, valor NUMERIC, valor_liberado NUMERIC, dt_inicio DATE, dt_fim DATE, ano INTEGER, convenente TEXT, PRIMARY KEY (cod_ibge, id))`);
  // a chave de verdade é a natural: o `id` da API muda a cada coleta (ver comentário no INSERT).
  // Coluna GERADA pelo banco + índice único = a repetição fica IMPEDIDA, não apenas desaconselhada.
  await db.query(`ALTER TABLE convenios_captados_sc ADD COLUMN IF NOT EXISTS chave TEXT
    GENERATED ALWAYS AS (cod_ibge || '|' || coalesce(numero,'') || '|' || coalesce(convenente,'') || '|' || coalesce(left(objeto,200),'')) STORED`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conv_chave ON convenios_captados_sc (chave)`);
  await db.query(`CREATE TABLE IF NOT EXISTS convenios_check (cod_ibge TEXT PRIMARY KEY)`);
  // ═══ O CHECKPOINT NÃO VENCIA: "já fiz" virou "nunca mais" ═══
  // `convenios_check` existe para dar RETOMADA — a API do Portal da Transparência tem limite de 90 req/min
  // e uma varredura dos 295 municípios leva tempo, então marcar quem já foi evita recomeçar do zero.
  // Só que a marca era eterna: com os 295 na tabela, toda execução pulava todo mundo e imprimia
  // "0 nesta rodada", indefinidamente. Convênio novo assinado depois da primeira carga nunca entraria.
  // Retomada e recusa de trabalho são coisas diferentes: a marca precisa de VALIDADE.
  // sem DEFAULT: linha antiga fica com NULL = "não sei quando foi visto", que conta como VENCIDA.
  // (com DEFAULT now(), o próprio ALTER carimbaria todo mundo como visto hoje — a marca eterna de novo,
  //  só que disfarçada de recente.)
  await db.query(`ALTER TABLE convenios_check ADD COLUMN IF NOT EXISTS atualizado TIMESTAMPTZ`);
  const DIAS = Number(process.env.RECHECA_DIAS || 30);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  // ═══ DUAS INSTÂNCIAS NA MESMA API DE 90 req/min DERRUBAM AS DUAS ═══
  // Aconteceu DUAS VEZES em 10/ago: às 05:03 e às 09:09 o orquestrador disparou esta fonte enquanto uma
  // varredura manual já estava em curso, e o catálogo registrou "falhou 5/5" nas duas. Não era bug de
  // coleta — era competição pelo limite de requisições do Portal da Transparência, com as duas instâncias
  // levando 429 e desistindo. Falha fantasma: some quando se roda sozinho, e volta no próximo encontro.
  // A trava do projeto já existia e esta fonte não a usava. Sair sem trabalho NÃO é erro: código 0, para
  // não poluir o catálogo com uma falha que é, na verdade, "o outro está fazendo".
  const { pegaTrava } = await import("./trava_processo.mjs");
  const trava = await pegaTrava(db, "convenios");
  if (!trava.ok) { console.log(`já rodando em ${trava.donoAtual} — saindo sem trabalho`); await db.end(); return; }
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM convenios_check
    WHERE atualizado IS NOT NULL AND atualizado > now() - ($1 || ' days')::interval`, [DIAS])).rows.map((r) => r.cod_ibge));
  console.log(`${entes.length} municípios · ${feitos.size} verificados nos últimos ${DIAS} dias · ${entes.length - feitos.size} a rever`);
  let proc = 0, grav = 0;
  for (const e of entes) {
    if (feitos.has(e.cod_ibge)) continue;
    try {
    let pag = 1, total = 0;
    while (pag <= 50) {
      const arr = await fetchPag(e.cod_ibge, pag);
      await sleep(750); // ~80 req/min (limite 90/min)
      if (!arr || !arr.length) break;
      for (const c of arr) {
        if (!ehMunicipal(c.convenente?.tipo)) continue; // só prefeitura/adm municipal
        const dt = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
        const ini = dt(c.dataInicioVigencia);
        // ═══ O `id` DA API NÃO É ESTÁVEL — A CHAVE ESTAVA NO CAMPO ERRADO ═══
        // Medido em 10/ago: o MESMO convênio volta com id NOVO a cada coleta. `CR.NR.0143654-14` do
        // município 4202206 estava na base com QUATRO ids (345382165, 353878307, 359561507, 365141682).
        // Com `ON CONFLICT (cod_ibge,id)`, cada rodada inseria tudo de novo: a tabela tinha 43.238 linhas
        // para 22.121 convênios reais. O checkpoint eterno escondia isso por nunca deixar rodar duas vezes
        // — consertar o checkpoint foi o que revelou o defeito de baixo.
        // A chave agora é NATURAL (município + número + convenente + objeto), numa coluna GERADA pelo
        // banco, com índice único. E as cópias NÃO eram iguais: em 2.219 grupos o valor tinha mudado e em
        // 315 a situação — são fotografias de momentos distintos, então o UPDATE precisa trazer os campos
        // que se movem, e o `id` mais recente junto.
        await q(`INSERT INTO convenios_captados_sc (cod_ibge,id,numero,objeto,orgao,situacao,valor,valor_liberado,dt_inicio,dt_fim,ano,convenente)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 -- ═══ A FONTE SERVE O VALOR DIVIDIDO POR 10.000, DE FORMA INTERMITENTE ═══
                 -- Medido em 10/ago sobre os pares duplicados que a base tinha: 2.185 de 2.223 divergências
                 -- de valor (98,3%) têm razão EXATAMENTE 10.000. Não é ruído de coleta — é a mesma API
                 -- devolvendo ora R$ 110.000, ora R$ 11, para o mesmo convênio.
                 -- Qual lado é o certo: o lado baixo tem média R$ 34,49 e 2.107 dos 2.185 abaixo de R$ 100
                 -- (absurdo para convênio federal); o lado alto tem média R$ 344.947, que bate com a média
                 -- de toda a base (R$ 343.417). O alto é o real; 730 linhas foram corrigidas.
                 -- Sem esta guarda, cada coleta que pegasse a fonte no momento ruim rebaixaria o valor de
                 -- novo — e o total de captação do município encolheria sem ninguém ver.
                 ON CONFLICT (chave) DO UPDATE SET id=EXCLUDED.id,
                   valor = CASE WHEN convenios_captados_sc.valor > 0 AND EXCLUDED.valor > 0
                                 AND round((convenios_captados_sc.valor / EXCLUDED.valor)::numeric, 0) = 10000
                                THEN convenios_captados_sc.valor ELSE EXCLUDED.valor END,
                   valor_liberado = CASE WHEN convenios_captados_sc.valor_liberado > 0 AND EXCLUDED.valor_liberado > 0
                                 AND round((convenios_captados_sc.valor_liberado / EXCLUDED.valor_liberado)::numeric, 0) = 10000
                                THEN convenios_captados_sc.valor_liberado ELSE EXCLUDED.valor_liberado END,
                   situacao=EXCLUDED.situacao, dt_fim=EXCLUDED.dt_fim, orgao=EXCLUDED.orgao`,
          [e.cod_ibge, c.id, c.dimConvenio?.numero || null, c.dimConvenio?.objeto || null, c.orgao?.nome || c.orgao?.sigla || null, c.situacao || null, num(c.valor), num(c.valorLiberado), ini, dt(c.dataFinalVigencia), ini ? +ini.slice(0, 4) : null, c.convenente?.nome || null]);
        total++; grav++;
      }
      if (arr.length < 15) break; // última página
      pag++;
    }
    // DO NOTHING deixaria o carimbo velho e o município voltaria à fila em toda execução: tem de RENOVAR
    await q(`INSERT INTO convenios_check (cod_ibge, atualizado) VALUES ($1, now())
             ON CONFLICT (cod_ibge) DO UPDATE SET atualizado = now()`, [e.cod_ibge]);
    proc++;
    if (proc % 30 === 0) console.log(`  ${proc}/${entes.length} municípios · ${grav} convênios municipais`);
    } catch (err) { console.log(`  ! ${e.cod_ibge} falhou (${err.message}) — segue; será refeito no próximo ciclo`); }
  }
  const r = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n, round(sum(valor)/1e6) mi FROM convenios_captados_sc`);
  console.log(`Convênios concluído: ${grav} nesta rodada · ${JSON.stringify(r.rows[0])}`);
  await trava.solta();   // sem soltar, a próxima rodada esperaria a batida envelhecer sem motivo
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
