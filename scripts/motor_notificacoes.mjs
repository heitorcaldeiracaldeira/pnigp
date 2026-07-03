// MOTOR DE DELTA das notificações — computa os alertas ATUAIS por município (SQL direto sobre as bases),
// gera uma chave_delta que captura o ESTADO do fato, e registra em notificacao_log SÓ o que é novo/mudou
// (não repete o que já foi notificado e ainda não foi resolvido). É o "avise quando entrar dado novo".
// node scripts/motor_notificacoes.mjs   (MODO=plan → só conta, não grava)
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MODO = process.env.MODO || "run";

// Cada query devolve (cod_ibge, aid=alerta_id, chave=chave_delta, sev). A chave inclui o estado → se o estado muda,
// vira um novo delta (re-notifica); se é o mesmo, o NOT EXISTS abaixo evita repetir.
const QUERIES = [
  // CRP vencido (último CRP por município)
  `WITH l AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, nr_crp, tp_crp, dt_validade FROM rpps_crp_sc WHERE cod_ibge IS NOT NULL ORDER BY cod_ibge, dt_emissao DESC NULLS LAST)
   SELECT cod_ibge, 'crp_vencido' aid, 'crp:'||coalesce(nr_crp,'?') chave, 'critico' sev FROM l WHERE tp_crp ILIKE '%VENC%' OR dt_validade < now()`,
  // CAUC — requisitos PENDENTES (status='pendente' é a pendência real; validade<now pega "comprovado" só com data passada — bug pego na prova real, confirma com cauc_sc)
  `SELECT cod_ibge, 'cauc_requisito_vencido' aid, 'cauc:'||count(*)::text chave, 'critico' sev FROM cauc_detalhe_sc WHERE status='pendente' GROUP BY cod_ibge`,
  // Convênio inadimplente / prestação rejeitada
  `SELECT cod_ibge, 'convenio_inadimplente' aid, 'convinad:'||count(*)::text chave, 'critico' sev FROM convenios_captados_sc WHERE situacao IN ('INADIMPLENTE','PRESTAÇÃO DE CONTAS REJEITADA') GROUP BY cod_ibge`,
  // Contrato a vencer em 90 dias (agregado por município — o roteamento fino por contrato é o passo #4)
  `SELECT cod_ibge, 'contrato_a_vencer' aid, 'contr90:'||count(*)::text chave, 'alto' sev FROM contratos_sc WHERE vig_fim BETWEEN current_date AND current_date + 90 GROUP BY cod_ibge`,
  // RPPS sem DRAA (estudo atuarial) no CADPREV — tem RPPS mas não entregou o DRAA (obrigatório, condição do CRP)
  `SELECT DISTINCT r.cod_ibge, 'rpps_sem_draa' aid, 'rpps_sem_draa' chave, 'alto' sev FROM rpps_sc r WHERE r.cod_ibge <> '42' AND NOT EXISTS (SELECT 1 FROM rpps_atuarial_sc a WHERE a.cod_ibge = r.cod_ibge)`,
  // Município não publica RREO/RGF no SICONFI (só a DCA) — obrigatórios pela LRF, transparência
  `SELECT e.cod_ibge, 'sem_rreo_rgf' aid, 'sem_rreo_rgf' chave, 'medio' sev FROM entes_sc e WHERE e.tipo='M' AND length(e.cod_ibge)=7 AND EXISTS(SELECT 1 FROM financas_sc f WHERE f.cod_ibge=e.cod_ibge) AND NOT EXISTS(SELECT 1 FROM rreo_const_sc r WHERE r.cod_ibge=e.cod_ibge) AND NOT EXISTS(SELECT 1 FROM rgf_sc g WHERE g.cod_ibge=e.cod_ibge)`,
  // Pessoal/RCL na banda da LRF (chave = banda → muda ao cruzar 48,6/51,3/54)
  `WITH l AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, pessoal_pct FROM rgf_sc WHERE pessoal_pct IS NOT NULL ORDER BY cod_ibge, ano DESC)
   SELECT cod_ibge, 'lrf_pessoal_limite' aid, 'lrf:'||(CASE WHEN pessoal_pct>54 THEN 'limite' WHEN pessoal_pct>51.3 THEN 'prudencial' ELSE 'alerta' END) chave,
     (CASE WHEN pessoal_pct>54 THEN 'critico' WHEN pessoal_pct>51.3 THEN 'alto' ELSE 'medio' END) sev FROM l WHERE pessoal_pct > 48.6`,
];

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const union = QUERIES.map((q) => `(${q})`).join("\nUNION ALL\n");

  // quantos alertas ATUAIS (snapshot) e quantos são NOVOS (delta = não estão no log ainda-não-resolvido)
  const atuais = Number((await db.query(`SELECT count(*) n FROM (${union}) t`)).rows[0].n);
  const novos = Number((await db.query(
    `SELECT count(*) n FROM (${union}) novo WHERE NOT EXISTS (
       SELECT 1 FROM notificacao_log l WHERE l.cod_ibge=novo.cod_ibge AND l.chave_delta=novo.chave AND l.resolvido_em IS NULL)`)).rows[0].n);

  let gravou = 0, positivos = 0;
  if (MODO === "run") {
    if (novos > 0) {
      const r = await db.query(
        `INSERT INTO notificacao_log (cod_ibge, alerta_id, chave_delta, severidade, canal, status_envio)
         SELECT novo.cod_ibge, novo.aid, novo.chave, novo.sev, 'pendente', 'detectado'
         FROM (${union}) novo
         WHERE NOT EXISTS (SELECT 1 FROM notificacao_log l WHERE l.cod_ibge=novo.cod_ibge AND l.chave_delta=novo.chave AND l.resolvido_em IS NULL)`);
      gravou = r.rowCount;
    }
    // POSITIVOS: um alerta ativo cujo tipo NÃO aparece mais no snapshot = problema resolvido → fecha e registra o ganho.
    const p = await db.query(
      `WITH atual AS (${union}),
       fechados AS (
         UPDATE notificacao_log l SET resolvido_em=now(), status_envio='resolvido_auto'
         WHERE l.resolvido_em IS NULL AND l.alerta_id NOT LIKE 'positivo%'
           AND NOT EXISTS (SELECT 1 FROM atual a WHERE a.cod_ibge=l.cod_ibge AND a.aid=l.alerta_id)
         RETURNING l.cod_ibge, l.alerta_id )
       INSERT INTO notificacao_impacto (cod_ibge, alerta_id, tipo_impacto, descricao)
       SELECT cod_ibge, alerta_id, 'resolvido', 'resolvido — o alerta deixou de aparecer nos dados (ex.: CRP renovado, CAUC regularizado)' FROM fechados`);
    positivos = p.rowCount;
  }

  // ROTEAMENTO (fiscal-por-contrato e demais): casa o delta ativo → regra (secretaria/audiência) → cadastro do servidor.
  // Servidor da secretaria da regra (ou perfil na audiência) recebe; sem ninguém válido = fallback (gabinete/institucional).
  const rot = (await db.query(
    `SELECT count(DISTINCT l.id) total,
       count(DISTINCT l.id) FILTER (WHERE c.id IS NOT NULL) roteados
     FROM notificacao_log l
     JOIN notificacao_regras r ON r.alerta_id = l.alerta_id
     LEFT JOIN notificacao_cadastro c ON c.cod_ibge = l.cod_ibge AND c.ativo AND c.contato_verificado AND (c.validade IS NULL OR c.validade >= now()) AND (c.secretaria = r.secretaria OR r.secretaria = ANY(c.areas))
     WHERE l.resolvido_em IS NULL`)).rows[0];

  const porTipo = (await db.query(`SELECT aid, count(*) n FROM (${union}) t GROUP BY aid ORDER BY n DESC`)).rows;
  console.log(`\n=== MOTOR DE DELTA (${MODO}) ===`);
  console.log(`  alertas atuais (snapshot): ${atuais}`);
  console.log(`  NOVOS (delta) desde a última rodada: ${novos}${MODO === "run" ? ` → gravados: ${gravou}` : " (MODO=plan — nada gravado)"}`);
  if (MODO === "run") console.log(`  POSITIVOS (auto-resolvidos — problema saiu dos dados): ${positivos}`);
  console.log(`  por tipo: ${porTipo.map((x) => `${x.aid}=${x.n}`).join(" · ")}`);
  console.log(`  ROTEAMENTO: ${rot.roteados}/${rot.total} deltas ativos com servidor cadastrado na secretaria (resto → fallback gabinete/institucional)`);
  const logTot = Number((await db.query(`SELECT count(*) n FROM notificacao_log`)).rows[0].n);
  console.log(`  total no notificacao_log: ${logTot}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
