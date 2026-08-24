// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// censo_pi_hosts.mjs — QUEM ATENDE A FOLHA DE CADA MUNICÍPIO DO PIAUÍ, pelos hosts REAIS já lidos.
//
// 🚨 O ERRO QUE ESTE SCRIPT CORRIGE: a primeira sonda do `/v2/servidores.json` chutou o host pelo slug
// (`transparencia.{slug}.pi.gov.br`) e levou 88 ENOTFOUND + 63 timeout — 151 dos 224 "não têm" eram só
// **host inventado**. Concluir "o PI não publica" a partir dali seria concluir do chute, não do dado.
// Aqui os hosts vêm de `site_municipal_links` (204 dos 205 municípios lidos) — [[pnigp-ordem-retorno-resondar-corrigir-criar]].
//
// Faz duas coisas numa passada só:
//   1) sonda `/v2/servidores.json` em CADA host real (o layout DevExpress que tem remuneração);
//   2) classifica o host por família de ERP — CR2, Fiorilli, KDS, adtrcloud, layoutsistemas, contracheque.online…
//      porque para várias dessas já existe coletor no repo e a família decide o caminho, não o município.
//
// Uso: node scripts/censo_pi_hosts.mjs   ·   CONC=16   ·   UFA=PI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 16);
const UFA = process.env.UFA || "PI";
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json,text/html", "x-requested-with": "XMLHttpRequest" };

// família de ERP pelo host — o rótulo do portal mente, o host não ([[pnigp-fornecedor-e-host-nao-erp]])
const FAMILIAS = [
  [/cr2\.co|portalcr2|cr2transparencia|cr2site/i, "cr2"],
  [/dcfiorilli|fiorilli/i, "fiorilli"],
  [/portaldocontribuinte|\bkds\b/i, "kds"],
  [/adtrcloud/i, "adtr"],
  [/layoutsistemas|layoutonline/i, "layout"],
  [/contracheque\.online/i, "contracheque-online"],
  [/itransparencia/i, "itransparencia"],
  [/portalfacil/i, "portalfacil"],
  [/elotech/i, "elotech"],
  [/betha/i, "betha"],
  [/ipm|atende\.net/i, "ipm"],
  [/publicsoft|smarapd/i, "smarapd"],
  [/memory|ilai/i, "memory"],
  [/govbr|pronim/i, "govbr"],
  [/instarmidia|instar/i, "instar"],
  [/radardatransparencia|radar\.tce|atricon|portaltransparencia\.gov\.br|\.leg\.br/i, "IGNORAR"],
];
const familia = (h) => (FAMILIAS.find(([re]) => re.test(h)) || [, null])[1];

await q(`create table if not exists pi_host_censo (
  cod_ibge text, municipio text, host text, familia text,
  v2_json boolean default false, v2_total int, v2_comp text,
  detalhe text, em timestamptz default now(), primary key (cod_ibge, host))`);

const rows = (await q(`select m.cod_ibge, m.nome municipio,
    array_agg(distinct split_part(split_part(split_part(l,'|',2),'//',2),'/',1)) hosts
  from municipios_br m join site_municipal_links s using (cod_ibge), jsonb_array_elements_text(s.links) l
  where m.uf=$1 group by 1,2 order by 2`, [UFA])).rows;
console.log(`[censo-${UFA}] ${rows.length} municípios com site lido`);

async function testaV2(host) {
  for (const esq of ["https", "http"]) {
    const u = `${esq}://${host}/v2/servidores.json?skip=0&take=1&requireTotalCount=true`;
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(12000) });
      if (r.status >= 400) { if (esq === "http") return { det: `HTTP ${r.status}` }; continue; }
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { if (esq === "http") return { det: "nao-json" }; continue; }
      const arr = Array.isArray(j) ? j : j.data || [];
      const x = arr[0] || {};
      // 🚨 só conta como achado se veio LINHA com remuneração — 200 não prova ([[pnigp-sonda-soft404-falso-positivo]])
      const val = Object.entries(x).find(([k]) => /remunera|salario|liquid|bruto|valor/i.test(k));
      if (!val || String(val[1] ?? "").trim() === "") { if (esq === "http") return { det: "json sem valor" }; continue; }
      return { ok: true, total: j.totalCount ?? arr.length, comp: `${x.mes ?? "?"}/${x.ano ?? "?"}` };
    } catch (e) { if (esq === "http") return { det: (e.cause?.code || e.name || e.message).toString().slice(0, 26) }; }
  }
  return { det: "sem resposta" };
}

let i = 0, achados = 0;
async function trab() {
  while (i < rows.length) {
    const m = rows[i++];
    const hosts = m.hosts.filter((h) => h && !h.includes(" ") && familia(h) !== "IGNORAR");
    for (const h of hosts) {
      const f = familia(h);
      // só vale sondar /v2 em host do próprio município (o CMS estadual mora em .pi.gov.br)
      const r = /\.pi\.gov\.br|\.gov\.br/i.test(h) ? await testaV2(h) : { det: "host de fornecedor" };
      if (r.ok) achados++;
      await q(`insert into pi_host_censo (cod_ibge,municipio,host,familia,v2_json,v2_total,v2_comp,detalhe,em)
        values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge,host) do update set familia=excluded.familia,
        v2_json=excluded.v2_json, v2_total=excluded.v2_total, v2_comp=excluded.v2_comp, detalhe=excluded.detalhe, em=now()`,
        [m.cod_ibge, m.municipio, h, f, !!r.ok, r.total || null, r.comp || null, r.det || null]);
    }
    if (i % 25 === 0) console.log(`   ${i}/${rows.length} · ${achados} hosts com /v2 e valor`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log("\n── municípios com /v2 JSON (com remuneração):");
console.table((await q(`select count(distinct cod_ibge) municipios, sum(v2_total) servidores from pi_host_censo where v2_json`)).rows);
console.log("── famílias de ERP no PI (municípios distintos por família):");
console.table((await q(`select coalesce(familia,'(desconhecida)') familia, count(distinct cod_ibge) municipios
  from pi_host_censo group by 1 order by 2 desc limit 20`)).rows);
await db.end();
