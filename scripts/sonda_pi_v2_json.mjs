// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_pi_v2_json.mjs — o PIAUÍ tem DOIS layouts na tela /servidores, e a diferença decide tudo:
//
//   layout "v2"  → DevExpress DataGrid servido por `GET /v2/servidores.json?skip=&take=&requireTotalCount=true`
//                  campos: matricula · nomeServidor · **remuneracaoLiquida** · nomeDoCargo · ano · mes  → É FOLHA.
//   layout velho → tabela Laravel em `/{slug}/servidores/`, POST com _token, SEM valor → quadro de pessoal.
//
// 🚨 POR QUE ESTA SONDA EXISTE: o visitador por navegador dizia `tem_valor=false` para TODO MUNDO porque
// procurava a palavra "remuneração" no <th> — e no v2 não há <th> (o DevExpress monta o cabeçalho em <div>).
// Barro Duro, marcado "sem valor", publica R$ de 317 servidores. A leitura pelo rótulo mentiu; a coleta não.
// Aqui a prova é o JSON respondendo com totalCount > 0 ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// Uso: node scripts/sonda_pi_v2_json.mjs   ·   CONC=12
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 12);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json", "x-requested-with": "XMLHttpRequest" };

await q(`create table if not exists pi_v2_sonda (
  cod_ibge text primary key, municipio text, url_json text, total int, ano int, mes text,
  tem_valor boolean, situacao text, detalhe text, em timestamptz default now())`);

const alvos = (await q(`select m.cod_ibge, m.nome,
    (select v.url from pi_servidores_visita v where v.cod_ibge=m.cod_ibge and v.url is not null) url_visita
  from municipios_br m where m.uf='PI' order by m.nome`)).rows;
console.log(`[pi-v2] sondando ${alvos.length} municípios`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ pi$/, "").replace(/ do piaui$/, "").replace(/[^a-z0-9]/g, "");

function candidatos(a) {
  const s = slug(a.nome);
  const c = [];
  if (a.url_visita) { try { c.push(new URL(a.url_visita).origin + "/v2/servidores.json"); } catch {} }
  c.push(`https://transparencia.${s}.pi.gov.br/v2/servidores.json`,
         `https://${s}.pi.gov.br/v2/servidores.json`,
         `http://transparencia.${s}.pi.gov.br/v2/servidores.json`);
  return [...new Set(c)];
}

async function sonda(a) {
  let ultimo = "sem host";
  for (const base of candidatos(a)) {
    const u = `${base}?skip=0&take=1&requireTotalCount=true`;
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(30000) });
      if (r.status >= 400) { ultimo = `HTTP ${r.status}`; continue; }
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { ultimo = "nao-json"; continue; }
      const arr = Array.isArray(j) ? j : j.data || [];
      if (!arr.length && !j.totalCount) { ultimo = "json vazio"; continue; }
      const x = arr[0] || {};
      const val = Object.entries(x).find(([k]) => /remunera|salario|liquid|bruto|valor/i.test(k));
      return { url_json: base, total: j.totalCount ?? arr.length, ano: x.ano ?? null, mes: x.mes ?? null,
        tem_valor: !!(val && String(val[1] ?? "").trim() !== ""), situacao: "v2_json", detalhe: Object.keys(x).join(",") };
    } catch (e) { ultimo = (e.cause?.code || e.name || e.message).toString().slice(0, 30); }
  }
  return { url_json: null, total: null, ano: null, mes: null, tem_valor: false, situacao: "sem_v2", detalhe: ultimo };
}

let i = 0, achados = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const r = await sonda(a);
    if (r.situacao === "v2_json") achados++;
    await q(`insert into pi_v2_sonda (cod_ibge,municipio,url_json,total,ano,mes,tem_valor,situacao,detalhe,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set url_json=excluded.url_json,
      total=excluded.total, ano=excluded.ano, mes=excluded.mes, tem_valor=excluded.tem_valor,
      situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, r.url_json, r.total, r.ano, r.mes, r.tem_valor, r.situacao, r.detalhe]);
    if (i % 25 === 0) console.log(`   ${i}/${alvos.length} · ${achados} com /v2 JSON`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.table((await q(`select situacao, count(*) n, count(*) filter (where tem_valor) com_valor,
  sum(total) servidores from pi_v2_sonda group by 1 order by 2 desc`)).rows);
console.table((await q(`select ano, mes, count(*) n from pi_v2_sonda where situacao='v2_json' group by 1,2 order by 3 desc limit 10`)).rows);
await db.end();
