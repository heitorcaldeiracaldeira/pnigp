// CARTEIRO das notificações — pega os deltas pendentes (status='detectado'), resolve os destinatários no cadastro
// (verificados, ativos, válidos, canal e-mail, secretaria/áreas casando com a regra), compõe UM digest por pessoa e
// ENVIA por SMTP. Sem credencial (SMTP_HOST/USER/PASS no .env.local) → modo SIMULADO (só reporta, não envia).
// node scripts/enviar_notificacoes.mjs   (SIMULAR=1 força dry-run)
import fs from "fs"; import pg from "pg"; import nodemailer from "nodemailer";
const env = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const cfg = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim() || process.env[k];
const SMTP = { host: cfg("SMTP_HOST"), port: Number(cfg("SMTP_PORT")) || 587, user: cfg("SMTP_USER"), pass: cfg("SMTP_PASS"), from: cfg("SMTP_FROM") || cfg("SMTP_USER") };
const REAL = !process.env.SIMULAR && SMTP.host && SMTP.user && SMTP.pass;
const NAT = { regularizacao: "🔴 Regularização", oportunidade: "💰 Oportunidade", obrigacao: "📅 Prazo", risco: "⚠️ Risco", transparencia: "📄 Transparência", positivo: "✅" };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  // deltas pendentes × destinatários (cadastro verificado, e-mail, secretaria OU área marcada casa com a regra)
  const rows = (await db.query(
    `SELECT l.id log_id, l.cod_ibge, e.nome municipio, r.titulo, r.natureza, coalesce(r.solucao_i10,'') solucao, l.severidade,
       c.id dest_id, c.nome dest_nome, c.email
     FROM notificacao_log l
     JOIN notificacao_regras r ON r.alerta_id = l.alerta_id
     JOIN entes_sc e ON e.cod_ibge = l.cod_ibge
     JOIN notificacao_cadastro c ON c.cod_ibge = l.cod_ibge AND c.ativo AND c.contato_verificado
       AND (c.validade IS NULL OR c.validade >= now()) AND c.email IS NOT NULL AND c.canal_pref = 'email'
       AND (c.secretaria = r.secretaria OR r.secretaria = ANY(c.areas))
     WHERE l.resolvido_em IS NULL AND l.status_envio = 'detectado'
     ORDER BY c.email, (l.severidade='critico') DESC`)).rows;

  // agrupa por destinatário
  const porDest = new Map();
  for (const x of rows) {
    if (!porDest.has(x.email)) porDest.set(x.email, { nome: x.dest_nome, municipio: x.municipio, alertas: [], logIds: [] });
    const g = porDest.get(x.email); g.alertas.push(x); g.logIds.push(x.log_id);
  }

  console.log(`\n=== CARTEIRO (${REAL ? "ENVIO REAL via SMTP" : "SIMULADO — sem credencial SMTP"}) ===`);
  console.log(`  ${rows.length} alerta(s) pendente(s) · ${porDest.size} destinatário(s) com e-mail verificado`);
  if (porDest.size === 0) { console.log("  nada a enviar (cadastre a equipe com contato verificado)."); await db.end(); return; }

  const tx = REAL ? nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465, auth: { user: SMTP.user, pass: SMTP.pass } }) : null;
  let enviados = 0;
  for (const [email, g] of porDest) {
    const linhas = g.alertas.map((a) => `<li><b>${NAT[a.natureza] || ""} ${a.titulo}</b>${a.solucao ? ` — <i>solução i10: ${a.solucao}</i>` : ""}</li>`).join("");
    const html = `<p>Prezado(a) ${g.nome},</p><p>Identificamos <b>${g.alertas.length} ponto(s)</b> que requerem atenção em <b>${g.municipio}</b>:</p><ul>${linhas}</ul><p>Acesse o painel para os detalhes e a solução.</p><p style="color:#888;font-size:12px">— Monitoramento i10 Gov 360 · dados oficiais</p>`;
    const assunto = `[i10 Gov 360] ${g.alertas.length} alerta(s) de gestão — ${g.municipio}`;
    if (REAL) {
      try {
        await tx.sendMail({ from: SMTP.from, to: email, subject: assunto, html });
        await db.query(`UPDATE notificacao_log SET status_envio='enviado', canal='email' WHERE id = ANY($1)`, [g.logIds]);
        enviados++; console.log(`  ✔ ${email} (${g.alertas.length} alertas)`);
      } catch (e) { console.log(`  ✖ ${email}: ${e.message.slice(0, 60)}`); }
    } else {
      console.log(`  [simulado] → ${email}: "${assunto}" (${g.alertas.length} alertas)`);
    }
  }
  if (REAL) console.log(`  ${enviados}/${porDest.size} e-mails enviados e marcados.`);
  else console.log(`  MODO SIMULADO — nada enviado. Para ativar: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS no .env.local.`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
