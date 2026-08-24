// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_folhamensal.mjs — ERP de portal próprio `transparencia.{slug}.{uf}.gov.br` (CodeIgniter),
// forte no Tocantins. Achado em 17/ago/2026 visitando um a um os municípios sem folha ([[pnigp-go-to-mapa-folha]]).
//
// ⭐ Entrega os CINCO campos de [[pnigp-folha-municipal-cinco-campos]] por HTTP puro, sem navegador e sem login:
//   Mat · Nome · **Lotação (=secretaria)** · Cargo/Função · Admissão · Tipo de Admissão · Desligamento ·
//   Horas Mensal · **Sal. Bruto** · Descontos · Sal. Líquido
//
// A API (POST, corpo `dados={json}`), base `https://{host}/index.php/transparencia/servidor/`:
//   getServidores  {entidade, exercicio, competencia, lot_codigo:-1, car_codigo:-1, fcp_grupoadm:-1, ...}
//   → devolve HTML com a tabela pronta (não JSON).
//
// ⚠️ HTML em ISO-8859-1: decodificar como latin1, senão a LOTAÇÃO vira "Lota��o" e não agrupa.
// ⚠️ Valores em pt-BR ("1.621,00") — ponto é milhar.
// 🚨 Usa o BRUTO (`Sal. Bruto`), nunca o líquido ([[pnigp-view-folha-nao-enxerga-coletores]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const SONDAR = Number(process.env.SONDAR || 6);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" };
const slugDe = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const UFN = { "17": "to", "52": "go" };

await q(`create table if not exists folha_servidores_folhamensal (
  cod_ibge text, municipio text, uf text, host text, entidade text, competencia text,
  matricula text, nome text, secretaria text, cargo text, vinculo text,
  carga_horaria text, bruto numeric, descontos numeric, liquido numeric,
  data_admissao text, data_desligamento text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_fm_mun on folha_servidores_folhamensal (cod_ibge, competencia)`);
await q(`create table if not exists folha_folhamensal_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const alvos = (await q(`select m.cod_ibge, m.nome municipio, left(m.cod_ibge,2) uf from municipios_br m
  where left(m.cod_ibge,2) in ('17','52')
    and not exists (select 1 from vw_folha_municipal_brasil v where v.cod_ibge=m.cod_ibge and v.fonte<>'rais')
    and not exists (select 1 from folha_folhamensal_coleta c where c.cod_ibge=m.cod_ibge and c.situacao in ('ok','ok_parcial','sem_host','sem_publicacao'))
  order by 3, 2`)).rows.filter((a) => !SO || new RegExp(SO, "i").test(a.municipio));
console.log(`[folhamensal] ${alvos.length} municípios na fila`);

const num = (v) => {
  let s = String(v ?? "").replace(/R\$|\s/g, "").trim();
  if (!s || s === "-") return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const limpa = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function post(host, acao, dados) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://${host}/index.php/transparencia/servidor/${acao}`, {
        method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
        body: "dados=" + encodeURIComponent(JSON.stringify(dados)), signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) { if (r.status >= 500) { await dorme(1500 * (t + 1)); continue; } return null; }
      // ⚠️ ISO-8859-1: decodificar pelo BUFFER, senão a lotação vem ilegível
      return Buffer.from(await r.arrayBuffer()).toString("latin1");
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
}

// extrai as linhas da tabela HTML que o getServidores devolve
function parseTabela(html) {
  const out = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => limpa(x[1]));
    if (tds.length < 10) continue;
    const [mat, nome, lot, cargo, adm, tipo, deslig, horas, bruto, desc, liq] = tds;
    if (!nome || /^mat$/i.test(mat)) continue;
    out.push({
      matricula: mat, nome, secretaria: lot, cargo, vinculo: tipo,
      carga_horaria: horas, bruto: num(bruto), descontos: num(desc), liquido: num(liq),
      data_admissao: adm && adm !== "-" ? adm : null, data_desligamento: deslig && deslig !== "-" ? deslig : null,
    });
  }
  return out;
}

async function grava(p, entidade, comp, regs) {
  const LOTE = 800;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE); const c = (f) => parte.map((x) => x[f]);
    await q(`insert into folha_servidores_folhamensal
      (cod_ibge,municipio,uf,host,entidade,competencia,matricula,nome,secretaria,cargo,vinculo,
       carga_horaria,bruto,descontos,liquido,data_admissao,data_desligamento,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],
        $16::text[],$17::text[],$18::text[])
      on conflict (_hash) do nothing`,
      [parte.map(() => p.cod_ibge), parte.map(() => p.municipio), parte.map(() => p.ufSigla), parte.map(() => p.host),
       parte.map(() => entidade), parte.map(() => comp), c("matricula"), c("nome"), c("secretaria"), c("cargo"),
       c("vinculo"), c("carga_horaria"), c("bruto"), c("descontos"), c("liquido"), c("data_admissao"), c("data_desligamento"),
       parte.map((r) => crypto.createHash("md5")
         .update([p.cod_ibge, entidade, comp, r.matricula, r.nome, r.cargo, r.bruto].join("¦")).digest("hex"))]);
  }
}

let ok = 0, parc = 0, vaz = 0, falhas = 0, total = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = { ...alvos[i], ufSigla: UFN[alvos[i].uf].toUpperCase() };
  const marca = (situacao, detalhe, host = null, comp = null, linhas = 0) =>
    q(`insert into folha_folhamensal_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set host=excluded.host,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.ufSigla, host, comp, linhas, situacao, detalhe]);
  try {
    const s = slugDe(a.municipio), uf = UFN[a.uf];
    let host = null, pagina = null;
    for (const h of [`transparencia.${s}.${uf}.gov.br`, `www.transparencia.${s}.${uf}.gov.br`]) {
      try {
        const r = await fetch(`https://${h}/transparencia/servidor/folhaMensal`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
        if (!r.ok) continue;
        const t = Buffer.from(await r.arrayBuffer()).toString("latin1");
        if (!/frmServidor|getServidores/i.test(t)) continue;
        host = h; pagina = t; break;
      } catch { /* não existe */ }
    }
    if (!host) { await marca("sem_host", "host não segue o padrão transparencia.{slug}.{uf}.gov.br"); falhas++; continue; }

    // 🚨 identidade: o título traz o nome do ente — evita coletar homônimo ([[pnigp-fila-erp-homonimo-contamina-uf]])
    // 🚨 A PÁGINA MISTURA ENCODINGS: a TABELA vem em ISO-8859-1, mas o <title> vem em UTF-8. Lido como latin1
    // ele sai "AraguaÃ§u" / "FIGUEIRÃPOLIS", e a comparação de identidade rejeitava o município CERTO —
    // Araguaçu e Figueirópolis foram descartados assim. Reparar o título antes de comparar.
    let titulo = (pagina.match(/<title>([^<]{0,80})/i) || [])[1] || "";
    if (/[ÃÂ]/.test(titulo)) { try { titulo = Buffer.from(titulo, "latin1").toString("utf8"); } catch { /* fica como está */ } }
    const palavras = a.municipio.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .split(/[^a-z]+/).filter((p) => p.length >= 5 && !["santa", "santo", "goias", "nossa"].includes(p));
    if (palavras.length && !palavras.some((p) => slugDe(titulo).includes(p))) {
      await marca("host_de_outro_ente", `título diz "${titulo.slice(0, 60)}"`, host); falhas++; continue;
    }

    const ents = [...pagina.matchAll(/<select[^>]*id="entidade"[\s\S]*?<\/select>/g)]
      .flatMap((m) => [...m[0].matchAll(/<option[^>]*value="([^"]+)"[^>]*>\s*([^<]{0,60})/g)])
      .map((x) => ({ v: x[1], t: x[2].trim() })).filter((e) => e.v && e.v !== "-1");
    const entidades = ents.length ? ents : [{ v: "1", t: "PREFEITURA" }];

    // ⭐ competência mais cheia ([[pnigp-competencia-mais-cheia-nao-a-recente]]): sonda os últimos meses
    const hoje = new Date(); let melhor = null;
    for (let k = 0; k < SONDAR; k++) {
      let ano = hoje.getFullYear(), mes = hoje.getMonth() + 1 - k;
      while (mes <= 0) { mes += 12; ano -= 1; }
      const html = await post(host, "getServidores", { entidade: entidades[0].v, exercicio: String(ano),
        competencia: String(mes), lot_codigo: "-1", car_codigo: "-1", fcp_grupoadm: "-1", fcp_matricula: "", pes_cpfcnpj: "", pes_nome: "" });
      const n = html ? parseTabela(html).length : 0;
      if (!melhor || n > melhor.n) melhor = { ano, mes, n };
      await dorme(250);
    }
    if (!melhor?.n) { await marca("sem_publicacao", `nenhuma das ${SONDAR} competências trouxe linhas`, host); vaz++; console.log(`  ○ [${i + 1}/${alvos.length}] ${a.municipio}: sem linhas`); continue; }

    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    let linhasMun = 0;
    for (const e of entidades) {
      const html = await post(host, "getServidores", { entidade: e.v, exercicio: String(melhor.ano),
        competencia: String(melhor.mes), lot_codigo: "-1", car_codigo: "-1", fcp_grupoadm: "-1", fcp_matricula: "", pes_cpfcnpj: "", pes_nome: "" });
      if (!html) continue;
      const regs = parseTabela(html);
      if (regs.length) { await grava({ ...a, host }, e.t, comp, regs); linhasMun += regs.length; }
      await dorme(300);
    }

    // conferidor da RAIS embutido — `ok_parcial` NÃO aposenta ([[pnigp-conferidor-rais-denominador-folha]])
    const rais = (await q(`select count(*)::int v from folha_rais_municipal where left(cod_ibge6::text,6)=left($1,6)`, [a.cod_ibge])).rows[0]?.v || 0;
    const pct = rais ? Math.round(1000 * linhasMun / rais) / 10 : null;
    const parcial = rais > 100 && linhasMun < rais * 0.35;
    await marca(parcial ? "ok_parcial" : "ok", `${entidades.length} entidades${pct != null ? ` · ${pct}% da RAIS` : ""}`, host, comp, linhasMun);
    if (parcial) parc++; else ok++;
    total += linhasMun;
    console.log(`  ${parcial ? "⚠" : " "} [${i + 1}/${alvos.length}] ${a.municipio}: ${linhasMun} servidores (${comp})${pct != null ? ` · ${pct}% da RAIS` : ""}`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(300);
}
console.log(`\n[folhamensal] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${parc} parciais · ${vaz} sem publicação · ${falhas} falhas`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(*)::int linhas,
  count(*) filter (where secretaria is not null and secretaria<>'')::int com_secretaria,
  count(*) filter (where bruto>0)::int com_salario from folha_servidores_folhamensal`)).rows);
await db.end();
