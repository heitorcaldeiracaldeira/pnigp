// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portovelho.mjs — folha nominal de PORTO VELHO (RO), capital com ~12.6 mil servidores.
//
// ⭐ POR QUE VALE: era a 14ª maior lacuna do país (17.482 na RAIS) e a prefeitura publica uma **API REST
// documentada em OpenAPI** — `https://api.portovelho.ro.gov.br/docs/api.json`, 77 rotas, sem autenticação.
// O caminho:
//   /recursos-humanos/instituicoes                          → portal_id de cada entidade
//   /recursos-humanos/anos/{portal}  ·  /meses/{portal}/{ano}
//   /recursos-humanos/movimentacoes/{portal}/{ano}/{mes}     → CADASTRO paginado (30/pág)
//   /recursos-humanos/remuneracao/{portal}/{matricula}/{ano}/{mes} → VALORES
// Cadastro: matrícula · nome · cargo · **lotacao (=secretaria, "SEMED…"/"SEMUSA…")** · local_trabalho ·
// regime · situação · horas · admissão. Valores: `valor_rem07` = Salário Bruto, `valor_rem13` = Líquido,
// `valor_rem01` = base. ⭐ O CPF já vem MASCARADO pela própria API.
//
// 🚨 O VALOR NÃO VEM NO CADASTRO — é uma requisição POR SERVIDOR. São ~422 páginas + ~12.6 mil chamadas.
// 🚨 A API tem LIMITE DE REQUISIÇÕES agressivo: responde `{"message":"Too Many Attempts."}` com HTTP 429
//    depois de poucas chamadas seguidas. Não é bloqueio nosso nem defeito: é throttling normal. O coletor
//    respeita — intervalo base entre chamadas e recuo exponencial no 429, sem forçar.
//    ⚠️ Uma consulta de remuneração devolve os DOZE MESES do ano de uma vez; aproveitar isso é o que evita
//    multiplicar o custo por competência.
//
// ⚠️ ESCOPO ([[pnigp-folha-escopo-executivo]]): entram Prefeitura e institutos de previdência/autarquias;
//    a **Câmara fica de fora** — em Porto Velho ela é o portal 12668.
//
// Uso: node scripts/ingest_folha_portovelho.mjs   ·  ANO=2026 MES=07   ·  PAUSA=1500 (ms entre chamadas)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const BASE = "https://api.portovelho.ro.gov.br/api/v1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const COD_IBGE = "1100205";
const PAUSA = Number(process.env.PAUSA || 1200);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

await q(`create table if not exists folha_servidores_portovelho (
  cod_ibge text, municipio text, uf text, portal_id int, entidade text, cnpj text, competencia text,
  matricula text, nome text, cpf_mascarado text, cargo text, lotacao text, local_trabalho text,
  regime text, situacao text, horas_semanais text, data_admissao text, data_demissao text,
  salario_base numeric, vantagens numeric, outras numeric, salario_bruto numeric,
  descontos numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_pvh_comp on folha_servidores_portovelho (cod_ibge, competencia)`);
await q(`create table if not exists folha_portovelho_coleta (
  portal_id int, competencia text, entidade text, cadastro int, com_valor int,
  situacao text, detalhe text, em timestamptz default now(),
  primary key (portal_id, competencia))`);

// ── HTTP com respeito ao limite ───────────────────────────────────────────────────────────────────────────────
let ultimaChamada = 0;
async function pega(rota, tentativa = 0) {
  const espera = Math.max(0, PAUSA - (Date.now() - ultimaChamada));
  if (espera) await dorme(espera);
  ultimaChamada = Date.now();
  let r;
  try {
    r = await fetch(`${BASE}${rota}`, { headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(90000) });
  } catch (e) {
    if (tentativa < 4) { await dorme(3000 * (tentativa + 1)); return pega(rota, tentativa + 1); }
    throw e;
  }
  if (r.status === 429) {
    if (tentativa > 7) throw new Error("429 persistente apos 8 tentativas");
    // recuo exponencial: 5s, 10s, 20s, 40s… — a API se recupera sozinha
    const pausa = 5000 * Math.pow(2, Math.min(tentativa, 4));
    process.stderr.write(`\r  ⏳ 429 — aguardando ${Math.round(pausa / 1000)}s   `);
    await dorme(pausa);
    return pega(rota, tentativa + 1);
  }
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 90)}`);
  try { return JSON.parse(t); } catch { throw new Error(`resposta nao-JSON em ${rota.slice(0, 50)}`); }
}

const num = (v) => {
  const n = v && v.valor && typeof v.valor.value === "number" ? v.valor.value : null;
  return n === null || Number.isNaN(n) ? null : n;
};
const MES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ── entidades no escopo ───────────────────────────────────────────────────────────────────────────────────────
const inst = await pega("/recursos-humanos/instituicoes");
const entidades = (inst.data || []).filter((e) =>
  !/c[âa]mara|legislativ|vereador/i.test(e.nome || ""));
console.log(`── Porto Velho · ${entidades.length} entidades no escopo (câmaras fora) ─────────────`);
for (const e of entidades) console.log(`   ${e.id}  ${e.nome}`);

let totalLinhas = 0;
for (const ent of entidades) {
  // ── competência: a mais recente publicada, e o ano corrente ─────────────────────────────────────────────
  let ano = process.env.ANO, mes = process.env.MES;
  if (!ano || !mes) {
    const anos = (await pega(`/recursos-humanos/anos/${ent.id}`)).data || [];
    if (!anos.length) { console.log(`  ${ent.nome}: sem anos publicados`); continue; }
    ano = String(anos[0].ano);
    const meses = (await pega(`/recursos-humanos/meses/${ent.id}/${ano}`)).data || [];
    if (!meses.length) { console.log(`  ${ent.nome}: sem meses em ${ano}`); continue; }
    mes = String(meses[0].mes).padStart(2, "0");
  }
  const competencia = `${ano}-${mes}`;
  console.log(`\n  ▸ ${ent.nome} · ${competencia}`);

  // ── cadastro paginado ─────────────────────────────────────────────────────────────────────────────────────
  const cadastro = [];
  let pagina = 1, ultima = 1;
  do {
    const j = await pega(`/recursos-humanos/movimentacoes/${ent.id}/${ano}/${mes}?page=${pagina}`);
    ultima = (j.meta && j.meta.last_page) || 1;
    cadastro.push(...(j.data || []));
    if (pagina % 20 === 0 || pagina === ultima)
      process.stderr.write(`\r    cadastro ${pagina}/${ultima} (${cadastro.length})   `);
    pagina++;
  } while (pagina <= ultima);
  console.log(`\n    cadastro: ${cadastro.length} servidores`);
  if (!cadastro.length) {
    await q(`insert into folha_portovelho_coleta (portal_id, competencia, entidade, cadastro, com_valor, situacao, detalhe, em)
             values ($1,$2,$3,0,0,'vazio','sem movimentacoes', now())
             on conflict (portal_id, competencia) do update set cadastro=0, situacao='vazio', em=now()`,
      [ent.id, competencia, ent.nome]);
    continue;
  }

  // ── valores, um por servidor ──────────────────────────────────────────────────────────────────────────────
  // 🚨 já coletados ficam de fora: com ~12,6 mil chamadas, retomar do zero custa horas
  const jaTem = new Set((await q(
    `select matricula from folha_servidores_portovelho
      where cod_ibge=$1 and competencia=$2 and portal_id=$3 and salario_bruto is not null`,
    [COD_IBGE, competencia, ent.id])).rows.map((r) => r.matricula));

  let comValor = 0, gravadas = 0, semValor = 0;
  const lote = [];
  const descarrega = async () => {
    if (!lote.length) return;
    const vals = [], params = [];
    let k = 1;
    for (const l of lote) {
      vals.push(`(${Array.from({ length: 25 }, () => `$${k++}`).join(",")})`);
      params.push(...l);
    }
    const r = await q(`insert into folha_servidores_portovelho
      (cod_ibge, municipio, uf, portal_id, entidade, cnpj, competencia, matricula, nome, cpf_mascarado,
       cargo, lotacao, local_trabalho, regime, situacao, horas_semanais, data_admissao, data_demissao,
       salario_base, vantagens, outras, salario_bruto, descontos, salario_liquido, _hash)
      values ${vals.join(",")} on conflict (_hash) do nothing`, params);
    gravadas += r.rowCount;
    lote.length = 0;
  };

  for (let i = 0; i < cadastro.length; i++) {
    const c = cadastro[i];
    if (jaTem.has(c.matricula)) { comValor++; continue; }
    let rem = null;
    try {
      const j = await pega(`/recursos-humanos/remuneracao/${ent.id}/${encodeURIComponent(c.matricula)}/${ano}/${mes}`);
      rem = ((j.data || {}).remuneracao || {})[MES_NOME[Number(mes) - 1]] || null;
    } catch { /* servidor sem ficha naquele mês: segue */ }
    if (!rem) semValor++; else comValor++;

    const h = crypto.createHash("md5").update([COD_IBGE, competencia, String(ent.id),
      c.matricula || "", c.nome || "", c.cargo || "", String(num(rem && rem.valor_rem07) ?? "")].join("|")).digest("hex");
    lote.push([COD_IBGE, "Porto Velho", "RO", ent.id, ent.nome,
      (c.unidade_gestora || {}).cnpj || null, competencia,
      c.matricula || null, c.nome || null, c.cpf || null, c.cargo || null,
      c.lotacao || null, c.local_trabalho || null, c.regime || null, c.situacao || null,
      c.horas_semanais || null, c.data_admissao || null, c.data_demissao || null,
      num(rem && rem.valor_rem01), num(rem && rem.valor_rem04), num(rem && rem.valor_rem05),
      num(rem && rem.valor_rem07), num(rem && rem.valor_rem12), num(rem && rem.valor_rem13), h]);
    if (lote.length >= 200) await descarrega();
    if (i % 50 === 0)
      process.stderr.write(`\r    valores ${i}/${cadastro.length} · ${comValor} com valor · ${semValor} sem   `);
  }
  await descarrega();
  console.log(`\n    ✔ ${cadastro.length} servidores · ${comValor} com valor · ${gravadas} novas linhas`);
  totalLinhas += cadastro.length;

  await q(`insert into folha_portovelho_coleta (portal_id, competencia, entidade, cadastro, com_valor, situacao, detalhe, em)
           values ($1,$2,$3,$4,$5,$6,$7, now())
           on conflict (portal_id, competencia) do update set
             cadastro = greatest(excluded.cadastro, folha_portovelho_coleta.cadastro),
             com_valor = greatest(excluded.com_valor, folha_portovelho_coleta.com_valor),
             situacao = case when excluded.cadastro = 0 and folha_portovelho_coleta.cadastro > 0
                             then folha_portovelho_coleta.situacao else excluded.situacao end,
             detalhe = excluded.detalhe, em = now()`,
    [ent.id, competencia, ent.nome, cadastro.length, comValor,
      semValor > cadastro.length * 0.5 ? "ok_sem_valor" : "ok",
      semValor ? `${semValor} sem ficha de remuneração` : null]);
}
console.log(`\n  ✔ ${totalLinhas.toLocaleString("pt-BR")} servidores em Porto Velho`);
await db.end();
