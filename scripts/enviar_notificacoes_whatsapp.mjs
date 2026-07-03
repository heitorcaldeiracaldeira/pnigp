// CARTEIRO WhatsApp — envia os deltas pendentes aos destinatários com canal_pref='whatsapp'. Usa a Meta WhatsApp
// Cloud API. IMPORTANTE: mensagem PROATIVA (iniciada pela empresa) exige TEMPLATE APROVADO pela Meta — não pode
// texto livre. O template sugerido "alerta_gestao" tem 3 variáveis: {{1}}=nome, {{2}}=município, {{3}}=nº de alertas.
// Sem credencial (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID no .env.local) → modo SIMULADO. node scripts/enviar_notificacoes_whatsapp.mjs
import fs from "fs"; import pg from "pg";
const env = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const cfg = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim() || process.env[k];
const WA = { token: cfg("WHATSAPP_TOKEN"), phoneId: cfg("WHATSAPP_PHONE_ID"), template: cfg("WHATSAPP_TEMPLATE") || "alerta_gestao", lang: cfg("WHATSAPP_LANG") || "pt_BR", api: cfg("WHATSAPP_API") || "https://graph.facebook.com/v20.0" };
const REAL = !process.env.SIMULAR && WA.token && WA.phoneId;
const e164 = (cel) => { const d = String(cel || "").replace(/\D/g, ""); return d.length >= 12 ? d : d.length ? "55" + d : ""; }; // Brasil: 55+DDD+num

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const rows = (await db.query(
    `SELECT l.id log_id, l.cod_ibge, e.nome municipio, l.severidade,
       c.id dest_id, c.nome dest_nome, c.celular
     FROM notificacao_log l
     JOIN notificacao_regras r ON r.alerta_id = l.alerta_id
     JOIN entes_sc e ON e.cod_ibge = l.cod_ibge
     JOIN notificacao_cadastro c ON c.cod_ibge = l.cod_ibge AND c.ativo AND c.contato_verificado
       AND (c.validade IS NULL OR c.validade >= now()) AND c.celular IS NOT NULL AND c.canal_pref = 'whatsapp'
       AND (c.secretaria = r.secretaria OR r.secretaria = ANY(c.areas))
     WHERE l.resolvido_em IS NULL AND l.status_envio = 'detectado'`)).rows;

  const porDest = new Map();
  for (const x of rows) {
    if (!porDest.has(x.dest_id)) porDest.set(x.dest_id, { nome: x.dest_nome, municipio: x.municipio, cel: e164(x.celular), n: 0, logIds: [] });
    const g = porDest.get(x.dest_id); g.n++; g.logIds.push(x.log_id);
  }

  console.log(`\n=== CARTEIRO WhatsApp (${REAL ? "ENVIO REAL — Meta Cloud API" : "SIMULADO — sem credencial"}) ===`);
  console.log(`  ${rows.length} alerta(s) pendente(s) · ${porDest.size} destinatário(s) com WhatsApp verificado`);
  if (porDest.size === 0) { console.log("  nada a enviar (cadastre a equipe c/ canal WhatsApp verificado)."); await db.end(); return; }

  let enviados = 0;
  for (const [, g] of porDest) {
    if (!g.cel) { console.log(`  ✖ ${g.nome}: celular inválido`); continue; }
    // corpo do template: 3 variáveis (nome, município, nº alertas)
    const payload = { messaging_product: "whatsapp", to: g.cel, type: "template",
      template: { name: WA.template, language: { code: WA.lang }, components: [{ type: "body", parameters: [{ type: "text", text: g.nome }, { type: "text", text: g.municipio }, { type: "text", text: String(g.n) }] }] } };
    if (REAL) {
      try {
        const r = await fetch(`${WA.api}/${WA.phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${WA.token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 100)}`);
        await db.query(`UPDATE notificacao_log SET status_envio='enviado', canal='whatsapp' WHERE id = ANY($1)`, [g.logIds]);
        enviados++; console.log(`  ✔ ${g.nome} (${g.cel}, ${g.n} alertas)`);
      } catch (e) { console.log(`  ✖ ${g.nome}: ${e.message.slice(0, 80)}`); }
    } else {
      console.log(`  [simulado] → ${g.nome} (${g.cel}): template "${WA.template}" [${g.nome}, ${g.municipio}, ${g.n} alertas]`);
    }
  }
  if (REAL) console.log(`  ${enviados}/${porDest.size} mensagens enviadas.`);
  else console.log(`  MODO SIMULADO. Para ativar: WHATSAPP_TOKEN + WHATSAPP_PHONE_ID no .env.local + template "${WA.template}" aprovado na Meta.`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
