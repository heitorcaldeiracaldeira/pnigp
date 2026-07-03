// PROVA REAL dos motores de notificação/risco — concilia o que o MOTOR gera (notificacao_log) com uma consulta
// INDEPENDENTE na base. Foco: (a) false-positive (motor flagou quem não devia); (b) false-negative = "nada some"
// (existe na base mas o motor não flagou); (c) cross-check entre representações diferentes da mesma coisa.
// Read-only. node scripts/prova_real_notificacoes.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const q = async (s) => (await db.query(s)).rows;
  const set = (rows) => new Set(rows.map((r) => r.cod_ibge));
  const diff = (a, b) => [...a].filter((x) => !b.has(x));
  let problemas = 0;
  const linha = (nome, motor, indep) => {
    const mSet = set(motor), iSet = set(indep);
    const fp = diff(mSet, iSet); // motor flagou, independente não → false positive
    const fn = diff(iSet, mSet); // independente tem, motor não → false negative (nada some!)
    const ok = fp.length === 0 && fn.length === 0;
    if (!ok) problemas++;
    console.log(`\n${ok ? "🟢" : "🔴"} ${nome}`);
    console.log(`   motor=${mSet.size} · independente=${iSet.size}`);
    if (fp.length) console.log(`   ⚠️ FALSE-POSITIVE (motor flagou, base não): ${fp.length} → ${fp.slice(0, 5).join(",")}`);
    if (fn.length) console.log(`   ⚠️ FALSE-NEGATIVE (base tem, motor NÃO — "sumiu"): ${fn.length} → ${fn.slice(0, 5).join(",")}`);
    if (ok) console.log(`   ✓ conjuntos idênticos — nada some, nenhum falso.`);
  };

  console.log("=== PROVA REAL — motores de notificação/risco ===");

  // 1) CAUC — motor usa cauc_detalhe (por requisito); a Central de Alertas/ponto usa cauc_sc (agregado). Devem casar.
  const cauc_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='cauc_requisito_vencido' AND resolvido_em IS NULL`);
  const cauc_detalhe = await q(`SELECT DISTINCT cod_ibge FROM cauc_detalhe_sc WHERE status='pendente'`);
  linha("CAUC — motor(log) × cauc_detalhe status=pendente (fonte direta)", cauc_log, cauc_detalhe);
  const cauc_sc = await q(`SELECT cod_ibge FROM cauc_sc WHERE apto=false OR n_pendencias>0`);
  linha("CAUC — cross-check cauc_detalhe × cauc_sc (2 representações)", cauc_detalhe, cauc_sc);

  // 2) CRP — motor (último CRP vencido) × getAlertasSC (mesma regra, formulação independente)
  const crp_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='crp_vencido' AND resolvido_em IS NULL`);
  const crp_indep = await q(`WITH l AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, tp_crp, dt_validade FROM rpps_crp_sc WHERE cod_ibge IS NOT NULL ORDER BY cod_ibge, dt_emissao DESC NULLS LAST)
    SELECT cod_ibge FROM l WHERE tp_crp ILIKE '%VENC%' OR dt_validade < now()`);
  linha("CRP — motor(log) × última-emissão vencida (fonte direta)", crp_log, crp_indep);

  // 3) Convênio inadimplente — motor × getConveniosRiscoSC (criticoN>0)
  const conv_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='convenio_inadimplente' AND resolvido_em IS NULL`);
  const conv_indep = await q(`SELECT DISTINCT cod_ibge FROM convenios_captados_sc WHERE situacao IN ('INADIMPLENTE','PRESTAÇÃO DE CONTAS REJEITADA')`);
  linha("Convênio inadimplente — motor(log) × convenios_captados (fonte)", conv_log, conv_indep);

  // 4) Contrato a vencer 90d — motor × contratos_sc (fonte, formulação independente com current_date)
  const contr_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='contrato_a_vencer' AND resolvido_em IS NULL`);
  const contr_indep = await q(`SELECT DISTINCT cod_ibge FROM contratos_sc WHERE vig_fim >= current_date AND vig_fim <= current_date + interval '90 days'`);
  linha("Contrato a vencer (90d) — motor(log) × contratos_sc (fonte)", contr_log, contr_indep);

  // 5) LRF pessoal — motor (último ano > 48,6) × rgf_sc (fonte)
  const lrf_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='lrf_pessoal_limite' AND resolvido_em IS NULL`);
  const lrf_indep = await q(`WITH l AS (SELECT DISTINCT ON (cod_ibge) cod_ibge, pessoal_pct FROM rgf_sc WHERE pessoal_pct IS NOT NULL ORDER BY cod_ibge, ano DESC) SELECT cod_ibge FROM l WHERE pessoal_pct > 48.6`);
  linha("LRF pessoal — motor(log) × rgf_sc último ano (fonte)", lrf_log, lrf_indep);

  // 6) RPPS sem DRAA — motor × (tem rpps_sc, não tem atuarial). Cross-check: ausência confirmada na fonte CADPREV.
  const draa_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='rpps_sem_draa' AND resolvido_em IS NULL`);
  const draa_indep = await q(`SELECT DISTINCT r.cod_ibge FROM rpps_sc r WHERE r.cod_ibge<>'42' AND NOT EXISTS (SELECT 1 FROM rpps_atuarial_sc a WHERE a.cod_ibge=r.cod_ibge)`);
  linha("RPPS sem DRAA — motor(log) × rpps_sc sem atuarial (fonte)", draa_log, draa_indep);

  // 7) Sem RREO/RGF — motor × (publica DCA mas não RREO nem RGF no SICONFI)
  const rreo_log = await q(`SELECT DISTINCT cod_ibge FROM notificacao_log WHERE alerta_id='sem_rreo_rgf' AND resolvido_em IS NULL`);
  const rreo_indep = await q(`SELECT e.cod_ibge FROM entes_sc e WHERE e.tipo='M' AND length(e.cod_ibge)=7 AND EXISTS(SELECT 1 FROM financas_sc f WHERE f.cod_ibge=e.cod_ibge) AND NOT EXISTS(SELECT 1 FROM rreo_const_sc r WHERE r.cod_ibge=e.cod_ibge) AND NOT EXISTS(SELECT 1 FROM rgf_sc g WHERE g.cod_ibge=e.cod_ibge)`);
  linha("Sem RREO/RGF — motor(log) × financas sem RREO/RGF (fonte)", rreo_log, rreo_indep);

  console.log(`\n=== RESULTADO: ${problemas === 0 ? "🟢 TODOS OS MOTORES CONCILIAM — nada some, nenhum falso." : `🔴 ${problemas} motor(es) com divergência (ver acima)`} ===`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
