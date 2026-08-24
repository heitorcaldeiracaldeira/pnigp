// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_consfolha.mjs — portal "Consulta Folha" de SÃO LEOPOLDO/RS (DataTables server-side).
//
// ⭐ Achado em 17/ago/2026. São Leopoldo era o 3º maior faltante do estado (5.058 vínculos na RAIS) e estava
// carimbado como "GRP/Thema com integração ADMRH desligada; portal do servidor em :8443 exige credencial" — o que
// era verdade sobre o GRP e falso sobre o município: a folha vive num portal SEPARADO,
// `consfolha.saoleopoldo.rs.gov.br`, que nem o Radar nem o menu do GRP citam. Quem o revelou foi a busca web.
//
// O contrato é DataTables puro, sem sessão nem captcha:
//   POST /externa/fetchJson   (form-urlencoded, X-Requested-With: XMLHttpRequest)
//        draw · start · length · columns[i][data|name|searchable|orderable|search[value|regex]] · order · search
//   → {draw, recordsTotal, recordsFiltered, data:[[matricula, nome, cargo, departamento, secretaria, ano, mes,
//                                                  "R$ 8315,64", "R$ 5460,58"]]}
// As 9 colunas vêm como ARRAY POSICIONAL, sem nome — a ordem é a da tela.
//
// 🚨 `length=-1` (o "todos" do DataTables) devolve vazio aqui; pagina-se em blocos.
//
// Uso: node scripts/ingest_folha_consfolha.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const LOTE = Number(process.env.LOTE || 1000);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
            "x-requested-with": "XMLHttpRequest", accept: "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8" };

const ALVOS = [
  { municipio: "São Leopoldo", uf: "RS", base: "https://consfolha.saoleopoldo.rs.gov.br", colunas: 9 },
];

await q(`create table if not exists folha_servidores_consfolha (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, departamento text, secretaria text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_consfolha_mun on folha_servidores_consfolha (cod_ibge, competencia)`);
await q(`create table if not exists folha_consfolha_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  servidores int, com_valor int, declarado int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
const MES = { JANEIRO: "01", FEVEREIRO: "02", "MARÇO": "03", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
              JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12" };

function corpo(start, length, nCols) {
  const p = new URLSearchParams();
  p.set("draw", "1");
  for (let i = 0; i < nCols; i++) {
    p.set(`columns[${i}][data]`, String(i));
    p.set(`columns[${i}][name]`, "");
    p.set(`columns[${i}][searchable]`, "true");
    p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, "");
    p.set(`columns[${i}][search][regex]`, "false");
  }
  p.set("order[0][column]", "1"); p.set("order[0][dir]", "asc");
  p.set("start", String(start)); p.set("length", String(length));
  p.set("search[value]", ""); p.set("search[regex]", "false");
  return p.toString();
}

async function pagina(base, start, length, nCols) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${base}/externa/fetchJson`, { method: "POST", headers: { ...H, referer: `${base}/` },
        body: corpo(start, length, nCols), signal: AbortSignal.timeout(180000) });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); continue; }
      const txt = await r.text();
      if (!/^\s*\{/.test(txt)) return null;
      return JSON.parse(txt);
    } catch { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
  return null;
}

for (const a of ALVOS) {
  // 🚨 código IBGE vem do cadastro, nunca digitado ([[pnigp-nunca-digitar-codigo-ibge]])
  const mun = (await q(`select cod_ibge from municipios_br where uf=$1 and lower(nome)=lower($2) limit 1`,
    [a.uf, a.municipio])).rows[0];
  if (!mun) { console.log(`✖ ${a.municipio}/${a.uf} não está em municipios_br`); continue; }
  console.log(`\n[consfolha] ${a.municipio}/${a.uf}`);

  const primeira = await pagina(a.base, 0, 1, a.colunas);
  if (!primeira) { console.log("   ✖ fetchJson não respondeu JSON"); continue; }
  const total = primeira.recordsTotal || 0;
  console.log(`   declarado: ${total} registros`);
  if (!total) {
    await q(`insert into folha_consfolha_coleta (cod_ibge,municipio,uf,servidores,com_valor,declarado,situacao,detalhe,em)
      values ($1,$2,$3,0,0,0,'vazio','fetchJson respondeu com recordsTotal=0',now())
      on conflict (cod_ibge) do update set situacao='vazio', detalhe=excluded.detalhe, em=now()`,
      [mun.cod_ibge, a.municipio, a.uf]);
    continue;
  }

  let gravados = 0, comValor = 0;
  const comps = new Map();
  for (let start = 0; start < total; start += LOTE) {
    const j = await pagina(a.base, start, LOTE, a.colunas);
    if (!j?.data?.length) break;
    for (const l of j.data) {
      const [matricula, nome, cargo, departamento, secretaria, ano, mes, proventos, descontos] = l;
      const competencia = `${ano}${MES[String(mes).toUpperCase().trim()] || "00"}`;
      comps.set(competencia, (comps.get(competencia) || 0) + 1);
      const bruto = money(proventos), desc = money(descontos);
      const _hash = crypto.createHash("sha1")
        .update([mun.cod_ibge, competencia, matricula, nome, cargo, departamento].join("|")).digest("hex");
      await q(`insert into folha_servidores_consfolha
        (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, departamento, secretaria,
         bruto, descontos, liquido, _hash)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, _coletado_em=now()`,
        [mun.cod_ibge, a.municipio, a.uf, competencia, String(matricula ?? ""), nome, cargo, departamento,
         secretaria, bruto, desc, bruto != null && desc != null ? +(bruto - desc).toFixed(2) : null, _hash]);
      gravados++; if (bruto > 0) comValor++;
    }
    process.stdout.write(`   ${Math.min(start + LOTE, total)}/${total}\r`);
  }
  const competencia = [...comps.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  console.log(`   ${gravados === total ? "✔" : "⚠"} ${gravados} gravados · ${comValor} com valor · declarado ${total}`
    + ` · competências: ${[...comps.entries()].map(([c, n]) => `${c}:${n}`).join(" ")}`);
  await q(`insert into folha_consfolha_coleta
    (cod_ibge, municipio, uf, competencia, servidores, com_valor, declarado, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, servidores=excluded.servidores,
      com_valor=excluded.com_valor, declarado=excluded.declarado, situacao=excluded.situacao,
      detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, a.municipio, a.uf, competencia, gravados, comValor, total,
     gravados === total ? "ok" : "ok_parcial",
     `DataTables /externa/fetchJson; competências na grade: ${[...comps.keys()].join(",")}`]);
}
await db.end();
