// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portaltp.mjs — folha dos municípios que usam o Portal TP.
//
// ⭐ É a fonte MAIS COMPLETA das quatro de ERP: traz a hierarquia inteira da lotação
//    secretaria → divisao → secao  (ex.: "SECRETARIA MUNICIPAL DE OBRAS" → "GERENCIA DE OBRAS" → "INFRA RURAL")
// além de cargo, regime, situação, jornada, data de admissão, ato de nomeação, concurso e a folha RUBRICA A
// RUBRICA (40 pares nome/valor). Nenhuma outra fonte desta sessão tem os três níveis de lotação.
//
// O CAMINHO ATÉ ELA (a página /consultas não serve — é DevExpress com __VIEWSTATE e postback):
//   /api/dadosabertos.aspx  lista 35 rotas de API; a de pessoal aponta para o web service de verdade:
//   GET /api/transparencia.asmx/json_servidores?ano=AAAA&mes=MM
//   ⚠️ o ASMX devolve XML com o JSON DENTRO de <string> — precisa desembrulhar e desescapar entidades.
//
// 🚨 NUNCA SOMAR AS 40 RUBRICAS: a lista inclui os próprios TOTAIS ("Rendimento Bruto", "Total Desconto",
// "Rendimento Liquido") misturados às parcelas. Somar tudo dá R$ 26.831 para quem ganha R$ 8.182 de bruto —
// 3× inflado. O valor certo se lê PELO NOME da rubrica.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const ANO = process.env.ANO || String(new Date().getFullYear());
const MES = process.env.MES || null;   // quando vazio, tenta do mês corrente para trás até achar dado

await q(`create table if not exists folha_servidores_portaltp (
  cod_ibge text, municipio text, uf text, unidade_gestora text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, profissao text, regime text, situacao text,
  secretaria text, divisao text, secao text, local text, centro_custo text,
  horas_semanais text, jornada text, data_admissao text, data_demissao text,
  valor_padrao numeric, bruto numeric, descontos numeric, liquido numeric, rubricas jsonb,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tp_mun on folha_servidores_portaltp (cod_ibge, competencia)`);
await q(`create index if not exists ix_folha_tp_sec on folha_servidores_portaltp (uf, secretaria)`);
await q(`create table if not exists folha_portaltp_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

// 🚨 O JSON usa PONTO DECIMAL ("4786.63"), não formato brasileiro. Tirar os pontos como se fossem separador de
// milhar multiplica tudo por 100 — a folha de Extrema saiu R$ 1,88 BILHÃO com mediana de R$ 323 mil. Só tratar
// o ponto como milhar quando existe vírgula decimal na string. Mesmo erro já pago no Betha.
const num = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

// desembrulha o JSON de dentro do <string> do ASMX
const dorme = (ms) => new Promise((x) => setTimeout(x, ms));
// `*.portaltp.com.br` é HOST COMPARTILHADO (todos os slugs no mesmo servidor/IP): a raspagem rápida dispara
// HTTP 429. Backoff LONGO e específico para 429; laço de redirect é permanente (não gasta 3 retries).
// 🚨 O host canônico é `{slug}-{uf}.portaltp.com.br` (ex.: domingosmartins-es); o bare `{slug}` costuma dar 302/loop
// de redirect ("fetch failed"). Tenta `-uf` primeiro e cai para o bare como fallback.
async function servidores(slug, uf, ano, mes) {
  const hosts = [`${slug}-${String(uf || "").toLowerCase()}`, slug].filter((h, i, a) => h && a.indexOf(h) === i);
  let ultimoErro = "sem host";
  for (const h of hosts) {
    const r = await tentaHost(h, ano, mes);
    if (r.ok) return r.dados;
    ultimoErro = r.erro;
    if (r.erro === "429") throw new Error("HTTP 429 (rate limit persistente)"); // rate limit é do IP, trocar host não ajuda
  }
  throw new Error(ultimoErro);
}
async function tentaHost(host, ano, mes) {
  const url = `https://${host}.portaltp.com.br/api/transparencia.asmx/json_servidores?ano=${ano}&mes=${mes}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(300000), headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" } });
      if (r.status === 429) {
        if (t === 3) return { ok: false, erro: "429" };
        await dorme(20000 * (t + 1)); continue; // 20s, 40s, 60s
      }
      if (r.status >= 300 && r.status < 400) return { ok: false, erro: "redirect (" + r.status + ")" }; // host errado → tenta o próximo
      if (!r.ok) return { ok: false, erro: "HTTP " + r.status };
      const xml = await r.text();
      const m = xml.match(/<string[^>]*>([\s\S]*)<\/string>/);
      if (!m) return { ok: true, dados: [] };
      const s = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      return { ok: true, dados: JSON.parse(s) };
    } catch (e) {
      if (t === 3) return { ok: false, erro: String(e?.cause?.message || e.message).slice(0, 60) };
      await dorme(4000 * (t + 1));
    }
  }
  return { ok: false, erro: "sem resposta" };
}
async function _servidoresOld(slug, ano, mes) {
  const url = `https://${slug}.portaltp.com.br/api/transparencia.asmx/json_servidores?ano=${ano}&mes=${mes}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300000), headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" } });
      if (r.status === 429) {
        if (t === 3) throw new Error("HTTP 429 (rate limit persistente)");
        const espera = 20000 * (t + 1); // 20s, 40s, 60s
        await dorme(espera); continue;
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const xml = await r.text();
      const m = xml.match(/<string[^>]*>([\s\S]*)<\/string>/);
      if (!m) return [];
      const s = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      return JSON.parse(s);
    } catch (e) {
      const msg = String(e?.cause?.message || e?.message || e);
      if (/redirect count exceeded/i.test(msg)) throw new Error("redirect loop (portal quebrado)"); // permanente
      if (t === 3) throw e;
      await dorme(4000 * (t + 1));
    }
  }
}

// lê as rubricas PELO NOME — e devolve também o mapa completo, para não perder as parcelas
function valores(r) {
  const rub = {};
  let bruto = null, desc = null, liq = null;
  for (let i = 1; i <= 40; i++) {
    const k = String(i).padStart(2, "0");
    const nome = (r["nome_rem" + k] || "").trim();
    const valor = num(r["valor_rem" + k]);
    if (!nome) continue;
    if (valor != null && valor !== 0) rub[nome] = (rub[nome] || 0) + valor;
    const n = nome.toLowerCase();
    if (/rendimento\s*bruto/.test(n) && valor) bruto = valor;
    else if (/total\s*desconto/.test(n) && valor) desc = valor;
    else if (/rendimento\s*l[íi]quido/.test(n) && valor) liq = valor;
  }
  return { bruto, desc, liq, rub };
}

const alvos = (await q(`select p.cod_ibge, p.slug, m.nome municipio, m.uf
  from erp_portal_municipal p join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.erp='portaltp' ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%' || $${UF ? 2 : 1} || '%'` : ""}
 order by m.uf, m.nome`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set((await q(`select cod_ibge from folha_portaltp_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[portaltp] ${alvos.length} portais · ${feitos.size} feitos · ${fila.length} na fila`);

const LOTE = 500;
async function grava(todos) {
  const m = new Map();
  for (const r of todos) m.set(r._hash, r);
  const regs = [...m.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_portaltp
      (cod_ibge,municipio,uf,unidade_gestora,competencia,nome,cpf_masc,matricula,cargo,profissao,regime,situacao,
       secretaria,divisao,secao,local,centro_custo,horas_semanais,jornada,data_admissao,data_demissao,
       valor_padrao,bruto,descontos,liquido,rubricas,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
        $18::text[],$19::text[],$20::text[],$21::text[],$22::numeric[],$23::numeric[],$24::numeric[],$25::numeric[],
        $26::jsonb[],$27::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
        liquido=excluded.liquido, rubricas=excluded.rubricas, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("unidade_gestora"), c("competencia"), c("nome"), c("cpf_masc"),
       c("matricula"), c("cargo"), c("profissao"), c("regime"), c("situacao"), c("secretaria"), c("divisao"),
       c("secao"), c("local"), c("centro_custo"), c("horas_semanais"), c("jornada"), c("data_admissao"),
       c("data_demissao"), c("valor_padrao"), c("bruto"), c("descontos"), c("liquido"), c("rubricas"), c("_hash")]);
  }
}

let total = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_portaltp_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, competencia, linhas, situacao, detalhe]);
  try {
    // sem MES fixo, recua a partir do mês corrente até achar competência com dado (a folha do mês pode não ter fechado)
    const meses = MES ? [MES] : Array.from({ length: 4 }, (_, k) => {
      const d = new Date(); d.setMonth(d.getMonth() - k); return String(d.getMonth() + 1).padStart(2, "0");
    });
    let linhas = [], comp = null;
    for (const mes of meses) {
      linhas = await servidores(a.slug, a.uf, ANO, mes);
      if (linhas.length) { comp = `${ANO}${mes}`; break; }
    }
    if (!linhas.length) { await marca("vazio", `sem dado em ${ANO}`); falhas++; continue; }

    const regs = linhas.map((r) => {
      const v = valores(r);
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, unidade_gestora: r.unidade_gestora,
        competencia: `${r.ano}${String(r.mes).padStart(2, "0")}`, nome: r.nome, cpf_masc: r.documento,
        matricula: r.matricula, cargo: r.cargo, profissao: r.profissao, regime: r.regime, situacao: r.situacao,
        secretaria: r.secretaria || null, divisao: r.divisao || null, secao: r.secao || null,
        local: r.local || null, centro_custo: r.centro_custo || null,
        horas_semanais: r.horas_semanais, jornada: r.jornada,
        data_admissao: r.data_admissao, data_demissao: r.data_demissao,
        valor_padrao: num(r.valor_padrao), bruto: v.bruto, descontos: v.desc, liquido: v.liq,
        rubricas: JSON.stringify(v.rub),
        _hash: crypto.createHash("md5").update([a.cod_ibge, r.ano, r.mes, r.matricula, r.nome, r.cargo, r.unidade_gestora].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", null, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp})`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
  await dorme(2000); // host compartilhado: pausa cortês entre municípios para não saturar o portaltp.com.br
}
console.log(`\n[portaltp] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
